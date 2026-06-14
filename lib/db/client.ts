import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { SEED_PRODUCTS, buildChildSeedRows } from "./seed-data";

// Type commun aux deux drivers (postgres-js en prod, PGlite en local/test).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "lib", "db", "migrations");

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Supabase : utiliser l'URL du pooler (transaction mode) → prepare: false.
    const client = postgres(url, { prepare: false });
    return drizzlePostgres(client, { schema });
  }

  // Fallback local : PGlite (Postgres embarqué), migré et seedé automatiquement.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const dataDir = process.env.PGLITE_DATA_DIR ?? ".data/pglite";
  if (dataDir !== ":memory:") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const pglite =
    dataDir === ":memory:" ? new PGlite() : new PGlite(dataDir);
  const db = drizzlePglite(pglite, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await seedIfEmpty(db as unknown as Db);
  console.warn(
    `[db] DATABASE_URL absente — base locale PGlite (${dataDir}). Ne pas utiliser en production.`,
  );
  return db as unknown as Db;
}

export async function seedIfEmpty(db: Db): Promise<boolean> {
  const existing = await db.select({ id: schema.products.id }).from(schema.products).limit(1);
  if (existing.length > 0) return false;
  const inserted = await db
    .insert(schema.products)
    .values(SEED_PRODUCTS)
    .returning({ id: schema.products.id, slug: schema.products.slug });
  const { sizes, colors } = buildChildSeedRows(
    new Map(inserted.map((p) => [p.slug, p.id])),
  );
  if (sizes.length) await db.insert(schema.productSizes).values(sizes);
  if (colors.length) await db.insert(schema.productColors).values(colors);
  return true;
}

// Singleton sur globalThis : survit au HMR de `next dev` et aux multiples
// évaluations de modules par le bundler.
const globalForDb = globalThis as unknown as {
  __coquelicotDb?: Promise<Db>;
};

export function getDb(): Promise<Db> {
  // Ne jamais mémoïser un échec d'initialisation (sinon il colle au process).
  globalForDb.__coquelicotDb ??= createDb().catch((err) => {
    globalForDb.__coquelicotDb = undefined;
    throw err;
  });
  return globalForDb.__coquelicotDb;
}
