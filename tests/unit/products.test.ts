// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orderItems, orders, products, productSizes } from "@/lib/db/schema";
import {
  getProductWithVariants,
  listProductsForAdmin,
  queryActiveProducts,
  queryActiveVases,
  queryProductBySlug,
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

  // Sans cette garde, Postgres lève « invalid input syntax for type uuid »
  // et la page /admin/produits/[id] répond 500 au lieu de 404.
  it("renvoie null (sans throw) quand l'id n'est pas un uuid", async () => {
    expect(await getProductWithVariants(db, "pas-un-uuid")).toBeNull();
  });

  it("renvoie null pour un uuid bien formé mais inconnu", async () => {
    expect(
      await getProductWithVariants(db, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });

  it("compte les unités retenues par les commandes pending, pas par les payées", async () => {
    const id = await solanaId();
    const sizes = await db
      .select({ id: productSizes.id, label: productSizes.label })
      .from(productSizes)
      .where(eq(productSizes.productId, id));
    const petit = sizes.find((s) => s.label === "Petit")!;
    const moyen = sizes.find((s) => s.label === "Moyen")!;
    for (const [i, hold] of [
      { status: "pending" as const, sizeId: petit.id, qty: 1 },
      { status: "pending" as const, sizeId: petit.id, qty: 2 },
      { status: "paid" as const, sizeId: moyen.id, qty: 5 },
    ].entries()) {
      const [order] = await db
        .insert(orders)
        .values({
          number: `CMD-900${i}`,
          status: hold.status,
          customerName: "Camille Martin",
          customerEmail: "camille@exemple.fr",
          fulfillment: "retrait",
          subtotalCents: 1000,
          totalCents: 1000,
        })
        .returning({ id: orders.id });
      await db.insert(orderItems).values({
        orderId: order.id,
        nameSnapshot: "solana",
        priceCentsSnapshot: 1000,
        qty: hold.qty,
        stockReservedQty: hold.qty,
        stockReservedSizeId: hold.sizeId,
      });
    }

    const data = await getProductWithVariants(db, id);
    expect([...data!.pendingBySizeId]).toEqual([[petit.id, 3]]);
    expect(data!.pendingProductQty).toBe(0);
  });

  it("compte aussi les unités retenues sur un produit nu", async () => {
    const [rivage] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "rivage"));
    for (const hold of [
      { status: "pending" as const, qty: 2 },
      { status: "paid" as const, qty: 7 },
    ]) {
      const [order] = await db
        .insert(orders)
        .values({
          number: `CMD-91${hold.qty}`,
          status: hold.status,
          customerName: "Camille Martin",
          customerEmail: "camille@exemple.fr",
          fulfillment: "retrait",
          subtotalCents: 1000,
          totalCents: 1000,
        })
        .returning({ id: orders.id });
      await db.insert(orderItems).values({
        orderId: order.id,
        nameSnapshot: "rivage",
        priceCentsSnapshot: 1000,
        qty: hold.qty,
        stockReservedQty: hold.qty,
        stockReservedProductId: rivage.id,
      });
    }

    const data = await getProductWithVariants(db, rivage.id);
    expect(data!.pendingProductQty).toBe(2);
    expect([...data!.pendingBySizeId]).toEqual([]);
  });
});

describe("queryProductBySlug", () => {
  it("renvoie le produit actif avec ses variantes", async () => {
    const p = await queryProductBySlug(db, "solana");
    expect(p?.sizes.map((s) => s.label)).toEqual(["Petit", "Moyen", "Grand"]);
    expect(p?.colors.map((c) => c.label)).toEqual(["Naturel", "Blanc"]);
  });
  it("renvoie null pour un produit masqué", async () => {
    await db
      .update(products)
      .set({ active: false })
      .where(eq(products.slug, "solana"));
    expect(await queryProductBySlug(db, "solana")).toBeNull();
  });
  it("renvoie null pour un slug inconnu", async () => {
    expect(await queryProductBySlug(db, "inexistant")).toBeNull();
  });
});

describe("queryActiveVases", () => {
  it("ne renvoie que les produits de catégorie vase, actifs", async () => {
    const vases = await queryActiveVases(db);
    expect(vases.map((v) => v.slug).sort()).toEqual(["carene", "ecume", "galet"]);
    expect(vases.every((v) => v.category === "vase")).toBe(true);
    expect(vases.find((v) => v.slug === "galet")!.priceCents).toBe(2400);
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

describe("assemble expose les champs image", () => {
  it("mappe imagePath/imageBgColor du produit", async () => {
    await db
      .update(products)
      .set({ imagePath: "hero.png", imageBgColor: "#faf0e6" })
      .where(eq(products.slug, "rivage"));
    const p = await queryProductBySlug(db, "rivage");
    expect(p?.imagePath).toBe("hero.png");
    expect(p?.imageBgColor).toBe("#faf0e6");
  });

  it("un produit sans image expose null", async () => {
    const p = await queryProductBySlug(db, "rivage");
    expect(p?.imagePath).toBeNull();
    expect(p?.imageBgColor).toBeNull();
  });
});
