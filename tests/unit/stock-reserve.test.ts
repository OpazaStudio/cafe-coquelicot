// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  orderItems,
  orders,
  productColors,
  productSizes,
  products,
} from "@/lib/db/schema";
import { CheckoutError, createPendingOrder } from "@/lib/orders";
import { reserveStock } from "@/lib/stock/reserve";
import { createTestDb } from "../helpers/db";
import {
  collectStatements,
  stockWriteOrder,
  type LoggedStatement,
} from "../helpers/sql-log";

const camille = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  fulfillment: "retrait" as const,
};

const REFUS_PETIT_1_EPUISE =
  "Stock insuffisant pour bouquet limite — Petit (1 demandé). " +
  "Retirez-le du panier.";
const REFUS_PETIT_1 =
  "Stock insuffisant pour bouquet limite — Petit (1 demandé). " +
  "Réduisez la quantité ou retirez-le du panier.";
const REFUS_PETIT_2 =
  "Stock insuffisant pour bouquet limite — Petit (2 demandés). " +
  "Réduisez la quantité ou retirez-le du panier.";
const REFUS_EPUISE_1 =
  "Stock insuffisant pour bouquet epuise (1 demandé). " +
  "Retirez-le du panier.";
const SANS_TAILLE = "Ce produit n'a pas de taille (bouquet limite).";

const SIZE_PETIT = "00000000-0000-4000-8000-00000000a001";
const SIZE_GRAND = "00000000-0000-4000-8000-00000000a002";
const PRODUIT_NU = "00000000-0000-4000-8000-000000000001";
const VERROU_A = "00000000-0000-4000-8000-0000000000a1";
const VERROU_B = "00000000-0000-4000-8000-0000000000a2";
const COLOR_ROUGE = "00000000-0000-4000-8000-00000000c001";
const COLOR_BLANC = "00000000-0000-4000-8000-00000000c002";

let db: Db;
beforeEach(async () => {
  db = await createTestDb({ seed: false });
});

type SizeSeed = {
  id: string;
  label: string;
  priceCents?: number;
  stockQty?: number | null;
};

async function addProduct(opts: {
  slug: string;
  stockQty?: number | null;
  sizes?: SizeSeed[];
  colors?: Array<{ id: string; label: string }>;
}): Promise<string> {
  const [row] = await db
    .insert(products)
    .values({
      slug: opts.slug,
      name: `bouquet ${opts.slug}`,
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
      stockQty: opts.stockQty ?? null,
    })
    .returning({ id: products.id });
  if (opts.sizes?.length) {
    await db.insert(productSizes).values(
      opts.sizes.map((s, i) => ({
        id: s.id,
        productId: row.id,
        label: s.label,
        priceCents: s.priceCents ?? 3000,
        stockQty: s.stockQty ?? null,
        sortOrder: i,
      })),
    );
  }
  if (opts.colors?.length) {
    await db.insert(productColors).values(
      opts.colors.map((c, i) => ({
        id: c.id,
        productId: row.id,
        label: c.label,
        sortOrder: i,
      })),
    );
  }
  return row.id;
}

async function countOrders(d: Db): Promise<number> {
  return (await d.select({ id: orders.id }).from(orders)).length;
}

async function countItems(d: Db): Promise<number> {
  return (await d.select({ id: orderItems.id }).from(orderItems)).length;
}

async function stockOf(d: Db, sizeId: string): Promise<number | null> {
  const [row] = await d
    .select({ stockQty: productSizes.stockQty })
    .from(productSizes)
    .where(eq(productSizes.id, sizeId));
  return row.stockQty;
}

async function productStockOf(d: Db, productId: string): Promise<number | null> {
  const [row] = await d
    .select({ stockQty: products.stockQty })
    .from(products)
    .where(eq(products.id, productId));
  return row.stockQty;
}

async function refusalOf(attempt: Promise<unknown>): Promise<Error> {
  const raised = await attempt.then(
    () => null,
    (err: unknown) => err,
  );
  expect(raised).toBeInstanceOf(CheckoutError);
  return raised as Error;
}

function deactivatingDb(real: Db, sizeId: string): Db {
  return new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop === "transaction") {
        return async (...args: Parameters<Db["transaction"]>) => {
          await real
            .update(productSizes)
            .set({ active: false })
            .where(eq(productSizes.id, sizeId));
          return (value as Db["transaction"]).apply(target, args);
        };
      }
      return value.bind(target);
    },
  }) as Db;
}

describe("réservation à la création de la commande (logique, sans concurrence réelle)", () => {
  it("décrémente et laisse passer quand le stock suffit", async () => {
    await addProduct({
      slug: "limite",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 3 }],
    });

    const { items } = await createPendingOrder(db, camille, [
      { slug: "limite", sizeId: SIZE_PETIT, qty: 2 },
    ]);

    expect(await stockOf(db, SIZE_PETIT)).toBe(1);
    expect(await countOrders(db)).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].stockReservedQty).toBe(2);
    expect(items[0].stockReservedSizeId).toBe(SIZE_PETIT);
    expect(items[0].stockReservedProductId).toBeNull();
  });

  it("refuse sans créer ni commande ni ligne quand le stock manque", async () => {
    await addProduct({
      slug: "limite",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 1 }],
    });

    const attempt = () =>
      createPendingOrder(db, camille, [{ slug: "limite", sizeId: SIZE_PETIT, qty: 2 }]);

    await expect(attempt()).rejects.toThrow(CheckoutError);
    expect((await refusalOf(attempt())).message).toBe(REFUS_PETIT_2);
    expect(await countOrders(db)).toBe(0);
    expect(await countItems(db)).toBe(0);
    expect(await stockOf(db, SIZE_PETIT)).toBe(1);
  });

  it("refuse un stock à 0", async () => {
    await addProduct({
      slug: "limite",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 0 }],
    });

    const refused = await refusalOf(
      createPendingOrder(db, camille, [{ slug: "limite", sizeId: SIZE_PETIT, qty: 1 }]),
    );

    expect(refused.message).toBe(REFUS_PETIT_1_EPUISE);
    expect(await stockOf(db, SIZE_PETIT)).toBe(0);
    expect(await countOrders(db)).toBe(0);
  });

  it("accepte une taille illimitée et la laisse à NULL", async () => {
    await addProduct({
      slug: "libre",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: null }],
    });

    const { items } = await createPendingOrder(db, camille, [
      { slug: "libre", sizeId: SIZE_PETIT, qty: 7 },
    ]);

    expect(await stockOf(db, SIZE_PETIT)).toBeNull();
    expect(await countOrders(db)).toBe(1);
    expect(items[0].stockReservedQty).toBe(0);
  });

  it("décrémente le compteur produit quand le produit n'a pas de taille", async () => {
    const productId = await addProduct({ slug: "nu", stockQty: 4 });

    const { items } = await createPendingOrder(db, camille, [{ slug: "nu", qty: 3 }]);

    expect(await productStockOf(db, productId)).toBe(1);
    expect(items[0].stockReservedQty).toBe(3);
    expect(items[0].stockReservedSizeId).toBeNull();
    expect(items[0].stockReservedProductId).toBe(productId);
  });

  it("agrège deux coloris de la même taille", async () => {
    await addProduct({
      slug: "limite",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 1 }],
      colors: [
        { id: COLOR_ROUGE, label: "Rouge" },
        { id: COLOR_BLANC, label: "Blanc" },
      ],
    });
    const lines = [
      { slug: "limite", sizeId: SIZE_PETIT, colorId: COLOR_ROUGE, qty: 1 },
      { slug: "limite", sizeId: SIZE_PETIT, colorId: COLOR_BLANC, qty: 1 },
    ];

    const refused = await refusalOf(createPendingOrder(db, camille, lines));

    expect(refused.message).toBe(REFUS_PETIT_2);
    expect(await stockOf(db, SIZE_PETIT)).toBe(1);
    expect(await countOrders(db)).toBe(0);

    await db.update(productSizes).set({ stockQty: 2 }).where(eq(productSizes.id, SIZE_PETIT));
    const { items } = await createPendingOrder(db, camille, lines);

    expect(await stockOf(db, SIZE_PETIT)).toBe(0);
    const byColor = [...items].sort((a, b) =>
      (a.colorLabelSnapshot ?? "").localeCompare(b.colorLabelSnapshot ?? ""),
    );
    expect(byColor.map((i) => [i.colorLabelSnapshot, i.stockReservedQty])).toEqual([
      ["Blanc", 1],
      ["Rouge", 1],
    ]);
    expect(byColor.map((i) => i.stockReservedSizeId)).toEqual([SIZE_PETIT, SIZE_PETIT]);
  });

  it("rollback complet si une seule ligne échoue", async () => {
    await addProduct({
      slug: "dispo",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 5 }],
    });
    const epuiseId = await addProduct({ slug: "epuise", stockQty: 0 });

    const refused = await refusalOf(
      createPendingOrder(db, camille, [
        { slug: "dispo", sizeId: SIZE_PETIT, qty: 1 },
        { slug: "epuise", qty: 1 },
      ]),
    );

    expect(refused.message).toBe(REFUS_EPUISE_1);
    expect(await stockOf(db, SIZE_PETIT)).toBe(5);
    expect(await productStockOf(db, epuiseId)).toBe(0);
    expect(await countOrders(db)).toBe(0);
    expect(await countItems(db)).toBe(0);
  });

  it("n'écrit les colonnes de réservation que si un décrément a eu lieu", async () => {
    await addProduct({
      slug: "libre",
      sizes: [{ id: SIZE_GRAND, label: "Grand", stockQty: null }],
    });
    await addProduct({ slug: "nu-libre", stockQty: null });

    const { items } = await createPendingOrder(db, camille, [
      { slug: "libre", sizeId: SIZE_GRAND, qty: 2 },
      { slug: "nu-libre", qty: 3 },
    ]);

    expect(
      items.map((i) => [i.stockReservedQty, i.stockReservedSizeId, i.stockReservedProductId]),
    ).toEqual([
      [0, null, null],
      [0, null, null],
    ]);
    expect(await stockOf(db, SIZE_GRAND)).toBeNull();
  });

  it("refuse sans retomber sur le compteur produit quand toutes les tailles sont désactivées", async () => {
    const productId = await addProduct({
      slug: "limite",
      stockQty: 7,
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 2 }],
    });
    await db.update(productSizes).set({ active: false }).where(eq(productSizes.id, SIZE_PETIT));

    const refused = await createPendingOrder(db, camille, [
      { slug: "limite", sizeId: SIZE_PETIT, qty: 3 },
    ]).then(
      () => null,
      (err: unknown) => err,
    );

    expect(await productStockOf(db, productId)).toBe(7);
    expect(await stockOf(db, SIZE_PETIT)).toBe(2);
    expect(await countOrders(db)).toBe(0);
    expect(refused).toBeInstanceOf(CheckoutError);
    expect((refused as Error).message).toBe(SANS_TAILLE);
  });

  it("refuse une taille désactivée entre la lecture et la transaction", async () => {
    await addProduct({
      slug: "limite",
      sizes: [{ id: SIZE_PETIT, label: "Petit", stockQty: 5 }],
    });

    const refused = await refusalOf(
      createPendingOrder(deactivatingDb(db, SIZE_PETIT), camille, [
        { slug: "limite", sizeId: SIZE_PETIT, qty: 1 },
      ]),
    );

    expect(refused.message).toBe(REFUS_PETIT_1);
    expect(await stockOf(db, SIZE_PETIT)).toBe(5);
    expect(await countOrders(db)).toBe(0);
  });
});

describe("ordre de verrouillage des décréments (logique, sans concurrence réelle)", () => {
  it("décrémente les clés dans l'ordre trié, quel que soit l'ordre des lignes", async () => {
    const statements: LoggedStatement[] = [];
    db = await createTestDb({ seed: false, logger: collectStatements(statements) });
    await db.insert(products).values({
      id: PRODUIT_NU,
      slug: "nu",
      name: "bouquet nu",
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
      stockQty: 5,
    });
    const [avecTailles] = await db
      .insert(products)
      .values({
        slug: "limite",
        name: "bouquet limite",
        description: "Édition limitée.",
        priceCents: 4000,
        category: "frais",
      })
      .returning({ id: products.id });
    await db.insert(productSizes).values([
      {
        id: VERROU_A,
        productId: avecTailles.id,
        label: "Petit",
        priceCents: 3000,
        stockQty: 5,
        sortOrder: 0,
      },
      {
        id: VERROU_B,
        productId: avecTailles.id,
        label: "Grand",
        priceCents: 4000,
        stockQty: 5,
        sortOrder: 1,
      },
    ]);
    expect([PRODUIT_NU < VERROU_A, VERROU_A < VERROU_B]).toEqual([true, true]);

    statements.length = 0;
    await db.transaction((tx) =>
      reserveStock(tx, [
        {
          productId: PRODUIT_NU,
          sizeId: null,
          qty: 1,
          productName: "bouquet nu",
          sizeLabel: null,
        },
        {
          productId: avecTailles.id,
          sizeId: VERROU_B,
          qty: 1,
          productName: "bouquet limite",
          sizeLabel: "Grand",
        },
        {
          productId: avecTailles.id,
          sizeId: VERROU_A,
          qty: 1,
          productName: "bouquet limite",
          sizeLabel: "Petit",
        },
      ]),
    );

    expect(
      stockWriteOrder(statements, [PRODUIT_NU, VERROU_A, VERROU_B]),
      "reserveStock a décrémenté hors de l'ordre de `compareStockKeys` : deux paniers " +
        "concurrents prennent alors leurs verrous en sens inverse et s'interbloquent " +
        "(40P01). Garder le `.sort(compareStockKeys)` avant la boucle d'UPDATE.",
    ).toEqual([
      `product_sizes:${VERROU_A}`,
      `product_sizes:${VERROU_B}`,
      `products:${PRODUIT_NU}`,
    ]);
  });
});
