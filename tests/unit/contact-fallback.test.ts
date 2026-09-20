// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

type SendResult = { error: { message: string } | null };
let sendResult: SendResult = { error: null };
let mailerEnabled = true;
const send = vi.fn(async () => sendResult);

vi.mock("@/lib/email/resend", () => ({
  getMailer: () =>
    mailerEnabled
      ? { resend: { emails: { send } }, to: "boutique@test.local", from: "Test <no@test.local>", bcc: ["copie@test.local"] }
      : null,
}));

import { sendContactMessage } from "@/app/contact/actions";
import { listContactSubmissions } from "@/lib/contact-submissions";
import { getDb } from "@/lib/db/client";
import { HONEYPOT_FIELD } from "@/lib/email/contact";

let ip = 0;

function form(extra: Record<string, string> = {}): FormData {
  requestHeaders.set("x-forwarded-for", `198.51.100.${++ip}`);
  const fd = new FormData();
  fd.set("name", "Camille Martin");
  fd.set("email", "camille@exemple.fr");
  fd.set("phone", "06 12 34 56 78");
  fd.set("message", "Bonjour, je cherche un bouquet.");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function submissions() {
  return listContactSubmissions(await getDb());
}

beforeEach(async () => {
  sendResult = { error: null };
  mailerEnabled = true;
  send.mockClear();
  const db = await getDb();
  const { contactSubmissions } = await import("@/lib/db/schema");
  await db.delete(contactSubmissions);
});

describe("sendContactMessage — filet de sécurité en base", () => {
  it("enregistre le message et le marque notifié quand l'e-mail part", async () => {
    const res = await sendContactMessage(undefined, form());
    expect(res?.status).toBe("success");

    const rows = await submissions();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Camille Martin");
    expect(rows[0].message).toBe("Bonjour, je cherche un bouquet.");
    expect(rows[0].emailSent).toBe(true);
  });

  it("met les adresses bcc du mailer sur la notification et l'accusé", async () => {
    await sendContactMessage(undefined, form());
    expect(send).toHaveBeenCalledTimes(2);
    for (const call of send.mock.calls as unknown as [{ bcc: string[] }][]) {
      expect(call[0].bcc).toEqual(["copie@test.local"]);
    }
  });

  it("confirme la réception et garde emailSent=false si Resend renvoie une erreur", async () => {
    sendResult = { error: { message: "domain not verified" } };

    const res = await sendContactMessage(undefined, form());
    expect(res?.status).toBe("success");
    if (res?.status === "success") {
      expect(res.message).toMatch(/bien arrivé/i);
    }

    const rows = await submissions();
    expect(rows).toHaveLength(1);
    expect(rows[0].emailSent).toBe(false);
  });

  it("confirme la réception quand l'envoi jette une exception réseau", async () => {
    send.mockImplementationOnce(async () => {
      throw new Error("ECONNRESET");
    });

    const res = await sendContactMessage(undefined, form());
    expect(res?.status).toBe("success");

    const rows = await submissions();
    expect(rows).toHaveLength(1);
    expect(rows[0].emailSent).toBe(false);
  });

  it("enregistre même sans mailer configuré", async () => {
    mailerEnabled = false;

    const res = await sendContactMessage(undefined, form());
    expect(res?.status).toBe("success");

    const rows = await submissions();
    expect(rows).toHaveLength(1);
    expect(rows[0].emailSent).toBe(false);
  });

  it("n'enregistre rien quand le honeypot est rempli", async () => {
    const res = await sendContactMessage(undefined, form({ [HONEYPOT_FIELD]: "http://spam" }));
    expect(res?.status).toBe("success");
    expect(await submissions()).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("n'enregistre rien sur une saisie invalide", async () => {
    const res = await sendContactMessage(undefined, form({ email: "pas-un-email" }));
    expect(res?.status).toBe("error");
    expect(await submissions()).toHaveLength(0);
  });

  it("n'enregistre rien au-delà du plafond d'envois", async () => {
    const { CONTACT_MESSAGE_LIMIT } = await import("@/lib/rate-limit");
    requestHeaders.set("x-forwarded-for", "198.51.100.200");
    const fixedIp = () => {
      const fd = form();
      requestHeaders.set("x-forwarded-for", "198.51.100.200");
      return fd;
    };
    for (let i = 0; i < CONTACT_MESSAGE_LIMIT; i++) {
      await sendContactMessage(undefined, fixedIp());
    }
    const blocked = await sendContactMessage(undefined, fixedIp());
    expect(blocked?.status).toBe("error");
    expect(await submissions()).toHaveLength(CONTACT_MESSAGE_LIMIT);
  });
});
