import { describe, expect, it } from "vitest";
import { buildAckEmail, buildShopEmail } from "@/lib/email/contact";
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplates } from "@/lib/email/templates";
import {
  DEFAULT_SETTINGS,
  emailTemplatesFromSettings,
  EMAIL_SETTING_GROUPS,
  keysForGroups,
  readSettingsForm,
  LEGAL_SETTING_GROUPS,
  parseSettings,
} from "@/lib/settings-fields";

const CUSTOM: EmailTemplates = {
  ...DEFAULT_EMAIL_TEMPLATES,
  ackSubject: "Merci {{nom}} !",
  ackBody: "Coucou {{nom}},\n\nOn revient vers vous vite.",
  ackSignature: "Bises,\nL'atelier",
  shopSubject: "Message de {{nom}}",
  shopHeading: "Nouveau contact",
};

const VISITOR = {
  name: "Camille",
  email: "camille@exemple.fr",
  phone: "06 12 34 56 78",
  message: "Bonjour",
};

describe("buildAckEmail avec des textes personnalisés", () => {
  it("substitue le nom dans l'objet, le corps et la signature", () => {
    const mail = buildAckEmail("Camille", CUSTOM);
    expect(mail.subject).toBe("Merci Camille !");
    expect(mail.text).toBe("Coucou Camille,\n\nOn revient vers vous vite.\n\nBises,\nL'atelier");
    expect(mail.html).toContain("<p style=\"margin:0 0 14px;\">Coucou Camille,</p>");
    expect(mail.html).toContain("Bises,<br>L&#39;atelier");
  });

  it("échappe le nom du visiteur sans double-échapper le gabarit", () => {
    const mail = buildAckEmail('<b>"Eve"</b>', CUSTOM);
    expect(mail.html).toContain("&lt;b&gt;&quot;Eve&quot;&lt;/b&gt;");
    expect(mail.html).not.toContain("&amp;lt;");
    expect(mail.html).not.toContain("<b>");
  });

  it("neutralise les retours à la ligne injectés dans l'objet", () => {
    const mail = buildAckEmail("Eve\r\nBcc: spam@exemple.fr", CUSTOM);
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toBe("Merci Eve Bcc: spam@exemple.fr !");
  });

  it("reproduit le texte d'origine avec les gabarits par défaut", () => {
    expect(buildAckEmail("Camille")).toEqual(buildAckEmail("Camille", DEFAULT_EMAIL_TEMPLATES));
    expect(buildAckEmail("Camille").text).toContain("L'équipe Coquelicot");
  });
});

describe("buildShopEmail avec des textes personnalisés", () => {
  it("utilise l'objet et le titre configurés", () => {
    const mail = buildShopEmail(VISITOR, CUSTOM);
    expect(mail.subject).toBe("Message de Camille");
    expect(mail.text.startsWith("Nouveau contact")).toBe(true);
    expect(mail.html).toContain(">Nouveau contact</h2>");
    expect(mail.html).toContain("camille@exemple.fr");
  });
});

describe("emailTemplatesFromSettings", () => {
  it("retombe sur les textes d'origine quand rien n'est enregistré", () => {
    expect(emailTemplatesFromSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_EMAIL_TEMPLATES);
  });

  it("reprend une valeur enregistrée en base", () => {
    const stored = parseSettings([{ key: "email_ack_subject", value: "Bien reçu !" }]);
    expect(emailTemplatesFromSettings(stored).ackSubject).toBe("Bien reçu !");
    expect(emailTemplatesFromSettings(stored).ackBody).toBe(DEFAULT_EMAIL_TEMPLATES.ackBody);
  });
});

describe("readSettingsForm restreint à un sous-ensemble de clés", () => {
  it("ne renvoie que les clés demandées", () => {
    const fd = new FormData();
    fd.set("email_ack_subject", "  Bien reçu  ");
    const res = readSettingsForm(fd, keysForGroups(EMAIL_SETTING_GROUPS));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.email_ack_subject).toBe("Bien reçu");
    expect(Object.keys(res.data)).toEqual(keysForGroups(EMAIL_SETTING_GROUPS));
    expect(res.data).not.toHaveProperty("siret");
  });

  it("n'inclut aucune clé e-mail quand on enregistre les mentions légales", () => {
    const fd = new FormData();
    fd.set("siret", "123");
    const res = readSettingsForm(fd, keysForGroups(LEGAL_SETTING_GROUPS));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).not.toHaveProperty("email_ack_body");
    expect(res.data).not.toHaveProperty("email_shop_subject");
  });

  it("rejette un corps d'e-mail trop long", () => {
    const fd = new FormData();
    fd.set("email_ack_body", "a".repeat(4001));
    const res = readSettingsForm(fd, keysForGroups(EMAIL_SETTING_GROUPS));
    expect(res.ok).toBe(false);
  });
});
