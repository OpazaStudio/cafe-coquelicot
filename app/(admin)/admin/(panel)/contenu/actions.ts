"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { deleteImage } from "@/lib/storage";
import { firstIssue, pageImagePaths } from "@/lib/content/fields";
import { adminHref, isPageSlug, PAGES } from "@/lib/content/registry";
import { queryPageContent, upsertPageContent } from "@/lib/content/server";

export type ContentState = { error: string } | { ok: true } | undefined;

export async function savePageContent(_prev: ContentState, formData: FormData): Promise<ContentState> {
  await verifySession();

  const page = String(formData.get("page") ?? "");
  if (!isPageSlug(page)) return { error: "Page inconnue." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    return { error: "Données illisibles." };
  }

  const { def, strict } = PAGES[page];
  const parsed = strict.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const db = await getDb();
  const previous = await queryPageContent(db, page);
  try {
    await upsertPageContent(db, page, parsed.data);
  } catch (err) {
    console.error("[content] enregistrement impossible", err);
    return { error: "Enregistrement impossible, réessayez dans un instant." };
  }

  const kept = new Set(pageImagePaths(def, parsed.data));
  for (const path of pageImagePaths(def, previous)) {
    if (!kept.has(path)) {
      try {
        await deleteImage(path);
      } catch (err) {
        console.error("[content] suppression image impossible", err);
      }
    }
  }

  for (const path of def.revalidate) revalidatePath(path);
  revalidatePath(adminHref(page));
  return { ok: true };
}
