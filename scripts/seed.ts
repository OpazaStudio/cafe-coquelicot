// Seed idempotent du catalogue dans la base pointée par DATABASE_URL (Supabase),
// ou la base locale PGlite si DATABASE_URL est absente.
// Insère les produits du seed ABSENTS (par slug) sans toucher aux existants —
// permet d'ajouter de nouveaux produits (ex. vases) à une base déjà peuplée.
// ⚠ Lancer la migration AVANT : npm run db:migrate && npm run db:seed
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb, seedMissingProducts } = await import("../lib/db/client");
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL absente — seed de la base locale PGlite (.data/pglite).",
    );
  }
  const db = await getDb();
  const inserted = await seedMissingProducts(db);
  console.log(
    inserted.length
      ? `✓ ${inserted.length} produit(s) inséré(s) : ${inserted.join(", ")}.`
      : "Catalogue à jour — aucun produit manquant.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
