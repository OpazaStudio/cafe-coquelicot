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
import { findAdminByEmail } from "@/lib/db/admin-users";
import type { AdminUserRow } from "@/lib/db/schema";

export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  return decryptSession(store.get(SESSION_COOKIE)?.value);
});

export async function verifySession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
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
