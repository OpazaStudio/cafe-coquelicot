// Seed du catalogue dans la base pointée par DATABASE_URL (Supabase).
// Usage : npm run db:migrate && npm run db:seed
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb, seedIfEmpty } = await import("../lib/db/client");
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL absente — seed de la base locale PGlite (.data/pglite).",
    );
  }
  const db = await getDb();
  const seeded = await seedIfEmpty(db);
  console.log(
    seeded
      ? "✓ 14 produits insérés."
      : "Des produits existent déjà — rien à faire.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
