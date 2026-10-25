// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  expireSessionForCancel: vi.fn(),
  applyPaidSideEffects: vi.fn(),
  revalidatePath: vi.fn(),
  getStripe: vi.fn(() => {
    throw new Error("Stripe réel interdit en test");
  }),
  getMailer: vi.fn(() => null),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({
  verifySession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/stripe-session", () => ({
  expireSessionForCancel: mocks.expireSessionForCancel,
}));
vi.mock("@/lib/orders/paid-side-effects", () => ({
  applyPaidSideEffects: async (_db: unknown, orderId: string) =>
    mocks.applyPaidSideEffects(orderId),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: mocks.getStripe,
  getSiteUrl: () => "http://x",
}));
vi.mock("@/lib/email/resend", () => ({ getMailer: mocks.getMailer }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import type { Db } from "@/lib/db/client";
import { orderItems, orders, productSizes, products } from "@/lib/db/schema";
import { createPendingOrder, updateOrderStatus } from "@/lib/orders";
import { releaseOrderStock, restockableUnits } from "@/lib/stock/release";
import { createTestDb } from "../helpers/db";

let db: Db;
vi.mock("@/lib/db/client", async (orig) => {
  const actual = await orig<typeof import("@/lib/db/client")>();
  return { ...actual, getDb: async () => db };
});

const { changeOrderStatus } = await import(
  "@/app/(admin)/admin/(panel)/commandes/actions"
);
const { StatusActions } = await import(
  "@/app/(admin)/admin/(panel)/commandes/[id]/status-actions"
);
const { default: CommandeDetailPage } = await import(
  "@/app/(admin)/admin/(panel)/commandes/[id]/page"
);

type ElementLike = { type?: unknown; props?: { children?: unknown } };

function statusActionsProps(node: unknown): Record<string, unknown> | null {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = statusActionsProps(child);
      if (found !== null) return found;
    }
    return null;
  }
  const element = node as ElementLike;
  if (element.type === StatusActions) {
    return element.props as Record<string, unknown>;
  }
  return element.props ? statusActionsProps(element.props.children) : null;
}

async function renderedCanRestock(orderId: string): Promise<unknown> {
  const element = await CommandeDetailPage({
    params: Promise.resolve({ id: orderId }),
  } as Parameters<typeof CommandeDetailPage>[0]);
  const props = statusActionsProps(element);
  if (props === null) throw new Error("StatusActions absent de la page");
  return props.canRestock;
}

const SIZE_PETIT = "00000000-0000-4000-8000-00000000c001";
const SLUG = "limite-remise-en-vente";

const camille = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  fulfillment: "retrait" as const,
};

async function limitedOrder(sizeStockQty: number | null, qty: number) {
  const [row] = await db
    .insert(products)
    .values({
      slug: SLUG,
      name: "bouquet limité",
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
      stockQty: null,
    })
    .returning({ id: products.id });
  await db.insert(productSizes).values({
    id: SIZE_PETIT,
    productId: row.id,
    label: "Petit",
    priceCents: 3000,
    stockQty: sizeStockQty,
    sortOrder: 0,
  });
  const { order } = await createPendingOrder(db, camille, [
    { slug: SLUG, sizeId: SIZE_PETIT, qty },
  ]);
  return { productId: row.id, order };
}

async function sizeStock(): Promise<number | null | undefined> {
  const [row] = await db
    .select({ stockQty: productSizes.stockQty })
    .from(productSizes)
    .where(eq(productSizes.id, SIZE_PETIT));
  return row?.stockQty;
}

async function heldUnits(orderId: string): Promise<number> {
  const rows = await db
    .select({ qty: orderItems.stockReservedQty })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return rows.reduce((total, row) => total + row.qty, 0);
}

async function makeSizeUnlimited(): Promise<void> {
  await db
    .update(productSizes)
    .set({ stockQty: null })
    .where(eq(productSizes.id, SIZE_PETIT));
}

async function statusOf(orderId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.status;
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createTestDb({ seed: false });
  mocks.expireSessionForCancel.mockResolvedValue({ outcome: "no_session" });
});

describe("remise en stock à l'annulation depuis le back-office", () => {
  it("ne remet rien en vente par défaut sur paid -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    expect(await sizeStock()).toBe(1);

    const state = await changeOrderStatus(order.id, "cancelled");

    expect(state).toBeUndefined();
    expect(await sizeStock()).toBe(1);
    expect(await heldUnits(order.id)).toBe(2);
    expect(await statusOf(order.id)).toBe("cancelled");
    expect(mocks.expireSessionForCancel).not.toHaveBeenCalled();
  });

  it("remet en vente quand la case est cochée, sur paid -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toEqual({
      ok: "Commande annulée : 2 unités sont remises en stock.",
    });
    expect(await sizeStock()).toBe(3);
    expect(await heldUnits(order.id)).toBe(0);
    expect(await statusOf(order.id)).toBe("cancelled");
    expect(mocks.expireSessionForCancel).not.toHaveBeenCalled();
  });

  it("ignore la case sur preparing -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toBeUndefined();
    expect(await sizeStock()).toBe(1);
    expect(await heldUnits(order.id)).toBe(2);
    expect(await statusOf(order.id)).toBe("cancelled");
  });

  it("ignore la case sur pending -> cancelled", async () => {
    const { order } = await limitedOrder(3, 2);

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toBeUndefined();
    expect(await sizeStock()).toBe(3);
    expect(await heldUnits(order.id)).toBe(0);
    expect(await statusOf(order.id)).toBe("cancelled");
  });

  it("annonce le succès à Céline quand l'unité repart en vente", async () => {
    const { order } = await limitedOrder(1, 1);
    await updateOrderStatus(db, order.id, "paid");
    expect(await sizeStock()).toBe(0);

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toEqual({
      ok: "Commande annulée : 1 unité est remise en stock.",
    });
    expect(await sizeStock()).toBe(1);
  });

  it("reste silencieuse quand la commande payée ne retenait aucune unité", async () => {
    const { order } = await limitedOrder(null, 2);
    await updateOrderStatus(db, order.id, "paid");

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toBeUndefined();
    expect(await sizeStock()).toBeNull();
    expect(await heldUnits(order.id)).toBe(0);
    expect(await statusOf(order.id)).toBe("cancelled");
  });

  it("rend le produit à nouveau achetable sur le catalogue", async () => {
    const { order } = await limitedOrder(1, 1);
    await updateOrderStatus(db, order.id, "paid");

    await changeOrderStatus(order.id, "cancelled", true);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/boutique");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/boutique/${SLUG}`);
  });

  it("refuse un drapeau qui n'est pas un booléen", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    const state = await changeOrderStatus(
      order.id,
      "cancelled",
      "on" as unknown as boolean,
    );

    expect(state).toEqual({ error: "Requête invalide." });
    expect(await sizeStock()).toBe(1);
    expect(await heldUnits(order.id)).toBe(2);
    expect(await statusOf(order.id)).toBe("paid");
  });
});

describe("restockableUnits (critère de la case du back-office)", () => {
  it("compte les unités qu'une commande payée rendrait au compteur", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    expect(await restockableUnits(db, order.id)).toBe(2);
  });

  it("ne compte rien sur une commande qui n'a jamais rien retenu", async () => {
    const { order } = await limitedOrder(null, 2);
    await updateOrderStatus(db, order.id, "paid");

    expect(await restockableUnits(db, order.id)).toBe(0);
  });

  it("ne compte rien quand la taille est repassée illimitée après la réservation", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    await makeSizeUnlimited();

    expect(await restockableUnits(db, order.id)).toBe(0);
  });

  it("ne compte plus rien une fois le stock libéré", async () => {
    const { order } = await limitedOrder(3, 2);

    await updateOrderStatus(db, order.id, "cancelled");

    expect(await restockableUnits(db, order.id)).toBe(0);
  });
});

describe("message de remise en stock : même critère que l'effet réel", () => {
  it("n'annonce rien quand la taille est repassée illimitée entre-temps", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    await makeSizeUnlimited();

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toBeUndefined();
    expect(await sizeStock()).toBeNull();
    expect(await heldUnits(order.id)).toBe(0);
    expect(await statusOf(order.id)).toBe("cancelled");
  });
});

describe("releaseOrderStock : le compte vient de l'écriture", () => {
  it("renvoie les unités réellement créditées au compteur", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    const credited = await db.transaction((tx) => releaseOrderStock(tx, order.id));

    expect(credited).toBe(2);
    expect(await sizeStock()).toBe(3);
  });

  it("renvoie 0 quand la garde isNotNull refuse le crédit, réservation purgée quand même", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    await makeSizeUnlimited();

    const credited = await db.transaction((tx) => releaseOrderStock(tx, order.id));

    expect(credited).toBe(0);
    expect(await sizeStock()).toBeNull();
    expect(await heldUnits(order.id)).toBe(0);
  });

  it("renvoie 0 au rejeu dans la même transaction", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    const credits = await db.transaction(async (tx) => [
      await releaseOrderStock(tx, order.id),
      await releaseOrderStock(tx, order.id),
    ]);

    expect(credits).toEqual([2, 0]);
    expect(await sizeStock()).toBe(3);
  });

  it("ne compte pas une ligne dont le crédit a été refusé, et compte les autres", async () => {
    const { order } = await limitedOrder(3, 2);
    const [autre] = await db
      .insert(products)
      .values({
        slug: `${SLUG}-nu`,
        name: "bouquet nu",
        description: "Édition limitée.",
        priceCents: 4000,
        category: "frais",
        stockQty: 4,
      })
      .returning({ id: products.id });
    await db.insert(orderItems).values({
      orderId: order.id,
      nameSnapshot: "bouquet nu",
      priceCentsSnapshot: 4000,
      qty: 1,
      stockReservedQty: 1,
      stockReservedProductId: autre.id,
    });
    await makeSizeUnlimited();

    const credited = await db.transaction((tx) => releaseOrderStock(tx, order.id));

    expect(credited).toBe(1);
    expect(await sizeStock()).toBeNull();
    const [row] = await db
      .select({ stockQty: products.stockQty })
      .from(products)
      .where(eq(products.id, autre.id));
    expect(row.stockQty).toBe(5);
  });

  it("annonce exactement le compte écrit quand les deux clés sont créditables", async () => {
    const { order } = await limitedOrder(3, 2);
    const [autre] = await db
      .insert(products)
      .values({
        slug: `${SLUG}-nu`,
        name: "bouquet nu",
        description: "Édition limitée.",
        priceCents: 4000,
        category: "frais",
        stockQty: 4,
      })
      .returning({ id: products.id });
    await db.insert(orderItems).values({
      orderId: order.id,
      nameSnapshot: "bouquet nu",
      priceCentsSnapshot: 4000,
      qty: 1,
      stockReservedQty: 1,
      stockReservedProductId: autre.id,
    });
    await updateOrderStatus(db, order.id, "paid");

    const state = await changeOrderStatus(order.id, "cancelled", true);

    expect(state).toEqual({
      ok: "Commande annulée : 3 unités sont remises en stock.",
    });
    expect(await sizeStock()).toBe(3);
  });
});

describe("câblage de la page de commande", () => {
  it("propose la case quand la commande payée retient des unités créditables", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");

    expect(await renderedCanRestock(order.id)).toBe(true);
  });

  it("masque la case quand la commande payée ne retient rien", async () => {
    const { order } = await limitedOrder(null, 2);
    await updateOrderStatus(db, order.id, "paid");

    expect(await renderedCanRestock(order.id)).toBe(false);
  });

  it("masque la case quand la taille est repassée illimitée après la réservation", async () => {
    const { order } = await limitedOrder(3, 2);
    await updateOrderStatus(db, order.id, "paid");
    await makeSizeUnlimited();

    expect(await renderedCanRestock(order.id)).toBe(false);
  });
});
