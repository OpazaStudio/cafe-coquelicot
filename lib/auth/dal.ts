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
  type SessionPayload,
} from "./session";

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  return decryptSession(store.get(SESSION_COOKIE)?.value);
});

export async function verifySession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}

export async function checkCredentials(
  email: string,
  password: string,
): Promise<boolean> {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedEmail || !hash) return false;
  // bcrypt.compare systématique (pas de court-circuit sur l'email → timing constant).
  const passwordOk = await bcrypt.compare(password, hash);
  const emailOk = email.trim().toLowerCase() === expectedEmail.toLowerCase();
  return passwordOk && emailOk;
}

export async function createSession(email: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encryptSession({ email }, expiresAt);
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
