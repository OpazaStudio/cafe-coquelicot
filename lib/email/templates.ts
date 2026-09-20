export const NAME_PLACEHOLDER = "{{nom}}";
export const NUMBER_PLACEHOLDER = "{{numero}}";

export type TemplateVars = Record<string, string>;

export type EmailTemplates = {
  ackSubject: string;
  ackBody: string;
  ackSignature: string;
  shopSubject: string;
  shopHeading: string;
  orderAckSubject: string;
  orderAckBody: string;
  orderAckSignature: string;
  orderShopSubject: string;
  orderShopHeading: string;
};

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  ackSubject: "On a bien reçu votre message ✿",
  ackBody: `Bonjour ${NAME_PLACEHOLDER},

Merci pour votre message — on l'a bien reçu et on vous répond au plus vite.`,
  ackSignature: `À très vite,
L'équipe Coquelicot 🌺`,
  shopSubject: `Nouveau message du site — ${NAME_PLACEHOLDER}`,
  shopHeading: "Nouveau message du site",
  orderAckSubject: `Votre commande ${NUMBER_PLACEHOLDER} est confirmée ✿`,
  orderAckBody: `Bonjour ${NAME_PLACEHOLDER},

Merci pour votre commande — nous l'avons bien reçue et nous la préparons avec soin.
Vous trouverez le récapitulatif ci-dessous.`,
  orderAckSignature: `À très vite,
L'équipe Coquelicot 🌺`,
  orderShopSubject: `Nouvelle commande ${NUMBER_PLACEHOLDER} — ${NAME_PLACEHOLDER}`,
  orderShopHeading: "Nouvelle commande",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export function fillTextVars(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => vars[key] ?? match);
}

export function fillHtmlVars(template: string, vars: TemplateVars): string {
  const escaped: TemplateVars = {};
  for (const [key, value] of Object.entries(vars)) escaped[key] = escapeHtml(value);
  return fillTextVars(escapeHtml(template), escaped);
}

export function paragraphsHtmlVars(
  template: string,
  vars: TemplateVars,
  style = "margin:0 0 14px;",
): string {
  return fillHtmlVars(template, vars)
    .split(/\n{2,}/)
    .map((block) => `<p style="${style}">${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function fillText(template: string, name: string): string {
  return fillTextVars(template, { nom: name });
}

export function fillHtml(template: string, name: string): string {
  return fillHtmlVars(template, { nom: name });
}

export function paragraphsHtml(
  template: string,
  name: string,
  style = "margin:0 0 14px;",
): string {
  return paragraphsHtmlVars(template, { nom: name }, style);
}
