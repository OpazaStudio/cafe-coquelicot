// Client Resend pour les e-mails transactionnels (formulaire de contact).
// Suit la même logique que `getMondialRelayConfig` : renvoie `null` quand la
// configuration n'est pas fournie, pour que l'appelant décide du comportement.

import { Resend } from "resend";

// Destinataire par défaut (boîte de la boutique), surchargé par CONTACT_TO.
const DEFAULT_TO = "bonjour@coquelicot-lr.fr";
// Sans domaine vérifié (dev/sandbox), Resend n'autorise que cette adresse
// d'expéditeur — à remplacer par une adresse du domaine vérifié en prod
// via CONTACT_FROM (ex. "Coquelicot <contact@coquelicot-lr.fr>").
const DEFAULT_FROM = "Coquelicot <onboarding@resend.dev>";

let client: Resend | null = null;

export type ContactMailer = {
  resend: Resend;
  to: string;
  from: string;
};

/**
 * Client Resend + adresses, ou `null` si `RESEND_API_KEY` n'est pas fournie.
 * Le client est mémoïsé (l'environnement ne change pas au runtime).
 */
export function getMailer(): ContactMailer | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return {
    resend: client,
    to: process.env.CONTACT_TO?.trim() || DEFAULT_TO,
    from: process.env.CONTACT_FROM?.trim() || DEFAULT_FROM,
  };
}
