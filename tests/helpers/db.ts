// Base PGlite en mémoire, neuve pour chaque appel — isolation totale des tests.
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { SEED_PRODUCTS } from "@/lib/db/seed-data";

export async function createTestDb({ seed = true } = {}): Promise<Db> {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations"),
  });
  if (seed) {
    await db.insert(schema.products).values(SEED_PRODUCTS);
  }
  return db as unknown as Db;
}
