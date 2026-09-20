import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { pageContent } from "@/lib/db/schema";
import { mergeDefaults } from "./fields";
import { PAGES, type ContentFor, type PageSlug } from "./registry";

export async function queryPageContent<P extends PageSlug>(db: Db, page: P): Promise<ContentFor<P>> {
  const { defaults, shape } = PAGES[page];
  let rows: { data: unknown }[];
  try {
    rows = await db
      .select({ data: pageContent.data })
      .from(pageContent)
      .where(eq(pageContent.page, page))
      .limit(1);
  } catch (err) {
    console.error(`[content] lecture du document « ${page} » impossible, défauts utilisés`, err);
    return defaults as ContentFor<P>;
  }
  if (rows.length === 0) return defaults as ContentFor<P>;
  const parsed = shape.safeParse(mergeDefaults(defaults, rows[0].data));
  if (!parsed.success) {
    console.error(`[content] document « ${page} » illisible, défauts utilisés`, parsed.error.issues[0]);
    return defaults as ContentFor<P>;
  }
  return parsed.data as ContentFor<P>;
}

export const getPageContent = cache(async <P extends PageSlug>(page: P): Promise<ContentFor<P>> => {
  return queryPageContent(await getDb(), page);
});

export async function upsertPageContent(db: Db, page: PageSlug, data: unknown): Promise<void> {
  const value = data as Record<string, unknown>;
  await db
    .insert(pageContent)
    .values({ page, data: value })
    .onConflictDoUpdate({
      target: pageContent.page,
      set: { data: value, updatedAt: sql`now()` },
    });
}
