// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import {
  attachStripeSession,
  createPendingOrder,
  markOrderPaidBySession,
  updateOrderStatus,
} from "@/lib/orders";
import { getKpis, getRevenueByDay, getTopProducts } from "@/lib/stats";
import { createTestDb } from "../helpers/db";

const buyer = (n: number) => ({
  name: `Client ${n}`,
  email: `client${n}@exemple.fr`,
  fulfillment: "retrait" as const,
});

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

async function placePaidOrder(
  n: number,
  items: { slug: string; qty: number }[],
) {
  const { order } = await createPendingOrder(db, buyer(n), items);
  await attachStripeSession(db, order.id, `cs_test_${n}`);
  await markOrderPaidBySession(db, `cs_test_${n}`, `pi_${n}`);
  return order;
}

describe("getKpis", () => {
  it("n'agrège que les commandes encaissées", async () => {
    await placePaidOrder(1, [{ slug: "rivage", qty: 2 }]); // 9600
    const paid2 = await placePaidOrder(2, [{ slug: "gabut", qty: 1 }]); // 3800
    await updateOrderStatus(db, paid2.id, "preparing"); // reste comptée

    // pending + cancelled : exclues
    await createPendingOrder(db, buyer(3), [{ slug: "mistral", qty: 1 }]);
    const { order: toCancel } = await createPendingOrder(db, buyer(4), [
      { slug: "mistral", qty: 1 },
    ]);
    await updateOrderStatus(db, toCancel.id, "cancelled");

    const kpis = await getKpis(db);
    expect(kpis.revenueCents).toBe(9600 + 3800);
    expect(kpis.orderCount).toBe(2);
    expect(kpis.averageOrderCents).toBe(Math.round((9600 + 3800) / 2));
    expect(kpis.itemsSold).toBe(3);
  });

  it("rend des zéros sans commande", async () => {
    expect(await getKpis(db)).toEqual({
      revenueCents: 0,
      orderCount: 0,
      averageOrderCents: 0,
      itemsSold: 0,
    });
  });
});

describe("getTopProducts", () => {
  it("classe par quantité vendue avec le CA associé", async () => {
    await placePaidOrder(1, [
      { slug: "rivage", qty: 1 },
      { slug: "estran", qty: 3 }, // 3 × 2200
    ]);
    await placePaidOrder(2, [{ slug: "estran", qty: 2 }]);

    const top = await getTopProducts(db, 5);
    expect(top[0]).toEqual({ name: "estran", qty: 5, revenueCents: 11000 });
    expect(top[1]).toEqual({ name: "rivage", qty: 1, revenueCents: 4800 });
  });
});

describe("getRevenueByDay", () => {
  it("renvoie un point par jour, trous comblés, somme cohérente", async () => {
    await placePaidOrder(1, [{ slug: "rivage", qty: 1 }]); // aujourd'hui, 4800
    const days = await getRevenueByDay(db, 30);
    expect(days).toHaveLength(30);
    expect(days.at(-1)?.day).toBe(new Date().toISOString().slice(0, 10));
    expect(days.reduce((s, d) => s + d.revenueCents, 0)).toBe(4800);
    expect(days.at(-1)?.orders).toBe(1);
    expect(days[0].revenueCents).toBe(0);
  });
});
