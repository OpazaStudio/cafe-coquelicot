// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Le magasin de cookies doit être le MÊME objet à chaque appel de cookies() :
// en renvoyant un littéral neuf, les mocks posés dans un test seraient perdus
// au appel suivant. vi.hoisted le rend disponible au mock, qui est remonté en
// haut du module.
const { cookieStore } = vi.hoisted(() => ({
  cookieStore: {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  } as {
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => cookieStore,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import bcrypt from "bcryptjs";
import { checkCredentials, getCurrentUser } from "@/lib/auth/dal";
import { encryptSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { setAdminPassword } from "@/lib/db/admin-users";

beforeEach(async () => {
  await setAdminPassword(await getDb(), "connexion@exemple.fr", "mot-de-passe-valide");
});

describe("checkCredentials", () => {
  it("renvoie le compte quand l'adresse et le mot de passe correspondent", async () => {
    const user = await checkCredentials("connexion@exemple.fr", "mot-de-passe-valide");
    expect(user?.email).toBe("connexion@exemple.fr");
  });

  it("accepte une adresse saisie avec des majuscules", async () => {
    expect(
      await checkCredentials("Connexion@Exemple.FR", "mot-de-passe-valide"),
    ).not.toBeNull();
  });

  it("refuse un mauvais mot de passe", async () => {
    expect(await checkCredentials("connexion@exemple.fr", "mauvais")).toBeNull();
  });

  it("refuse un compte inexistant", async () => {
    expect(await checkCredentials("inconnu@exemple.fr", "mot-de-passe-valide")).toBeNull();
  });

  // Le temps de réponse ne doit pas trahir l'existence du compte : une mesure
  // de durée réelle serait instable, on vérifie l'invariant structurel.
  it("compare le hash exactement une fois, compte existant ou non", async () => {
    const spy = vi.spyOn(bcrypt, "compare");

    spy.mockClear();
    await checkCredentials("inconnu@exemple.fr", "peu importe");
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    await checkCredentials("connexion@exemple.fr", "mauvais");
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});

async function poserSession(sub: string, emisLe: Date): Promise<void> {
  const token = await encryptSession(
    { sub },
    new Date(Date.now() + 3600_000),
    emisLe,
  );
  cookieStore.get.mockReturnValue({ name: SESSION_COOKIE, value: token });
}

describe("getCurrentUser", () => {
  it("renvoie le compte quand la session est postérieure au dernier changement", async () => {
    const db = await getDb();
    await setAdminPassword(db, "session@exemple.fr", "mot-de-passe-valide");
    const user = await checkCredentials("session@exemple.fr", "mot-de-passe-valide");

    await poserSession(user!.id, new Date());
    expect((await getCurrentUser())?.id).toBe(user!.id);
  });

  it("rejette une session émise avant le dernier changement de mot de passe", async () => {
    const db = await getDb();
    await setAdminPassword(db, "revoque@exemple.fr", "mot-de-passe-valide");
    const user = await checkCredentials("revoque@exemple.fr", "mot-de-passe-valide");

    // Jeton émis une heure avant le changement enregistré à l'instant.
    await poserSession(user!.id, new Date(Date.now() - 3600_000));
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejette une session dont le compte a été supprimé", async () => {
    await poserSession("8f14e45f-ceea-467a-9c4a-4b2d1f0e9a37", new Date());
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejette un identifiant qui n'est pas un uuid", async () => {
    await poserSession("pas-un-uuid", new Date());
    expect(await getCurrentUser()).toBeNull();
  });
});
