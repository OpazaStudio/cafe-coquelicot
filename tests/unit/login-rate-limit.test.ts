// @vitest-environment node
// Le back-office n'a qu'un compte, à l'adresse connue : sans plafond, le mot
// de passe est attaquable par force brute à débit illimité.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.9" });
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { login } from "@/app/(admin)/admin/login/actions";
import { LOGIN_ATTEMPT_LIMIT } from "@/lib/rate-limit";

async function loginOk(): Promise<"redirected" | "refused"> {
  const fd = new FormData();
  fd.set("email", process.env.ADMIN_EMAIL!);
  fd.set("password", "test-password");
  try {
    await login(undefined, fd);
    return "refused";
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") return "redirected";
    throw e;
  }
}

function form(password: string): FormData {
  const fd = new FormData();
  fd.set("email", process.env.ADMIN_EMAIL!);
  fd.set("password", password);
  return fd;
}

beforeEach(() => {
  requestHeaders.set("x-forwarded-for", `203.0.113.${Math.floor(1 + Date.now() % 200)}`);
});

describe("login — plafond de tentatives", () => {
  it("bloque après LOGIN_ATTEMPT_LIMIT échecs depuis la même IP", async () => {
    requestHeaders.set("x-forwarded-for", "198.51.100.1");
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) {
      const res = await login(undefined, form("mauvais"));
      expect(res?.error).toBe("Identifiants incorrects.");
    }
    const blocked = await login(undefined, form("mauvais"));
    expect(blocked?.error).toMatch(/trop de tentatives/i);
  });

  it("ne bloque pas une autre IP", async () => {
    requestHeaders.set("x-forwarded-for", "198.51.100.2");
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) {
      await login(undefined, form("mauvais"));
    }
    requestHeaders.set("x-forwarded-for", "198.51.100.3");
    const res = await login(undefined, form("mauvais"));
    expect(res?.error).toBe("Identifiants incorrects.");
  });

  // Sinon l'admin se verrouille lui-même en se reconnectant plusieurs fois
  // dans la fenêtre (et les tests e2e, qui se connectent à chaque scénario).
  it("remet le compteur à zéro après une connexion réussie", async () => {
    requestHeaders.set("x-forwarded-for", "198.51.100.7");
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT - 1; i++) {
      await login(undefined, form("mauvais"));
    }
    expect(await loginOk()).toBe("redirected");

    // Le quota est reparti de zéro : de nouveaux essais restent possibles.
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) {
      const res = await login(undefined, form("mauvais"));
      expect(res?.error).toBe("Identifiants incorrects.");
    }
  });

  it("enchaîne des connexions réussies sans jamais bloquer", async () => {
    requestHeaders.set("x-forwarded-for", "198.51.100.8");
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT + 3; i++) {
      expect(await loginOk()).toBe("redirected");
    }
  });

  // Le plafond ne doit pas être contournable en variant l'e-mail soumis :
  // la clé est l'IP, pas le couple (IP, email).
  it("compte les tentatives par IP quel que soit l'e-mail essayé", async () => {
    requestHeaders.set("x-forwarded-for", "198.51.100.4");
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) {
      const fd = new FormData();
      fd.set("email", `essai${i}@exemple.fr`);
      fd.set("password", "mauvais");
      await login(undefined, fd);
    }
    const blocked = await login(undefined, form("mauvais"));
    expect(blocked?.error).toMatch(/trop de tentatives/i);
  });
});
