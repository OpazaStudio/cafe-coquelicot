import { describe, expect, it } from "vitest";
import {
  buildAckEmail,
  buildShopEmail,
  escapeHtml,
  HONEYPOT_FIELD,
  parseContactForm,
} from "@/lib/email/contact";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const VALID = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  phone: "06 12 34 56 78",
  message: "Bonjour, je cherche un bouquet pour un mariage.",
};

describe("parseContactForm", () => {
  it("accepte une saisie valide et applique trim()", () => {
    const res = parseContactForm(fd({ ...VALID, name: "  Camille Martin  " }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe("Camille Martin");
      expect(res.data.email).toBe("camille@exemple.fr");
    }
  });

  it("traite un honeypot rempli comme du spam", () => {
    const res = parseContactForm(fd({ ...VALID, [HONEYPOT_FIELD]: "http://spam" }));
    expect(res).toEqual({ ok: false, reason: "spam" });
  });

  it("rejette un email invalide avec le bon message", () => {
    const res = parseContactForm(fd({ ...VALID, email: "pas-un-email" }));
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === "invalid") {
      expect(res.message).toBe("Adresse email invalide.");
    } else {
      throw new Error("attendu: échec de validation");
    }
  });

  it("rejette un nom vide", () => {
    const res = parseContactForm(fd({ ...VALID, name: "   " }));
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === "invalid") {
      expect(res.message).toBe("Votre nom est requis.");
    }
  });

  it("rejette un téléphone trop court", () => {
    expect(parseContactForm(fd({ ...VALID, phone: "123" })).ok).toBe(false);
  });

  it("rejette un message vide", () => {
    expect(parseContactForm(fd({ ...VALID, message: "   " })).ok).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("échappe les caractères dangereux", () => {
    expect(escapeHtml(`<script>alert("x")&'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;",
    );
  });
});

describe("buildShopEmail", () => {
  it("reprend les champs et n'injecte jamais le HTML brut du visiteur", () => {
    const mail = buildShopEmail({
      name: "<b>Eve</b>",
      email: "eve@exemple.fr",
      phone: "0600000000",
      message: "Ligne 1\n<script>",
    });
    expect(mail.text).toContain("eve@exemple.fr");
    expect(mail.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Ligne 1<br>"); // retours à la ligne convertis
  });
});

describe("buildAckEmail", () => {
  it("personnalise et échappe le nom dans le HTML", () => {
    const mail = buildAckEmail("<x>");
    expect(mail.text).toContain("Bonjour <x>,");
    expect(mail.html).toContain("Bonjour &lt;x&gt;,");
    expect(mail.html).not.toContain("Bonjour <x>");
  });
});
