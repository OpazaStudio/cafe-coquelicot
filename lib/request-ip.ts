import "server-only";
import { headers } from "next/headers";

/**
 * IP cliente pour le rate limiting.
 *
 * `x-forwarded-for` est falsifiable en général, mais Vercel (et tout reverse
 * proxy correctement configuré) réécrit l'en-tête à la bordure : la valeur
 * reçue par l'app est celle constatée par la plateforme. `x-vercel-forwarded-for`
 * est privilégié quand il existe, la plateforme étant seule à pouvoir le poser.
 *
 * En cas d'absence totale, on retombe sur une clé unique partagée : le plafond
 * devient global plutôt que par IP — dégradation restrictive, jamais permissive.
 */
export async function getRequestIp(): Promise<string> {
  const h = await headers();
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}
