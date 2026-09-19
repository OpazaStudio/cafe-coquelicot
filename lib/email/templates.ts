export const NAME_PLACEHOLDER = "{{nom}}";

export type EmailTemplates = {
  ackSubject: string;
  ackBody: string;
  ackSignature: string;
  shopSubject: string;
  shopHeading: string;
};

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  ackSubject: "On a bien reçu votre message ✿",
  ackBody: `Bonjour ${NAME_PLACEHOLDER},

Merci pour votre message — on l'a bien reçu et on vous répond au plus vite.`,
  ackSignature: `À très vite,
L'équipe Coquelicot 🌺`,
  shopSubject: `Nouveau message du site — ${NAME_PLACEHOLDER}`,
  shopHeading: "Nouveau message du site",
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

export function fillText(template: string, name: string): string {
  return template.split(NAME_PLACEHOLDER).join(name);
}

export function fillHtml(template: string, name: string): string {
  return escapeHtml(template).split(NAME_PLACEHOLDER).join(escapeHtml(name));
}

export function paragraphsHtml(
  template: string,
  name: string,
  style = "margin:0 0 14px;",
): string {
  return fillHtml(template, name)
    .split(/\n{2,}/)
    .map((block) => `<p style="${style}">${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
