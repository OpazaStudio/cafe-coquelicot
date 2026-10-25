// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, gt } from "drizzle-orm";

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        expire: async () => {
          throw new Error("réseau interdit en test");
        },
        retrieve: async () => {
          throw new Error("réseau interdit en test");
        },
      },
    },
  }),
  getSiteUrl: () => "http://x",
}));
vi.mock("@/lib/stock/release", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stock/release")>();
  return { ...actual, releaseOrderStock: vi.fn(actual.releaseOrderStock) };
});

import { abandonPendingOrder } from "@/lib/checkout/abandon";
import type { Db } from "@/lib/db/client";
import { orderItems, orders, productSizes, products } from "@/lib/db/schema";
import {
  attachStripeSession,
  cancelOrderBySession,
  createPendingOrder,
  reconcilePaidSession,
  updateOrderStatus,
} from "@/lib/orders";
import {
  compareStockKeys,
  reservedStockKey,
  stockKeyToken,
} from "@/lib/stock/key-order";
import { releaseOrderStock } from "@/lib/stock/release";
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

const SIZE_PETIT = "00000000-0000-4000-8000-00000000a001";
const PRODUIT_NU = "00000000-0000-4000-8000-000000000001";
const VERROU_A = "00000000-0000-4000-8000-0000000000a1";
const VERROU_B = "00000000-0000-4000-8000-0000000000a2";
const CREDIT_IMPOSSIBLE = "crédit impossible";
const COMPENSATION_IMPOSSIBLE = "[checkout] compensation impossible";
const STOCK_NON_LIBERE =
  "[checkout] stock non libéré après deux tentatives, commande laissée en attente";

let db: Db;
beforeEach(async () => {
  db = await createTestDb({ seed: false });
  vi.mocked(releaseOrderStock).mockClear();
});

async function addProduct(opts: {
  slug: string;
  stockQty?: number | null;
  sizeStockQty?: number | null;
  withSize?: boolean;
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
  if (opts.withSize) {
    await db.insert(productSizes).values({
      id: SIZE_PETIT,
      productId: row.id,
      label: "Petit",
      priceCents: 3000,
      stockQty: opts.sizeStockQty ?? null,
      sortOrder: 0,
    });
  }
  return row.id;
}

async function limitedOrder(sizeStockQty: number | null, qty: number) {
  const productId = await addProduct({
    slug: "limite",
    stockQty: 7,
    withSize: true,
    sizeStockQty,
  });
  const { order, items } = await createPendingOrder(db, camille, [
    { slug: "limite", sizeId: SIZE_PETIT, qty },
  ]);
  return { productId, order, items };
}

async function sizeStock(): Promise<number | null | undefined> {
  const [row] = await db
    .select({ stockQty: productSizes.stockQty })
    .from(productSizes)
    .where(eq(productSizes.id, SIZE_PETIT));
  return row?.stockQty;
}

async function productStock(productId: string): Promise<number | null> {
  const [row] = await db
    .select({ stockQty: products.stockQty })
    .from(products)
    .where(eq(products.id, productId));
  return row.stockQty;
}

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status, stripeSessionId: orders.stripeSessionId })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row;
}

async function reservationOf(orderId: string) {
  const rows = await db
    .select({
      stockReservedQty: orderItems.stockReservedQty,
      stockReservedSizeId: orderItems.stockReservedSizeId,
      stockReservedProductId: orderItems.stockReservedProductId,
      sizeId: orderItems.sizeId,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return rows;
}

describe("libération (logique, sans concurrence réelle)", () => {
  it("rend le stock sur updateOrderStatus pending -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);
    expect(await sizeStock()).toBe(1);

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await sizeStock()).toBe(3);
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect(await reservationOf(order.id)).toEqual([
      {
        stockReservedQty: 0,
        stockReservedSizeId: SIZE_PETIT,
        stockReservedProductId: null,
        sizeId: SIZE_PETIT,
      },
    ]);
  });

  it("NE rend PAS le stock sur paid -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await sizeStock()).toBe(1);
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(2);
    expect(vi.mocked(releaseOrderStock)).not.toHaveBeenCalled();
  });

  it("NE rend PAS le stock sur preparing -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await sizeStock()).toBe(1);
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(2);
    expect(vi.mocked(releaseOrderStock)).not.toHaveBeenCalled();
  });

  it("rend le stock sur cancelOrderBySession par session", async () => {
    const { order } = await limitedOrder(3, 2);
    await attachStripeSession(db, order.id, "cs_release_session");

    const cancelled = await cancelOrderBySession(db, "cs_release_session");

    expect(cancelled?.id).toBe(order.id);
    expect(await sizeStock()).toBe(3);
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(0);
  });

  it("rend le stock sur cancelOrderBySession par metadata.orderId", async () => {
    const { order } = await limitedOrder(3, 2);

    const cancelled = await cancelOrderBySession(db, "cs_release_meta", order.id);

    expect(cancelled?.id).toBe(order.id);
    expect(await sizeStock()).toBe(3);
    const after = await statusOf(order.id);
    expect(after.status).toBe("cancelled");
    expect(after.stripeSessionId).toBe("cs_release_meta");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(0);
  });

  it("rend le stock sur abandonPendingOrder", async () => {
    const { order } = await limitedOrder(3, 2);

    await abandonPendingOrder(db, order.id);

    expect(await sizeStock()).toBe(3);
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(0);
  });

  it("ne crédite pas deux fois au rejeu", async () => {
    const { order } = await limitedOrder(3, 2);

    await db.transaction(async (tx) => {
      await releaseOrderStock(tx, order.id);
      await releaseOrderStock(tx, order.id);
    });

    expect(await sizeStock()).toBe(3);

    await abandonPendingOrder(db, order.id);
    expect(await cancelOrderBySession(db, "cs_rejeu", order.id)).toBeNull();

    expect(await sizeStock()).toBe(3);
    expect((await statusOf(order.id)).status).toBe("cancelled");
  });

  it("ne crédite pas une commande qui n'avait rien réservé", async () => {
    const { order, items } = await limitedOrder(null, 2);
    expect(items[0].stockReservedQty).toBe(0);
    expect(items[0].stockReservedSizeId).toBeNull();
    await db
      .update(productSizes)
      .set({ stockQty: 5 })
      .where(eq(productSizes.id, SIZE_PETIT));

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await sizeStock()).toBe(5);
    expect((await statusOf(order.id)).status).toBe("cancelled");
  });

  it("ne crédite pas le compteur produit quand la taille a été supprimée", async () => {
    const { productId, order } = await limitedOrder(2, 1);
    expect(await sizeStock()).toBe(1);
    expect(await reservationOf(order.id)).toEqual([
      {
        stockReservedQty: 1,
        stockReservedSizeId: SIZE_PETIT,
        stockReservedProductId: null,
        sizeId: SIZE_PETIT,
      },
    ]);

    await db.delete(productSizes).where(eq(productSizes.id, SIZE_PETIT));
    expect(await reservationOf(order.id)).toEqual([
      {
        stockReservedQty: 1,
        stockReservedSizeId: SIZE_PETIT,
        stockReservedProductId: null,
        sizeId: null,
      },
    ]);

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await productStock(productId)).toBe(7);
    expect(await sizeStock()).toBeUndefined();
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect((await reservationOf(order.id))[0].stockReservedSizeId).toBe(SIZE_PETIT);
  });

  it("crédite une taille désactivée", async () => {
    const { order } = await limitedOrder(2, 1);
    await db
      .update(productSizes)
      .set({ active: false })
      .where(eq(productSizes.id, SIZE_PETIT));

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await sizeStock()).toBe(2);
  });

  it("annule le changement de statut si le crédit échoue", async () => {
    const { order } = await limitedOrder(3, 2);
    vi.mocked(releaseOrderStock).mockRejectedValueOnce(new Error(CREDIT_IMPOSSIBLE));

    await expect(updateOrderStatus(db, order.id, "cancelled")).rejects.toThrow(
      CREDIT_IMPOSSIBLE,
    );

    expect(vi.mocked(releaseOrderStock)).toHaveBeenCalledTimes(1);
    expect(await sizeStock()).toBe(1);
    expect((await statusOf(order.id)).status).toBe("pending");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(2);

    vi.mocked(releaseOrderStock).mockRejectedValueOnce(new Error(CREDIT_IMPOSSIBLE));
    await expect(cancelOrderBySession(db, "cs_echec", order.id)).rejects.toThrow(
      CREDIT_IMPOSSIBLE,
    );

    expect(await sizeStock()).toBe(1);
    const after = await statusOf(order.id);
    expect(after.status).toBe("pending");
    expect(after.stripeSessionId).toBeNull();
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(2);
  });

  it("réessaie une fois et crédite au second essai dans abandonPendingOrder", async () => {
    const { order } = await limitedOrder(3, 2);
    vi.mocked(releaseOrderStock).mockRejectedValueOnce(new Error(CREDIT_IMPOSSIBLE));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(abandonPendingOrder(db, order.id)).resolves.toEqual({
        outcome: "released",
      });
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    expect(vi.mocked(releaseOrderStock)).toHaveBeenCalledTimes(2);
    expect(await sizeStock()).toBe(3);
    expect((await statusOf(order.id)).status).toBe("cancelled");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(0);
  });

  it("laisse la commande pending et journalise la commande et les clés retenues quand les deux essais échouent", async () => {
    const { order, items } = await limitedOrder(3, 2);
    vi.mocked(releaseOrderStock)
      .mockRejectedValueOnce(new Error(CREDIT_IMPOSSIBLE))
      .mockRejectedValueOnce(new Error(CREDIT_IMPOSSIBLE));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(abandonPendingOrder(db, order.id)).resolves.toEqual({
        outcome: "held_release_failed",
        heldKeys: [stockKeyToken({ table: "product_sizes", id: SIZE_PETIT })],
      });
      expect(errors).toHaveBeenCalledWith(STOCK_NON_LIBERE, {
        orderId: order.id,
        stripeSessionId: null,
        reserved: [
          {
            orderItemId: items[0].id,
            stockReservedQty: 2,
            stockReservedSizeId: SIZE_PETIT,
            stockReservedProductId: null,
          },
        ],
        firstCause: expect.objectContaining({ message: CREDIT_IMPOSSIBLE }),
        cause: expect.objectContaining({ message: CREDIT_IMPOSSIBLE }),
      });
      expect(errors).not.toHaveBeenCalledWith(
        COMPENSATION_IMPOSSIBLE,
        expect.anything(),
      );
    } finally {
      errors.mockRestore();
    }

    expect(vi.mocked(releaseOrderStock)).toHaveBeenCalledTimes(2);
    expect(await sizeStock()).toBe(1);
    expect((await statusOf(order.id)).status).toBe("pending");
    expect((await reservationOf(order.id))[0].stockReservedQty).toBe(2);
  });

  it("aucun verdict de reconcilePaidSession n'écrit le stock", async () => {
    const { order } = await limitedOrder(3, 2);
    await attachStripeSession(db, order.id, "cs_verdicts");

    expect((await reconcilePaidSession(db, "cs_verdicts", "pi_1")).outcome).toBe("paid");
    expect(await sizeStock()).toBe(1);

    expect((await reconcilePaidSession(db, "cs_verdicts", "pi_1")).outcome).toBe("replay");
    expect(await sizeStock()).toBe(1);

    expect((await reconcilePaidSession(db, "cs_inconnue", "pi_1")).outcome).toBe("unknown");
    expect(await sizeStock()).toBe(1);

    const [second] = await db
      .insert(products)
      .values({
        slug: "limite-2",
        name: "bouquet limite 2",
        description: "Édition limitée.",
        priceCents: 4000,
        category: "frais",
        stockQty: 4,
      })
      .returning({ id: products.id });
    const { order: held } = await createPendingOrder(db, camille, [
      { slug: "limite-2", qty: 3 },
    ]);
    await attachStripeSession(db, held.id, "cs_annulee_payee");
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, held.id));
    expect(await productStock(second.id)).toBe(1);

    const verdict = await reconcilePaidSession(db, "cs_annulee_payee", "pi_2");

    expect(verdict.outcome).toBe("paid_on_cancelled");
    expect(await productStock(second.id)).toBe(1);
    expect((await reservationOf(held.id))[0].stockReservedQty).toBe(3);
    expect(vi.mocked(releaseOrderStock)).not.toHaveBeenCalled();
  });
});

describe("ordre de verrouillage partagé par la réservation et la libération", () => {
  it("ordonne les tables puis les ids, et place product_sizes avant products", () => {
    const shuffled = [
      { table: "products" as const, id: "b" },
      { table: "product_sizes" as const, id: "b" },
      { table: "products" as const, id: "a" },
      { table: "product_sizes" as const, id: "a" },
    ];

    expect([...shuffled].sort(compareStockKeys)).toEqual([
      { table: "product_sizes", id: "a" },
      { table: "product_sizes", id: "b" },
      { table: "products", id: "a" },
      { table: "products", id: "b" },
    ]);
    expect(compareStockKeys({ table: "products", id: "a" }, { table: "products", id: "a" })).toBe(0);
  });
});

describe("reservedStockKey : table et id sur le même prédicat", () => {
  const SIZE = "00000000-0000-4000-8000-00000000a0ff";
  const PRODUIT = "00000000-0000-4000-8000-00000000b0ff";

  it("la taille l'emporte sur le produit dès qu'elle est présente", () => {
    expect(reservedStockKey(SIZE, PRODUIT)).toEqual({
      table: "product_sizes",
      id: SIZE,
    });
    expect(reservedStockKey(null, PRODUIT)).toEqual({
      table: "products",
      id: PRODUIT,
    });
  });

  it("ne bascule pas de table pour une taille vide tout en gardant son id", () => {
    expect(reservedStockKey("", PRODUIT)).toEqual({
      table: "product_sizes",
      id: "",
    });
  });

  it("rend null quand ni taille ni produit ne sont connus", () => {
    expect(reservedStockKey(null, null)).toBeNull();
  });

  it("le jeton distingue les deux tables à id égal", () => {
    expect(stockKeyToken({ table: "product_sizes", id: SIZE })).not.toBe(
      stockKeyToken({ table: "products", id: SIZE }),
    );
  });
});

describe("ordre de verrouillage des crédits (logique, sans concurrence réelle)", () => {
  it("crédite les clés dans l'ordre trié, quel que soit l'ordre des lignes lues", async () => {
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
    const [order] = await db
      .insert(orders)
      .values({
        number: "CQ-VERROUS",
        status: "pending",
        customerName: camille.name,
        customerEmail: camille.email,
        fulfillment: camille.fulfillment,
        subtotalCents: 3000,
        totalCents: 3000,
      })
      .returning({ id: orders.id });
    for (const line of [
      { sizeId: null, productId: PRODUIT_NU },
      { sizeId: VERROU_B, productId: null },
      { sizeId: VERROU_A, productId: null },
    ]) {
      await db.insert(orderItems).values({
        orderId: order.id,
        nameSnapshot: "bouquet",
        priceCentsSnapshot: 3000,
        qty: 1,
        stockReservedQty: 1,
        stockReservedSizeId: line.sizeId,
        stockReservedProductId: line.productId,
      });
    }

    const read = await db
      .select({
        sizeId: orderItems.stockReservedSizeId,
        productId: orderItems.stockReservedProductId,
      })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), gt(orderItems.stockReservedQty, 0)));
    expect(
      read.map((row) => row.sizeId ?? row.productId),
      "La lecture des réservations rend déjà les clés triées : le test ne mettrait " +
        "alors plus le tri à l'épreuve. Changer l'ordre d'insertion des lignes.",
    ).toEqual([PRODUIT_NU, VERROU_B, VERROU_A]);

    statements.length = 0;
    await db.transaction((tx) => releaseOrderStock(tx, order.id));

    expect(
      stockWriteOrder(statements, [PRODUIT_NU, VERROU_A, VERROU_B]),
      "releaseOrderStock a crédité hors de l'ordre de `compareStockKeys` : une " +
        "libération et une réservation concurrentes prennent alors leurs verrous en " +
        "sens inverse et s'interbloquent (40P01). Garder le `.sort(compareStockKeys)` " +
        "avant la boucle d'UPDATE.",
    ).toEqual([
      `product_sizes:${VERROU_A}`,
      `product_sizes:${VERROU_B}`,
      `products:${PRODUIT_NU}`,
    ]);
  });
});
