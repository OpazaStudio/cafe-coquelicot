// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { products, productSizes } from "@/lib/db/schema";
import {
  getProductWithVariants,
  listProductsForAdmin,
  queryActiveProducts,
} from "@/lib/products";
import { createTestDb } from "../helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

async function solanaId() {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, "solana"));
  return row.id;
}

describe("queryActiveProducts", () => {
  it("produit nu : pas de variantes, prix = base, « dès »", async () => {
    const all = await queryActiveProducts(db);
    const rivage = all.find((p) => p.slug === "rivage")!;
    expect(rivage.sizes).toEqual([]);
    expect(rivage.colors).toEqual([]);
    expect(rivage.priceCents).toBe(4800);
    expect(rivage.price).toBe("dès 48€");
  });

  it("produit variantisé : tailles triées, prix = min, coloris exposés", async () => {
    const all = await queryActiveProducts(db);
    const solana = all.find((p) => p.slug === "solana")!;
    expect(solana.sizes.map((s) => s.label)).toEqual(["Petit", "Moyen", "Grand"]);
    expect(solana.priceCents).toBe(2900); // min des tailles
    expect(solana.price).toBe("dès 29€");
    expect(solana.colors.map((c) => c.label)).toEqual(["Naturel", "Blanc"]);
  });

  it("ignore les variantes inactives en boutique (retombe sur le prix de base)", async () => {
    await db
      .update(productSizes)
      .set({ active: false })
      .where(eq(productSizes.productId, await solanaId()));
    const all = await queryActiveProducts(db);
    const solana = all.find((p) => p.slug === "solana")!;
    expect(solana.sizes).toEqual([]);
    expect(solana.priceCents).toBe(3400); // prix de base de solana
  });
});

describe("getProductWithVariants", () => {
  it("renvoie toutes les variantes (actives ou non) pour l'édition admin", async () => {
    await db
      .update(productSizes)
      .set({ active: false })
      .where(eq(productSizes.label, "Petit"));
    const data = await getProductWithVariants(db, await solanaId());
    expect(data).not.toBeNull();
    expect(data!.sizes.map((s) => s.label)).toEqual(["Petit", "Moyen", "Grand"]);
    expect(data!.sizes.find((s) => s.label === "Petit")!.active).toBe(false);
    expect(data!.colors.map((c) => c.label)).toEqual(["Naturel", "Blanc"]);
  });
});

describe("listProductsForAdmin", () => {
  it("compte les variantes actives et le prix « dès »", async () => {
    const list = await listProductsForAdmin(db);
    const solana = list.find((p) => p.row.slug === "solana")!;
    expect(solana.sizeCount).toBe(3);
    expect(solana.colorCount).toBe(2);
    expect(solana.fromCents).toBe(2900);
    const rivage = list.find((p) => p.row.slug === "rivage")!;
    expect(rivage.sizeCount).toBe(0);
    expect(rivage.fromCents).toBe(4800);
  });
});
