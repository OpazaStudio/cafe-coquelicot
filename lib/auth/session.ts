// Session admin : JWT HS256 signé (jose), porté par un cookie httpOnly.
// Module pur (pas d'import next/*) : utilisé par le proxy, la DAL et les tests.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "coquelicot_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Ce qui est signé dans le jeton.
export type SessionPayload = { sub: string };

// Ce que le déchiffrement renvoie : `iat` (date d'émission, posée par
// setIssuedAt) sert à invalider les sessions antérieures à un changement de
// mot de passe.
export type Session = { sub: string; iat: number };

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
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, key(), {
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" && typeof payload.iat === "number"
      ? { sub: payload.sub, iat: payload.iat }
      : null;
  } catch {
    return null;
  }
}
