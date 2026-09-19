import { cache } from "react";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { isSettingKey, parseSettings, type Settings } from "./settings-fields";

export * from "./settings-fields";

export async function querySettings(db: Db): Promise<Settings> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
  return parseSettings(rows);
}

export async function saveSettings(
  db: Db,
  values: Partial<Settings>,
): Promise<void> {
  const rows = Object.entries(values)
    .filter(([key]) => isSettingKey(key))
    .map(([key, value]) => ({ key, value: value ?? "" }));
  if (rows.length === 0) return;
  await db
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`now()` },
    });
}

export const getSettings = cache(async (): Promise<Settings> => {
  return querySettings(await getDb());
});
