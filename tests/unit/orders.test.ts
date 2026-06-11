// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orderItems, orders, products } from "@/lib/db/schema";
import { SHIPPING_FEE_CENTS } from "@/lib/order-status";
import {
  cancelOrderBySession,
  attachStripeSession,
  CheckoutError,
  createPendingOrder,
  generateOrderNumber,
  getOrderBySessionId,
  listBoardOrders,
  markOrderPaidBySession,
  setItemPreparedQty,
  setPrepStatus,
  setTrackingNumber,
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

  it("ajoute les frais d'expédition en mode poste", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "estran", qty: 1 }], // 2200
    );
    expect(order.fulfillment).toBe("poste");
    expect(order.deliveryFeeCents).toBe(SHIPPING_FEE_CENTS);
    expect(order.totalCents).toBe(2200 + SHIPPING_FEE_CENTS);
    expect(order.shippingAddress).toContain("quai Valin");
    expect(order.shippingPostalCode).toBe("17000");
    expect(order.shippingCity).toBe("La Rochelle");
    expect(order.shippingCountry).toBe("FR");
  });

  it("n'enregistre pas d'adresse en mode retrait", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "estran", qty: 1 },
    ]);
    expect(order.fulfillment).toBe("retrait");
    expect(order.deliveryFeeCents).toBe(0);
    expect(order.shippingAddress).toBeNull();
    expect(order.shippingPostalCode).toBeNull();
    expect(order.shippingCity).toBeNull();
    expect(order.shippingCountry).toBeNull();
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
  it("suit pending → paid → preparing → picked_up pour un retrait", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    expect((await updateOrderStatus(db, order.id, "paid")).status).toBe("paid");
    expect((await updateOrderStatus(db, order.id, "preparing")).status).toBe("preparing");
    expect((await updateOrderStatus(db, order.id, "picked_up")).status).toBe("picked_up");
  });

  it("suit preparing → shipped pour un envoi postal", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "rivage", qty: 1 }],
    );
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");
    expect((await updateOrderStatus(db, order.id, "shipped")).status).toBe("shipped");
  });

  it("refuse le statut terminal de l'autre mode", async () => {
    const retrait = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, retrait.order.id, "paid");
    await updateOrderStatus(db, retrait.order.id, "preparing");
    await expect(
      updateOrderStatus(db, retrait.order.id, "shipped"),
    ).rejects.toThrow(/Transition impossible/);

    const poste = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "rivage", qty: 1 }],
    );
    await updateOrderStatus(db, poste.order.id, "paid");
    await updateOrderStatus(db, poste.order.id, "preparing");
    await expect(
      updateOrderStatus(db, poste.order.id, "picked_up"),
    ).rejects.toThrow(/Transition impossible/);
  });

  it("refuse les transitions illégales", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(updateOrderStatus(db, order.id, "picked_up")).rejects.toThrow(
      /Transition impossible/,
    );
    await updateOrderStatus(db, order.id, "cancelled");
    await expect(updateOrderStatus(db, order.id, "paid")).rejects.toThrow(
      /Transition impossible/,
    );
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("cancelled");
  });

  it("autorise l'annulation depuis preparing pour les deux modes", async () => {
    const retrait = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, retrait.order.id, "paid");
    await updateOrderStatus(db, retrait.order.id, "preparing");
    expect(
      (await updateOrderStatus(db, retrait.order.id, "cancelled")).status,
    ).toBe("cancelled");

    const poste = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "rivage", qty: 1 }],
    );
    await updateOrderStatus(db, poste.order.id, "paid");
    await updateOrderStatus(db, poste.order.id, "preparing");
    expect(
      (await updateOrderStatus(db, poste.order.id, "cancelled")).status,
    ).toBe("cancelled");
  });

  it("retirée/expédiée → la carte kanban passe en terminée", async () => {
    const retrait = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, retrait.order.id, "paid");
    await updateOrderStatus(db, retrait.order.id, "preparing");
    const pickedUp = await updateOrderStatus(db, retrait.order.id, "picked_up");
    expect(pickedUp.prepStatus).toBe("done");
    expect(pickedUp.prepDoneAt).not.toBeNull();

    const poste = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "rivage", qty: 1 }],
    );
    await updateOrderStatus(db, poste.order.id, "paid");
    await updateOrderStatus(db, poste.order.id, "preparing");
    const shipped = await updateOrderStatus(db, poste.order.id, "shipped");
    expect(shipped.prepStatus).toBe("done");
    expect(shipped.prepDoneAt).not.toBeNull();
  });

  it("ne réécrase pas une date de fin de préparation déjà posée", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");
    const t0 = new Date("2026-06-10T08:00:00Z");
    await setPrepStatus(db, order.id, "done", t0);
    const final = await updateOrderStatus(db, order.id, "picked_up");
    expect(final.prepStatus).toBe("done");
    expect(final.prepDoneAt).toEqual(t0);
  });
});

describe("statut de préparation (schéma)", () => {
  it("toute nouvelle commande démarre en attente, sans date de fin", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    expect(order.prepStatus).toBe("todo");
    expect(order.prepDoneAt).toBeNull();
  });
});

describe("setTrackingNumber", () => {
  const posteCamille = {
    ...camille,
    fulfillment: "poste" as const,
    shippingAddress: "3 quai Valin",
    shippingPostalCode: "17000",
    shippingCity: "La Rochelle",
    shippingCountry: "FR" as const,
  };

  it("enregistre puis efface le numéro de suivi", async () => {
    const { order } = await createPendingOrder(db, posteCamille, [
      { slug: "rivage", qty: 1 },
    ]);
    await setTrackingNumber(db, order.id, "6A1234567890123");
    let [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.trackingNumber).toBe("6A1234567890123");

    await setTrackingNumber(db, order.id, null);
    [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.trackingNumber).toBeNull();
  });

  it("refuse une commande retrait ou inconnue", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(setTrackingNumber(db, order.id, "X1")).rejects.toThrow(
      /introuvable ou sans envoi postal/,
    );
    await expect(
      setTrackingNumber(db, "00000000-0000-0000-0000-000000000000", "X1"),
    ).rejects.toThrow(/introuvable/);
  });
});

describe("setPrepStatus (kanban de préparation)", () => {
  async function paidOrder() {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    return updateOrderStatus(db, order.id, "paid");
  }

  it("déplace une commande payée et pose la date d'entrée en done", async () => {
    const order = await paidOrder();
    const now = new Date("2026-06-11T10:00:00Z");
    const moved = await setPrepStatus(db, order.id, "in_progress", now);
    expect(moved.prepStatus).toBe("in_progress");
    expect(moved.prepDoneAt).toBeNull();
    const done = await setPrepStatus(db, order.id, "done", now);
    expect(done.prepStatus).toBe("done");
    expect(done.prepDoneAt).toEqual(now);
  });

  it("efface la date en sortant de done (la carte redevient permanente)", async () => {
    const order = await paidOrder();
    await setPrepStatus(db, order.id, "done");
    const back = await setPrepStatus(db, order.id, "in_progress");
    expect(back.prepStatus).toBe("in_progress");
    expect(back.prepDoneAt).toBeNull();
  });

  it("no-op sur la colonne courante (date conservée)", async () => {
    const order = await paidOrder();
    const t0 = new Date("2026-06-11T10:00:00Z");
    await setPrepStatus(db, order.id, "done", t0);
    const again = await setPrepStatus(
      db,
      order.id,
      "done",
      new Date("2026-06-11T11:00:00Z"),
    );
    expect(again.prepDoneAt).toEqual(t0);
  });

  it("refuse les commandes hors board (pending, cancelled, inconnue)", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(setPrepStatus(db, order.id, "in_progress")).rejects.toThrow(
      /hors du kanban/,
    );
    // pending → cancelled est une transition valide (checkout abandonné)
    await updateOrderStatus(db, order.id, "cancelled");
    await expect(setPrepStatus(db, order.id, "in_progress")).rejects.toThrow(
      /hors du kanban/,
    );
    await expect(
      setPrepStatus(db, "00000000-0000-0000-0000-000000000000", "done"),
    ).rejects.toThrow(/introuvable/);
  });
});

describe("setItemPreparedQty (cases de préparation)", () => {
  async function paidOrderWithItems(items: { slug: string; qty: number }[]) {
    const created = await createPendingOrder(db, camille, items);
    const order = await updateOrderStatus(db, created.order.id, "paid");
    return { order, items: created.items };
  }

  it("borne la valeur dans [0, qty] (clamp silencieux)", async () => {
    const { items } = await paidOrderWithItems([{ slug: "rivage", qty: 2 }]);
    await setItemPreparedQty(db, items[0].id, 99);
    let [row] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, items[0].id));
    expect(row.preparedQty).toBe(2);

    await setItemPreparedQty(db, items[0].id, -5);
    [row] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, items[0].id));
    expect(row.preparedQty).toBe(0);
  });

  it("transitions symétriques : todo → in_progress → ready → in_progress → todo", async () => {
    const { items } = await paidOrderWithItems([
      { slug: "rivage", qty: 2 },
      { slug: "estran", qty: 1 },
    ]);
    const rivage = items.find((i) => i.nameSnapshot === "rivage")!;
    const estran = items.find((i) => i.nameSnapshot === "estran")!;

    let order = await setItemPreparedQty(db, rivage.id, 1); // 1/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, rivage.id, 2); // 2/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, estran.id, 1); // 3/3
    expect(order.prepStatus).toBe("ready");
    expect(order.prepDoneAt).toBeNull(); // ready n'est pas done

    order = await setItemPreparedQty(db, rivage.id, 1); // 2/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, rivage.id, 0); // 1/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, estran.id, 0); // 0/3
    expect(order.prepStatus).toBe("todo");
  });

  it("un drag manuel vers ready n'invente pas de cases cochées", async () => {
    const { order, items } = await paidOrderWithItems([
      { slug: "rivage", qty: 2 },
    ]);
    const moved = await setPrepStatus(db, order.id, "ready");
    expect(moved.prepStatus).toBe("ready");
    const [row] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, items[0].id));
    expect(row.preparedQty).toBe(0);
  });

  it("refuse hors board, carte terminée et article inconnu", async () => {
    const created = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(
      setItemPreparedQty(db, created.items[0].id, 1),
    ).rejects.toThrow(/hors du kanban/);

    const { order, items } = await paidOrderWithItems([
      { slug: "estran", qty: 1 },
    ]);
    await setPrepStatus(db, order.id, "done");
    await expect(setItemPreparedQty(db, items[0].id, 1)).rejects.toThrow(
      /déjà terminée/,
    );

    await expect(
      setItemPreparedQty(db, "00000000-0000-0000-0000-000000000000", 1),
    ).rejects.toThrow(/Article introuvable/);
  });
});

describe("listBoardOrders (visibilité du board)", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  const hours = (n: number) => n * 60 * 60 * 1000;

  async function paidOrder(deliveryDate?: string) {
    const { order } = await createPendingOrder(
      db,
      { ...camille, deliveryDate },
      [{ slug: "rivage", qty: 1 }],
    );
    return updateOrderStatus(db, order.id, "paid");
  }

  it("liste les payées, exclut pending et annulées", async () => {
    await createPendingOrder(db, camille, [{ slug: "gabut", qty: 1 }]); // pending
    const paid = await paidOrder();
    const toCancel = await createPendingOrder(db, camille, [
      { slug: "estran", qty: 1 },
    ]);
    await updateOrderStatus(db, toCancel.order.id, "cancelled");

    const board = await listBoardOrders(db, now);
    expect(board.map((o) => o.id)).toEqual([paid.id]);
  });

  it("masque les terminées de plus de 48h, garde les récentes", async () => {
    const recent = await paidOrder();
    await setPrepStatus(db, recent.id, "done", new Date(now.getTime() - hours(47)));
    const old = await paidOrder();
    await setPrepStatus(db, old.id, "done", new Date(now.getTime() - hours(49)));

    const ids = (await listBoardOrders(db, now)).map((o) => o.id);
    expect(ids).toContain(recent.id);
    expect(ids).not.toContain(old.id);
  });

  it("borne : pile 48h → masquée", async () => {
    const edge = await paidOrder();
    await setPrepStatus(
      db,
      edge.id,
      "done",
      new Date(now.getTime() - 48 * 60 * 60 * 1000),
    );
    expect((await listBoardOrders(db, now)).map((o) => o.id)).not.toContain(
      edge.id,
    );
  });

  it("trie par date de livraison souhaitée puis par création", async () => {
    const late = await paidOrder("2026-06-20");
    const early = await paidOrder("2026-06-15");
    const none = await paidOrder(); // sans date → en dernier

    const ids = (await listBoardOrders(db, now)).map((o) => o.id);
    expect(ids).toEqual([early.id, late.id, none.id]);
  });

  it("garde visible une done sans date (cas défensif, écrit hors API)", async () => {
    const order = await paidOrder();
    await db
      .update(orders)
      .set({ prepStatus: "done", prepDoneAt: null })
      .where(eq(orders.id, order.id));

    expect((await listBoardOrders(db, now)).map((o) => o.id)).toContain(
      order.id,
    );
  });
});
