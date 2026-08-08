// @vitest-environment node
// L'accusé de réception part vers l'adresse saisie par le visiteur : sans
// plafond, le formulaire est un relais d'e-mail depuis un domaine vérifié
// (réputation d'envoi, phishing).
import { describe, expect, it, vi } from "vitest";

const requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

import { sendContactMessage } from "@/app/contact/actions";
import { CONTACT_MESSAGE_LIMIT } from "@/lib/rate-limit";

function form(email = "camille@exemple.fr"): FormData {
  const fd = new FormData();
  fd.set("name", "Camille Martin");
  fd.set("email", email);
  fd.set("phone", "06 12 34 56 78");
  fd.set("message", "Bonjour, je cherche un bouquet.");
  return fd;
}

describe("sendContactMessage — plafond d'envois", () => {
  it("bloque au-delà de CONTACT_MESSAGE_LIMIT depuis la même IP", async () => {
    requestHeaders.set("x-forwarded-for", "192.0.2.10");
    for (let i = 0; i < CONTACT_MESSAGE_LIMIT; i++) {
      const res = await sendContactMessage(undefined, form());
      expect(res?.status).toBe("success");
    }
    const blocked = await sendContactMessage(undefined, form());
    expect(blocked?.status).toBe("error");
    if (blocked?.status === "error") {
      expect(blocked.message).toMatch(/trop de messages/i);
    }
  });

  it("ne consomme pas le quota sur une saisie invalide", async () => {
    requestHeaders.set("x-forwarded-for", "192.0.2.11");
    for (let i = 0; i < CONTACT_MESSAGE_LIMIT + 2; i++) {
      const fd = form("pas-un-email");
      const res = await sendContactMessage(undefined, fd);
      expect(res?.status).toBe("error");
    }
    // Le quota est intact : un envoi valide passe encore.
    const res = await sendContactMessage(undefined, form());
    expect(res?.status).toBe("success");
  });

  it("compte le quota par IP, pas par adresse e-mail saisie", async () => {
    requestHeaders.set("x-forwarded-for", "192.0.2.12");
    for (let i = 0; i < CONTACT_MESSAGE_LIMIT; i++) {
      await sendContactMessage(undefined, form(`cible${i}@exemple.fr`));
    }
    const blocked = await sendContactMessage(undefined, form("autre@exemple.fr"));
    expect(blocked?.status).toBe("error");
  });
});
