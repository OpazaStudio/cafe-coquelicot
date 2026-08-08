import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, sniffImageType, validateImageFile } from "./product-image";

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg"; // image/jpeg
}

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export async function uploadImage(file: File): Promise<{ path: string }> {
  const v = validateImageFile(file);
  if (!v.ok) throw new Error(v.error);
  // Le `type` d'un File vient de l'en-tête multipart : déclaratif, donc
  // falsifiable. On confronte aux octets réels avant d'écrire dans un bucket
  // public — sans quoi n'importe quel contenu peut être stocké sous une
  // extension d'image, avec un Content-Type d'image forcé.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (sniffImageType(head) !== file.type) {
    throw new Error(
      "Le contenu du fichier ne correspond pas à son format déclaré.",
    );
  }
  const client = getClient();
  if (!client) throw new Error("Stockage d'images non configuré.");
  const path = `${randomUUID()}.${extFor(file.type)}`;
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

export async function deleteImage(path: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.storage.from(BUCKET).remove([path]);
  } catch {
    // best-effort : un orphelin ne doit jamais casser une écriture produit.
  }
}
