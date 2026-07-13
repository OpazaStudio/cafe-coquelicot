"use server";

import { getMailer } from "@/lib/email/resend";
import {
  buildAckEmail,
  buildShopEmail,
  parseContactForm,
} from "@/lib/email/contact";

export type ContactState =
  | { status: "success" }
  | { status: "error"; message: string }
  | undefined;

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

  const mailer = getMailer();
  if (!mailer) {
    // Pas de clé API : erreur explicite en prod, succès simulé en dev (testable).
    if (process.env.NODE_ENV === "production") {
      console.error("[contact] RESEND_API_KEY manquante — message non envoyé");
      return {
        status: "error",
        message:
          "L'envoi est momentanément indisponible. Réessayez plus tard ou écrivez-nous directement.",
      };
    }
    console.warn(
      "[contact] RESEND_API_KEY absente — envoi simulé (dev).",
      { email: input.email },
    );
    return { status: "success" };
  }

  const { resend, to, from } = mailer;

  // 1) Notification boutique — critique. reply-to = visiteur (réponse directe).
  //    On capture aussi les exceptions réseau (le SDK ne renvoie pas toujours
  //    { error } ; un throw doit produire notre message, pas une 500 brute).
  const shop = buildShopEmail(input);
  try {
    const notify = await resend.emails.send({
      from,
      to: [to],
      replyTo: input.email,
      subject: shop.subject,
      text: shop.text,
      html: shop.html,
    });
    if (notify.error) {
      console.error("[contact] échec d'envoi (notification boutique)", notify.error);
      return {
        status: "error",
        message: "L'envoi a échoué. Réessayez dans un instant.",
      };
    }
  } catch (err) {
    console.error("[contact] exception réseau (notification boutique)", err);
    return {
      status: "error",
      message: "L'envoi a échoué. Réessayez dans un instant.",
    };
  }

  // 2) Accusé de réception visiteur — best-effort : un échec ici ne doit pas
  //    bloquer l'utilisateur, le message principal est déjà parti.
  try {
    const ack = buildAckEmail(input.name);
    const ackRes = await resend.emails.send({
      from,
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
