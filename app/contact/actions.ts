"use server";

import { getMailer } from "@/lib/email/resend";
import { getDb } from "@/lib/db/client";
import {
  markSubmissionEmailSent,
  saveContactSubmission,
} from "@/lib/contact-submissions";
import {
  buildAckEmail,
  buildShopEmail,
  DEFAULT_EMAIL_TEMPLATES,
  parseContactForm,
  type EmailTemplates,
} from "@/lib/email/contact";
import { emailTemplatesFromSettings, getSettings } from "@/lib/settings";
import { contactLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export type ContactState =
  | { status: "success"; message?: string }
  | { status: "error"; message: string }
  | undefined;

const RECEIVED_WITHOUT_EMAIL =
  "Votre message est bien arrivé — on vous répond au plus vite.";

const SEND_FAILED = "L'envoi a échoué. Réessayez dans un instant.";

async function loadTemplates(): Promise<EmailTemplates> {
  try {
    return emailTemplatesFromSettings(await getSettings());
  } catch (err) {
    console.error("[contact] lecture des textes d'e-mail impossible", err);
    return DEFAULT_EMAIL_TEMPLATES;
  }
}

export async function sendContactMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseContactForm(formData);
  if (!parsed.ok) {
    // Honeypot rempli → on simule un succès pour ne rien révéler au bot.
    if (parsed.reason === "spam") return { status: "success" };
    return { status: "error", message: parsed.message };
  }
  const input = parsed.data;

  // Plafond APRÈS validation : une saisie invalide ne consomme pas le quota
  // d'un visiteur légitime. L'accusé de réception partant vers l'adresse
  // saisie, la clé est l'IP — changer d'adresse ne relâche pas le compteur.
  const gate = contactLimiter(await getRequestIp());
  if (!gate.ok) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return {
      status: "error",
      message: `Trop de messages envoyés. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""} ou écrivez-nous directement à bonjour@coquelicot-lr.fr.`,
    };
  }

  let submissionId: string | null = null;
  try {
    submissionId = await saveContactSubmission(await getDb(), input);
  } catch (err) {
    console.error("[contact] enregistrement du message impossible", err);
  }

  const mailer = getMailer();
  if (!mailer) {
    // Pas de clé API : erreur explicite en prod, succès simulé en dev (testable).
    if (process.env.NODE_ENV === "production") {
      console.error("[contact] RESEND_API_KEY manquante — message non envoyé");
      if (submissionId) return { status: "success", message: RECEIVED_WITHOUT_EMAIL };
      return {
        status: "error",
        message:
          "L'envoi est momentanément indisponible. Réessayez plus tard ou écrivez-nous directement.",
      };
    }
    // Pas de PII dans les logs : l'adresse du visiteur n'y a rien à faire.
    console.warn("[contact] RESEND_API_KEY absente — envoi simulé (dev).");
    return { status: "success" };
  }

  const { resend, to, from, bcc } = mailer;
  const templates = await loadTemplates();

  // 1) Notification boutique — critique. reply-to = visiteur (réponse directe).
  //    On capture aussi les exceptions réseau (le SDK ne renvoie pas toujours
  //    { error } ; un throw doit produire notre message, pas une 500 brute).
  const shop = buildShopEmail(input, templates);
  let shopEmailSent = false;
  try {
    const notify = await resend.emails.send({
      from,
      bcc,
      to: [to],
      replyTo: input.email,
      subject: shop.subject,
      text: shop.text,
      html: shop.html,
    });
    if (notify.error) {
      console.error("[contact] échec d'envoi (notification boutique)", notify.error);
    } else {
      shopEmailSent = true;
    }
  } catch (err) {
    console.error("[contact] exception réseau (notification boutique)", err);
  }

  if (!shopEmailSent) {
    if (!submissionId) return { status: "error", message: SEND_FAILED };
    return { status: "success", message: RECEIVED_WITHOUT_EMAIL };
  }

  if (submissionId) {
    try {
      await markSubmissionEmailSent(await getDb(), submissionId);
    } catch (err) {
      console.error("[contact] marquage e-mail envoyé impossible", err);
    }
  }

  // 2) Accusé de réception visiteur — best-effort : un échec ici ne doit pas
  //    bloquer l'utilisateur, le message principal est déjà parti.
  try {
    const ack = buildAckEmail(input.name, templates);
    const ackRes = await resend.emails.send({
      from,
      bcc,
      to: [input.email],
      replyTo: to,
      subject: ack.subject,
      text: ack.text,
      html: ack.html,
    });
    if (ackRes.error) {
      console.error("[contact] échec d'envoi (accusé visiteur)", ackRes.error);
    }
  } catch (err) {
    console.error("[contact] exception lors de l'accusé visiteur", err);
  }

  return { status: "success" };
}
