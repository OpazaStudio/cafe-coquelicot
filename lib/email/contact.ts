// Logique pure du formulaire de contact : validation (Zod 4), anti-spam
// honeypot et fabrication des e-mails. Aucun import serveur ici — le module
// est testable en isolation (tests/unit/contact.test.ts) et réutilisé par la
// Server Action `app/contact/actions.ts`.

import * as z from "zod";

export const ContactSchema = z.object({
  name: z.string().trim().min(1, { error: "Votre nom est requis." }).max(120),
  email: z.email({ error: "Adresse email invalide." }),
  phone: z
    .string()
    .trim()
    .regex(/^[\d\s+().\-]{6,25}$/, { error: "Un numéro de téléphone valide est requis." })
    .refine((v) => v.replace(/\D/g, "").length >= 7, {
      error: "Un numéro de téléphone valide est requis.",
    }),
  message: z
    .string()
    .trim()
    .min(1, { error: "Votre message est vide." })
    .max(2000, { error: "Message trop long (2000 caractères max)." }),
});

export type ContactInput = z.infer<typeof ContactSchema>;

/**
 * Nom du champ piège (honeypot). Caché aux humains côté formulaire ; s'il est
 * rempli, c'est un bot. Le composant client duplique ce littéral (`website`)
 * pour ne pas embarquer Zod dans le bundle — garder les deux synchronisés.
 */
export const HONEYPOT_FIELD = "website";

export type ContactParse =
  | { ok: true; data: ContactInput }
  | { ok: false; reason: "spam" }
  | { ok: false; reason: "invalid"; message: string };

/** Lit + valide le FormData. Retourne le motif d'échec sans jeter d'exception. */
export function parseContactForm(formData: FormData): ContactParse {
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim() !== "") {
    return { ok: false, reason: "spam" };
  }

  const parsed = ContactSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? "Saisie invalide.",
    };
  }
  return { ok: true, data: parsed.data };
}

/** Échappe le contenu utilisateur avant injection dans un e-mail HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailContent = { subject: string; text: string; html: string };

const HTML_WRAP = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;line-height:1.55;font-size:15px;">${inner}</div>`;

/** E-mail de notification envoyé à la boutique. */
export function buildShopEmail(input: ContactInput): EmailContent {
  const { name, email, phone, message } = input;
  // Le sujet est un en-tête e-mail : on neutralise tout CR/LF (défense en
  // profondeur contre l'injection d'en-tête), `.trim()` ne le faisant pas.
  const subject = `Nouveau message du site — ${name.replace(/[\r\n]+/g, " ")}`;

  const text = [
    "Nouveau message depuis le formulaire de contact (coquelicot-lr.fr)",
    "",
    `Nom       : ${name}`,
    `Email     : ${email}`,
    `Téléphone : ${phone}`,
    "",
    "Message :",
    message,
  ].join("\n");

  const messageHtml = escapeHtml(message).replace(/\n/g, "<br>");
  const html = HTML_WRAP(
    `<h2 style="margin:0 0 16px;font-size:20px;">Nouveau message du site</h2>` +
      `<table style="border-collapse:collapse;margin-bottom:8px;">` +
      `<tr><td style="padding:4px 20px 4px 0;color:#8a8a8a;">Nom</td><td>${escapeHtml(name)}</td></tr>` +
      `<tr><td style="padding:4px 20px 4px 0;color:#8a8a8a;">Email</td><td><a href="mailto:${escapeHtml(email)}" style="color:#870c20;">${escapeHtml(email)}</a></td></tr>` +
      `<tr><td style="padding:4px 20px 4px 0;color:#8a8a8a;">Téléphone</td><td>${escapeHtml(phone)}</td></tr>` +
      `</table>` +
      `<p style="margin:16px 0 6px;color:#8a8a8a;">Message</p>` +
      `<div style="padding:14px 16px;background:#f6f4ef;border-radius:8px;">${messageHtml}</div>`,
  );

  return { subject, text, html };
}

/** Accusé de réception envoyé au visiteur. */
export function buildAckEmail(name: string): EmailContent {
  const subject = "On a bien reçu votre message ✿";

  const text = [
    `Bonjour ${name},`,
    "",
    "Merci pour votre message — on l'a bien reçu et on vous répond au plus vite.",
    "",
    "À très vite,",
    "L'équipe Coquelicot",
  ].join("\n");

  const html = HTML_WRAP(
    `<p style="margin:0 0 14px;">Bonjour ${escapeHtml(name)},</p>` +
      `<p style="margin:0 0 14px;">Merci pour votre message — on l'a bien reçu et on vous répond au plus vite.</p>` +
      `<p style="margin:0;">À très vite,<br>L'équipe Coquelicot 🌺</p>`,
  );

  return { subject, text, html };
}
