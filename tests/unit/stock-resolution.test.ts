// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  productColors,
  productImages,
  productSizes,
  products,
  type ProductRow,
  type ProductSizeRow,
} from "@/lib/db/schema";
import { queryActiveProducts, resolveStockKey } from "@/lib/products";
import { createTestDb } from "../helpers/db";

function productRow(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "bouquet",
    name: "bouquet",
    tag: null,
    description: "Un bouquet.",
    descriptionRich: null,
    priceCents: 4000,
    category: "frais",
    badge: null,
    illustrationVariant: 0,
    imagePath: null,
    imageBgColor: null,
    imageFrame: "1:1",
    active: true,
    stockQty: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function sizeRow(over: Partial<ProductSizeRow> = {}): ProductSizeRow {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    productId: "00000000-0000-4000-8000-000000000001",
    label: "Petit",
    priceCents: 3000,
    sortOrder: 0,
    active: true,
    stockQty: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("résolution du stock à deux niveaux", () => {
  const sizes = [
    sizeRow({ id: "00000000-0000-4000-8000-0000000000a1", label: "Petit", stockQty: 3 }),
    sizeRow({
      id: "00000000-0000-4000-8000-0000000000a2",
      label: "Grand",
      priceCents: 5000,
      sortOrder: 1,
      stockQty: 8,
    }),
  ];

  it("le compteur de la taille fait foi quand le produit a des tailles actives", () => {
    const p = productRow({ stockQty: 99 });
    expect(resolveStockKey(p, sizes, sizes[0].id)).toEqual({
      table: "product_sizes",
      id: sizes[0].id,
      stockQty: 3,
    });
    expect(resolveStockKey(p, sizes, sizes[1].id)).toEqual({
      table: "product_sizes",
      id: sizes[1].id,
      stockQty: 8,
    });
  });

  it("retombe sur le compteur produit quand aucune taille n'est active", () => {
    const p = productRow({ stockQty: 4 });
    expect(resolveStockKey(p, [], null)).toEqual({
      table: "products",
      id: p.id,
      stockQty: 4,
    });
  });

  it("un produit nu sans compteur est illimité", () => {
    const p = productRow({ stockQty: null });
    expect(resolveStockKey(p, [], null)).toEqual({
      table: "products",
      id: p.id,
      stockQty: null,
    });
  });

  it("une taille à NULL reste illimitée malgré un compteur produit fini", () => {
    const p = productRow({ stockQty: 5 });
    const unlimited = [sizeRow({ stockQty: null })];
    expect(resolveStockKey(p, unlimited, unlimited[0].id)).toEqual({
      table: "product_sizes",
      id: unlimited[0].id,
      stockQty: null,
    });
  });

  it("refuse une taille d'un autre produit même si elle figure dans la liste", () => {
    const p = productRow({ id: "00000000-0000-4000-8000-000000000002", stockQty: 5 });
    expect(() => resolveStockKey(p, sizes, sizes[0].id)).toThrow(/taille/i);
  });

  it("refuse une taille absente des tailles actives plutôt que de retomber sur le produit", () => {
    const p = productRow({ stockQty: 5 });
    expect(() => resolveStockKey(p, sizes, null)).toThrow(/taille/i);
    expect(() =>
      resolveStockKey(p, sizes, "00000000-0000-4000-8000-0000000000ff"),
    ).toThrow(/taille/i);
  });
});

let db: Db;
beforeEach(async () => {
  db = await createTestDb({ seed: false });
});

type SizeSeed = {
  label: string;
  priceCents: number;
  stockQty?: number | null;
  active?: boolean;
};

async function addProduct(opts: {
  stockQty?: number | null;
  priceCents?: number;
  sizes?: SizeSeed[];
}) {
  const [row] = await db
    .insert(products)
    .values({
      slug: "bouquet-limite",
      name: "bouquet limité",
      description: "Édition limitée.",
      priceCents: opts.priceCents ?? 4000,
      category: "frais",
      stockQty: opts.stockQty ?? null,
    })
    .returning({ id: products.id });
  if (opts.sizes?.length) {
    await db.insert(productSizes).values(
      opts.sizes.map((s, i) => ({
        productId: row.id,
        label: s.label,
        priceCents: s.priceCents,
        stockQty: s.stockQty ?? null,
        active: s.active ?? true,
        sortOrder: i,
      })),
    );
  }
  return row.id;
}

async function shopProduct() {
  const all = await queryActiveProducts(db);
  return all.find((p) => p.slug === "bouquet-limite")!;
}

describe("soldOut dérivé", () => {
  it("une taille à 0 est soldOut, une taille à NULL ne l'est pas", async () => {
    await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 0 },
        { label: "Moyen", priceCents: 4000, stockQty: null },
        { label: "Grand", priceCents: 5000, stockQty: 2 },
      ],
    });
    const p = await shopProduct();
    expect(p.sizes.map((s) => [s.label, s.soldOut])).toEqual([
      ["Petit", true],
      ["Moyen", false],
      ["Grand", false],
    ]);
    expect(p.soldOut).toBe(false);
  });

  it("le produit est soldOut quand toutes ses tailles actives sont à 0", async () => {
    await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 0 },
        { label: "Grand", priceCents: 5000, stockQty: 0 },
      ],
    });
    expect((await shopProduct()).soldOut).toBe(true);
  });

  it("le produit n'est pas soldOut dès qu'une taille active est illimitée", async () => {
    await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 0 },
        { label: "Grand", priceCents: 5000, stockQty: null },
      ],
    });
    expect((await shopProduct()).soldOut).toBe(false);
  });

  it("une taille inactive n'entre pas dans le calcul", async () => {
    await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 0 },
        { label: "Grand", priceCents: 5000, stockQty: 6, active: false },
      ],
    });
    const p = await shopProduct();
    expect(p.sizes.map((s) => s.label)).toEqual(["Petit"]);
    expect(p.soldOut).toBe(true);
  });

  it("le compteur produit est ignoré quand le produit a des tailles actives", async () => {
    await addProduct({
      stockQty: 0,
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: null }],
    });
    expect((await shopProduct()).soldOut).toBe(false);
  });

  it("un produit nu à 0 est soldOut", async () => {
    await addProduct({ stockQty: 0 });
    expect((await shopProduct()).soldOut).toBe(true);
  });

  it("un produit nu à NULL ou en stock n'est pas soldOut", async () => {
    const id = await addProduct({ stockQty: null });
    expect((await shopProduct()).soldOut).toBe(false);
    await db.update(products).set({ stockQty: 3 }).where(eq(products.id, id));
    expect((await shopProduct()).soldOut).toBe(false);
  });

  it("le prix « dès X » se calcule sur les tailles disponibles", async () => {
    await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 0 },
        { label: "Grand", priceCents: 5000, stockQty: 1 },
      ],
    });
    const p = await shopProduct();
    expect(p.priceCents).toBe(5000);
    expect(p.price).toBe("dès 50€");
  });

  it("retombe sur toutes les tailles quand tout est épuisé", async () => {
    await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 0 },
        { label: "Grand", priceCents: 5000, stockQty: 0 },
      ],
    });
    const p = await shopProduct();
    expect(p.soldOut).toBe(true);
    expect(p.priceCents).toBe(3000);
    expect(p.price).toBe("dès 30€");
  });

  it("n'expose jamais le compteur", async () => {
    const id = await addProduct({
      stockQty: 7351,
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 4217 },
        { label: "Grand", priceCents: 5000, stockQty: 6089 },
      ],
    });
    const [petit] = await db
      .select({ id: productSizes.id })
      .from(productSizes)
      .where(eq(productSizes.productId, id));
    const [naturel] = await db
      .insert(productColors)
      .values({ productId: id, label: "Naturel" })
      .returning({ id: productColors.id });
    await db.update(products).set({ imagePath: `${randomUUID()}.webp` }).where(eq(products.id, id));
    await db.insert(productImages).values([
      {
        productId: id,
        sizeId: petit.id,
        colorId: naturel.id,
        path: `${randomUUID()}.webp`,
        bgColor: "#f4efe6",
        alt: "Le petit",
        sortOrder: 0,
      },
      { productId: id, path: `${randomUUID()}.webp`, sortOrder: 1 },
    ]);
    const p = await shopProduct();
    expect(p.images).toHaveLength(2);
    expect(p.images[0].sizeId).toBe(petit.id);
    expect(p.images[0].colorId).toBe(naturel.id);
    expect(JSON.stringify(p)).not.toMatch(/stockQty|stock_qty/);

    const keys: string[] = [];
    const numbers: number[] = [];
    const strings: string[] = [];
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const walk = (value: unknown) => {
      if (typeof value === "number") numbers.push(value);
      else if (typeof value === "string") strings.push(value.replace(uuid, ""));
      else if (Array.isArray(value)) value.forEach((v) => walk(v));
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
      }
    };
    walk(JSON.parse(JSON.stringify(p)));
    expect(strings).toContain(".webp");
    expect(keys.filter((k) => /stock|qty|quantity|remaining|left/i.test(k))).toEqual([]);
    expect(numbers).not.toContain(7351);
    expect(numbers).not.toContain(4217);
    expect(numbers).not.toContain(6089);
    expect(strings.filter((v) => /7351|4217|6089/.test(v))).toEqual([]);
  });
});

describe("contraintes CHECK de la migration 0016", () => {
  it("refuse un compteur négatif sur products", async () => {
    await expect(addProduct({ stockQty: -1 })).rejects.toMatchObject({
      cause: { constraint: "products_stock_qty_nonneg" },
    });
  });

  it("refuse un compteur négatif sur product_sizes", async () => {
    await expect(
      addProduct({ sizes: [{ label: "Petit", priceCents: 3000, stockQty: -1 }] }),
    ).rejects.toMatchObject({
      cause: { constraint: "product_sizes_stock_qty_nonneg" },
    });
  });

  it("accepte 0 et NULL", async () => {
    await expect(
      addProduct({
        stockQty: 0,
        sizes: [
          { label: "Petit", priceCents: 3000, stockQty: 0 },
          { label: "Grand", priceCents: 5000, stockQty: null },
        ],
      }),
    ).resolves.toBeTruthy();
  });
});
