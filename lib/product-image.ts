// Client-safe : aucune clé secrète, uniquement NEXT_PUBLIC_SUPABASE_URL.
// Importable depuis les composants client comme serveur.

export const BUCKET = "coquelicot-bucket";
// 4 Mo : la limite de corps de requête des fonctions serverless Vercel est de
// 4,5 Mo — au-delà, l'upload échouerait côté plateforme avant d'atteindre le
// code, avec une erreur illisible pour l'admin.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export function productImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export type ImageValidation = { ok: true } | { ok: false; error: string };

export function validateImageFile(file: { type: string; size: number }): ImageValidation {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    return { ok: false, error: "Format non supporté — PNG, JPG ou WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image trop lourde — 4 Mo maximum." };
  }
  return { ok: true };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/**
 * Type réel déduit des premiers octets, indépendamment du `Content-Type`
 * annoncé par le client (qui est déclaratif et donc falsifiable).
 * Attend au moins les 12 premiers octets du fichier.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // WebP = conteneur RIFF : "RIFF" <taille sur 4 octets> "WEBP".
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}
