// Data Access Layer auth : seule source de vérité pour la session.
// Le proxy ne fait qu'un contrôle optimiste ; chaque page et chaque
// Server Action du back-office repasse par ici.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  decryptSession,
  encryptSession,
  type Session,
} from "./session";
import { getDb } from "@/lib/db/client";
import { findAdminByEmail, findAdminById } from "@/lib/db/admin-users";
import type { AdminUserRow } from "@/lib/db/schema";

export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  return decryptSession(store.get(SESSION_COOKIE)?.value);
});

// Le compte est relu à chaque vérification : un compte supprimé perd l'accès
// immédiatement, et un changement de mot de passe invalide les jetons émis
// avant. Le cache() est posé ICI et pas seulement sur getSession, sinon chaque
// appel de verifySession rouvrirait une requête — produits/actions.ts en fait
// quatre.
const loadSessionUser = cache(
  async (sub: string, iat: number): Promise<AdminUserRow | null> => {
    const user = await findAdminById(await getDb(), sub);
    if (!user) return null;
    // `iat` est en secondes, `passwordChangedAt` en millisecondes : on compare
    // à la seconde. Une session émise dans la même seconde qu'un changement
    // survit, ce qui est sans conséquence — l'action de changement réémet le
    // jeton.
    const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
    return changedAt > iat ? null : user;
  },
);

export const getCurrentUser = cache(async (): Promise<AdminUserRow | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadSessionUser(session.sub, session.iat);
});

export async function verifySession(): Promise<AdminUserRow> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }
  return user;
}

// Hash bcrypt constant, comparé quand aucun compte ne correspond : sans lui,
// l'absence de compte court-circuiterait bcrypt et le temps de réponse
// révélerait quelles adresses existent.
const DUMMY_HASH = "$2b$10$iUG5yEGZqxJOzXvR.K41mOlWen6q8t8q3u0g8C.9KDEwklc8jEVLa";

export async function checkCredentials(
  email: string,
  password: string,
): Promise<AdminUserRow | null> {
  const user = await findAdminByEmail(await getDb(), email);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return passwordOk && user ? user : null;
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encryptSession({ sub: userId }, expiresAt);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
