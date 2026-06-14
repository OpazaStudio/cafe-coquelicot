// Base PGlite en mémoire, neuve pour chaque appel — isolation totale des tests.
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { SEED_PRODUCTS, buildChildSeedRows } from "@/lib/db/seed-data";

export async function createTestDb({ seed = true } = {}): Promise<Db> {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations"),
  });
  if (seed) {
    const inserted = await db
      .insert(schema.products)
      .values(SEED_PRODUCTS)
      .returning({ id: schema.products.id, slug: schema.products.slug });
    const { sizes, colors } = buildChildSeedRows(
      new Map(inserted.map((p) => [p.slug, p.id])),
    );
    if (sizes.length) await db.insert(schema.productSizes).values(sizes);
    if (colors.length) await db.insert(schema.productColors).values(colors);
  }
  return db as unknown as Db;
}
