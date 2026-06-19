// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { seedMissingProducts } from "@/lib/db/client";
import { products, productColors, productSizes } from "@/lib/db/schema";
import { SEED_PRODUCTS } from "@/lib/db/seed-data";
import { createTestDb } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  // Base migrée mais NON seedée : on contrôle le sous-ensemble inséré.
  db = await createTestDb({ seed: false });
});

describe("seedMissingProducts", () => {
  it("insère uniquement les produits absents (vases) sans toucher aux existants", async () => {
    await db
      .insert(products)
      .values(SEED_PRODUCTS.filter((p) => p.category !== "vase"));

    const inserted = await seedMissingProducts(db);
    expect([...inserted].sort()).toEqual(["carene", "ecume", "galet"]);

    const vases = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.category, "vase"));
    expect(vases.map((v) => v.slug).sort()).toEqual([
      "carene",
      "ecume",
      "galet",
    ]);

    const total = await db.select({ slug: products.slug }).from(products);
    expect(total).toHaveLength(SEED_PRODUCTS.length); // 14 + 3 = 17, aucun doublon
  });

  it("est idempotent : un second appel n'insère rien", async () => {
    await db.insert(products).values(SEED_PRODUCTS);
    expect(await seedMissingProducts(db)).toEqual([]);
  });

  it("réinsère aussi les variantes (tailles/coloris) d'un produit manquant", async () => {
    // Tout sauf solana (qui a 3 tailles + 2 coloris dans le seed).
    await db
      .insert(products)
      .values(SEED_PRODUCTS.filter((p) => p.slug !== "solana"));

    const inserted = await seedMissingProducts(db);
    expect(inserted).toContain("solana");

    const [solana] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "solana"));
    const sizes = await db
      .select({ id: productSizes.id })
      .from(productSizes)
      .where(eq(productSizes.productId, solana.id));
    const colors = await db
      .select({ id: productColors.id })
      .from(productColors)
      .where(eq(productColors.productId, solana.id));
    expect(sizes).toHaveLength(3);
    expect(colors).toHaveLength(2);
  });
});
