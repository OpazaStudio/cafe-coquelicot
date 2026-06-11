// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orders, products } from "@/lib/db/schema";
import { DELIVERY_FEE_CENTS } from "@/lib/order-status";
import {
  cancelOrderBySession,
  attachStripeSession,
  CheckoutError,
  createPendingOrder,
  generateOrderNumber,
  getOrderBySessionId,
  markOrderPaidBySession,
  updateOrderStatus,
} from "@/lib/orders";
import { createTestDb } from "../helpers/db";

const camille = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  fulfillment: "retrait" as const,
};

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("generateOrderNumber", () => {
  it("suit le format CQ-AAMMJJ-XXXX", () => {
    expect(generateOrderNumber(new Date("2026-06-10T12:00:00Z"))).toMatch(
      /^CQ-260610-[A-HJ-KM-NP-Z2-9]{4}$/,
    );
  });
});

describe("createPendingOrder", () => {
  it("calcule les totaux depuis la base (jamais depuis le client)", async () => {
    const { order, items } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 2 }, // 2 × 4800
      { slug: "gabut", qty: 1 }, // 3800
    ]);
    expect(order.status).toBe("pending");
    expect(order.subtotalCents).toBe(13400);
    expect(order.deliveryFeeCents).toBe(0);
    expect(order.totalCents).toBe(13400);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.nameSnapshot).sort()).toEqual(["gabut", "rivage"]);
    expect(items.find((i) => i.nameSnapshot === "rivage")?.priceCentsSnapshot).toBe(4800);
  });

  it("ajoute les frais de livraison en mode livraison", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "livraison",
        address: "3 quai Valin, 17000 La Rochelle",
      },
      [{ slug: "estran", qty: 1 }], // 2200
    );
    expect(order.deliveryFeeCents).toBe(DELIVERY_FEE_CENTS);
    expect(order.totalCents).toBe(2200 + DELIVERY_FEE_CENTS);
    expect(order.deliveryAddress).toContain("quai Valin");
  });

  it("rejette panier vide, produit inconnu et produit masqué", async () => {
    await expect(createPendingOrder(db, camille, [])).rejects.toThrow(CheckoutError);
    await expect(
      createPendingOrder(db, camille, [{ slug: "inexistant", qty: 1 }]),
    ).rejects.toThrow(CheckoutError);

    await db.update(products).set({ active: false }).where(eq(products.slug, "rivage"));
    await expect(
      createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]),
    ).rejects.toThrow(CheckoutError);
  });

  it("rejette les quantités hors bornes", async () => {
    await expect(
      createPendingOrder(db, camille, [{ slug: "rivage", qty: 0 }]),
    ).rejects.toThrow(CheckoutError);
    await expect(
      createPendingOrder(db, camille, [{ slug: "rivage", qty: 1.5 }]),
    ).rejects.toThrow(CheckoutError);
  });
});

describe("cycle de paiement Stripe", () => {
  it("markOrderPaidBySession est idempotent", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await attachStripeSession(db, order.id, "cs_test_abc");

    const paid = await markOrderPaidBySession(db, "cs_test_abc", "pi_123");
    expect(paid?.status).toBe("paid");
    expect(paid?.stripePaymentIntent).toBe("pi_123");

    // Second passage (webhook + page de confirmation) : no-op, pas de régression.
    expect(await markOrderPaidBySession(db, "cs_test_abc", "pi_123")).toBeNull();
    const after = await getOrderBySessionId(db, "cs_test_abc");
    expect(after?.order.status).toBe("paid");
  });

  it("ne marque jamais payé une session inconnue", async () => {
    expect(await markOrderPaidBySession(db, "cs_test_nope")).toBeNull();
  });

  it("cancelOrderBySession n'annule que les commandes pending", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await attachStripeSession(db, order.id, "cs_test_exp");
    await markOrderPaidBySession(db, "cs_test_exp");

    await cancelOrderBySession(db, "cs_test_exp"); // expiré après paiement : ignoré
    const after = await getOrderBySessionId(db, "cs_test_exp");
    expect(after?.order.status).toBe("paid");
  });
});

describe("updateOrderStatus (machine d'états)", () => {
  it("suit pending → paid → preparing → delivered", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    expect((await updateOrderStatus(db, order.id, "paid")).status).toBe("paid");
    expect((await updateOrderStatus(db, order.id, "preparing")).status).toBe("preparing");
    expect((await updateOrderStatus(db, order.id, "delivered")).status).toBe("delivered");
  });

  it("refuse les transitions illégales", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(updateOrderStatus(db, order.id, "delivered")).rejects.toThrow(
      /Transition impossible/,
    );
    await updateOrderStatus(db, order.id, "cancelled");
    await expect(updateOrderStatus(db, order.id, "paid")).rejects.toThrow(
      /Transition impossible/,
    );
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("cancelled");
  });
});
