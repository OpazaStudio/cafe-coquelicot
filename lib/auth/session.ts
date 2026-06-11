// Session admin : JWT HS256 signé (jose), porté par un cookie httpOnly.
// Module pur (pas d'import next/*) : utilisé par le proxy, la DAL et les tests.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "coquelicot_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export type SessionPayload = { email: string };

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET manquante dans l'environnement.");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(
  payload: SessionPayload,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key());
}

export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, key(), {
      algorithms: ["HS256"],
    });
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
