// @vitest-environment node
// Teste la route POST /api/stripe/webhook avec de vraies signatures
// (stripe.webhooks.generateTestHeaderString) — aucun appel réseau.
import { beforeAll, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { eq } from "drizzle-orm";

type SentMail = {
  to: string[];
  bcc: string[];
  subject: string;
  text: string;
};

let mailerEnabled = false;
const send = vi.fn<(mail: SentMail) => Promise<{ error: null }>>(async () => ({ error: null }));

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/lib/email/resend", () => ({
  getMailer: () =>
    mailerEnabled
      ? {
          resend: { emails: { send } },
          to: "boutique@test.local",
          from: "Test <no@test.local>",
          bcc: ["copie@test.local"],
        }
      : null,
}));
vi.mock("@/lib/stock/release", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stock/release")>();
  return { ...actual, releaseOrderStock: vi.fn(actual.releaseOrderStock) };
});

import { POST } from "@/app/api/stripe/webhook/route";
import { getDb } from "@/lib/db/client";
import { orderItems, orders, products } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import {
  attachStripeSession,
  createPendingOrder,
  getOrderBySessionId,
  updateOrderStatus,
} from "@/lib/orders";
import { releaseOrderStock } from "@/lib/stock/release";

const stripe = new Stripe("sk_test_dummy_key_for_signatures");
const secret = process.env.STRIPE_WEBHOOK_SECRET!;

function checkoutCompletedPayload(sessionId: string, orderId?: string) {
  return JSON.stringify({
    id: "evt_test_1",
    object: "event",
    api_version: "2026-05-27",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: "pi_test_webhook",
        ...(orderId ? { metadata: { orderId } } : {}),
      },
    },
  });
}

function post(payload: string, signature: string | null) {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: signature ? { "stripe-signature": signature } : {},
      body: payload,
    }),
  );
}

async function makePendingOrder(sessionId: string) {
  const db = await getDb();
  const { order } = await createPendingOrder(
    db,
    { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
    [{ slug: "rivage", qty: 1 }],
  );
  await attachStripeSession(db, order.id, sessionId);
  return order;
}

beforeAll(() => {
  // La base de test (.env.test) est une PGlite mémoire partagée avec la route.
  expect(process.env.PGLITE_DATA_DIR).toBe(":memory:");
  expect(secret).toBeTruthy();
});

describe("POST /api/stripe/webhook", () => {
  it("marque la commande payée sur checkout.session.completed signé", async () => {
    await makePendingOrder("cs_test_wh_ok");
    const payload = checkoutCompletedPayload("cs_test_wh_ok");
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const res = await post(payload, signature);
    expect(res.status).toBe(200);

    const db = await getDb();
    const after = await getOrderBySessionId(db, "cs_test_wh_ok");
    expect(after?.order.status).toBe("paid");
    expect(after?.order.stripePaymentIntent).toBe("pi_test_webhook");
  });

  // Si attachStripeSession a échoué après la création de la session Stripe
  // (app/checkout/actions.ts), la commande n'a pas de stripeSessionId et le
  // paiement serait irréconciliable. metadata.orderId sert de filet.
  it("réconcilie via metadata.orderId quand stripeSessionId n'a pas été attaché", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    // Volontairement PAS d'attachStripeSession.
    const payload = checkoutCompletedPayload("cs_test_wh_orphan", order.id);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    expect((await post(payload, signature)).status).toBe(200);

    const after = await getOrderBySessionId(db, "cs_test_wh_orphan");
    expect(after?.order.id).toBe(order.id);
    expect(after?.order.status).toBe("paid");
    // La ligne est réparée : le sessionId est posé pour les relances.
    expect(after?.order.stripeSessionId).toBe("cs_test_wh_orphan");
    expect(after?.order.stripePaymentIntent).toBe("pi_test_webhook");
  });

  it("ignore un metadata.orderId qui ne correspond à aucune commande pending", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    await attachStripeSession(db, order.id, "cs_test_wh_done");
    const payload = checkoutCompletedPayload("cs_test_wh_done", order.id);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await post(payload, signature)).status).toBe(200);
    // Rejeu du même événement : idempotent, la commande reste paid.
    expect((await post(payload, signature)).status).toBe(200);
    const after = await getOrderBySessionId(db, "cs_test_wh_done");
    expect(after?.order.status).toBe("paid");
  });

  it("rejette une signature invalide sans toucher la commande", async () => {
    await makePendingOrder("cs_test_wh_bad");
    const payload = checkoutCompletedPayload("cs_test_wh_bad");

    const res = await post(payload, "t=1,v1=deadbeef");
    expect(res.status).toBe(400);

    const db = await getDb();
    const after = await getOrderBySessionId(db, "cs_test_wh_bad");
    expect(after?.order.status).toBe("pending");
  });

  it("rejette l'absence de signature", async () => {
    const res = await post(checkoutCompletedPayload("cs_x"), null);
    expect(res.status).toBe(400);
  });

  it("annule la commande pending sur checkout.session.expired", async () => {
    await makePendingOrder("cs_test_wh_exp");
    const payload = JSON.stringify({
      id: "evt_test_2",
      object: "event",
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_wh_exp", object: "checkout.session" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const res = await post(payload, signature);
    expect(res.status).toBe(200);

    const db = await getDb();
    const after = await getOrderBySessionId(db, "cs_test_wh_exp");
    expect(after?.order.status).toBe("cancelled");
  });

  it("annule via metadata.orderId sur checkout.session.expired quand stripeSessionId n'a pas été attaché", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    const payload = JSON.stringify({
      id: "evt_test_4",
      object: "event",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_test_wh_exp_orphan",
          object: "checkout.session",
          metadata: { orderId: order.id },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    expect((await post(payload, signature)).status).toBe(200);

    const after = await getOrderBySessionId(db, "cs_test_wh_exp_orphan");
    expect(after?.order.id).toBe(order.id);
    expect(after?.order.status).toBe("cancelled");
  });

  it("répond 500 et laisse la commande pending quand la libération du stock échoue", async () => {
    const db = await getDb();
    const [limite] = await db
      .insert(products)
      .values({
        slug: "limite-webhook",
        name: "bouquet limite webhook",
        description: "Édition limitée.",
        priceCents: 4000,
        category: "frais",
        stockQty: 2,
      })
      .returning({ id: products.id });
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "limite-webhook", qty: 1 }],
    );
    await attachStripeSession(db, order.id, "cs_test_wh_exp_release_ko");
    const payload = JSON.stringify({
      id: "evt_test_5",
      object: "event",
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_wh_exp_release_ko", object: "checkout.session" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

    vi.mocked(releaseOrderStock).mockClear();
    vi.mocked(releaseOrderStock).mockRejectedValueOnce(new Error("crédit impossible"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let res: Response;
    try {
      res = await post(payload, signature);
      expect(errors).toHaveBeenCalledWith(
        "[commande] annulation impossible, aucune modification appliquée (statut et stock inchangés)",
        expect.objectContaining({ stripeSessionId: "cs_test_wh_exp_release_ko" }),
        expect.objectContaining({ message: "crédit impossible" }),
      );
    } finally {
      errors.mockRestore();
    }

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Annulation impossible");
    expect(vi.mocked(releaseOrderStock)).toHaveBeenCalledTimes(1);

    const after = await getOrderBySessionId(db, "cs_test_wh_exp_release_ko");
    expect(after?.order.status).toBe("pending");
    const [stock] = await db
      .select({ stockQty: products.stockQty })
      .from(products)
      .where(eq(products.id, limite.id));
    expect(stock.stockQty).toBe(1);
    const [item] = await db
      .select({ stockReservedQty: orderItems.stockReservedQty })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    expect(item.stockReservedQty).toBe(1);
  });

  it("traite une commande mondial_relay sans env MR (skip étiquette)", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(db, {
      name: "Camille", email: "c@x.fr", phone: "+33612345678",
      fulfillment: "mondial_relay", relayPointId: "012345", relayPointName: "T",
      relayStreet: "1 rue X", relayPostalCode: "17000", relayCity: "La Rochelle",
    }, [{ slug: "rivage", qty: 1 }]);
    await attachStripeSession(db, order.id, "cs_test_wh_mr");
    const payload = checkoutCompletedPayload("cs_test_wh_mr");
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await post(payload, signature)).status).toBe(200);
    const after = await getOrderBySessionId(db, "cs_test_wh_mr");
    expect(after?.order.status).toBe("paid");
    expect(after?.order.relayShipmentNumber).toBeNull(); // pas d'env MR → skip
  });

  it("alerte la boutique sans rien écrire quand Stripe encaisse sur une commande annulée", async () => {
    const db = await getDb();
    const order = await makePendingOrder("cs_test_wh_cancelled");
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));

    mailerEnabled = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const payload = checkoutCompletedPayload("cs_test_wh_cancelled");
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
      expect((await post(payload, signature)).status).toBe(200);

      const after = await getOrderBySessionId(db, "cs_test_wh_cancelled");
      expect(after?.order.status).toBe("cancelled");
      expect(after?.order.stripePaymentIntent).toBeNull();

      const journal = errors.mock.calls.map((args) => JSON.stringify(args)).join(" ");
      expect(journal).toContain("cs_test_wh_cancelled");
      expect(journal).toContain("pi_test_webhook");
      expect(journal).toContain(order.number);

      expect(send).toHaveBeenCalledTimes(1);
      const mail = send.mock.calls[0][0];
      expect(mail.to).toEqual(["boutique@test.local"]);
      expect(mail.bcc).toEqual(["copie@test.local"]);
      expect(mail.subject).toBe(`Commande annulée mais payée — ${order.number}`);
      expect(mail.text).toContain(order.number);
      expect(mail.text).toContain("camille@exemple.fr");
      expect(mail.text).toContain(formatEuros(order.totalCents));
      expect(mail.text).toContain("Stripe");
    } finally {
      errors.mockRestore();
      mailerEnabled = false;
      send.mockClear();
    }
  });

  it("n'alerte pas sur une commande encaissée puis annulée par la boutique", async () => {
    const db = await getDb();
    const order = await makePendingOrder("cs_test_wh_refund");
    const payload = checkoutCompletedPayload("cs_test_wh_refund");
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await post(payload, signature)).status).toBe(200);
    await updateOrderStatus(db, order.id, "cancelled");

    mailerEnabled = true;
    send.mockClear();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await post(payload, signature)).status).toBe(200);

      const after = await getOrderBySessionId(db, "cs_test_wh_refund");
      expect(after?.order.status).toBe("cancelled");
      expect(after?.order.stripePaymentIntent).toBe("pi_test_webhook");

      expect(send).not.toHaveBeenCalled();
      const journal = errors.mock.calls.map((args) => JSON.stringify(args)).join(" ");
      expect(journal).not.toContain("paiement encaissé sur une commande annulée");
    } finally {
      errors.mockRestore();
      mailerEnabled = false;
      send.mockClear();
    }
  });

  it("revalide la boutique quand l'expiration libère du stock", async () => {
    await makePendingOrder("cs_test_wh_exp_revalide");
    const payload = JSON.stringify({
      id: "evt_test_6",
      object: "event",
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_wh_exp_revalide", object: "checkout.session" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    revalidatePath.mockClear();

    expect((await post(payload, signature)).status).toBe(200);

    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/boutique");
    expect(revalidatePath).toHaveBeenCalledWith("/boutique/rivage");
    expect(revalidatePath).not.toHaveBeenCalledWith("/boutique/[slug]", "page");

    revalidatePath.mockClear();
    expect((await post(payload, signature)).status).toBe(200);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("répond 200 même si la revalidation du cache échoue", async () => {
    await makePendingOrder("cs_test_wh_exp_revalide_ko");
    const payload = JSON.stringify({
      id: "evt_test_7",
      object: "event",
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_wh_exp_revalide_ko", object: "checkout.session" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    revalidatePath.mockClear();
    revalidatePath.mockImplementationOnce(() => {
      throw new Error("hors contexte de requête");
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await post(payload, signature)).status).toBe(200);
      expect(errors).toHaveBeenCalledWith(
        "[stock] revalidation du cache impossible",
        expect.any(Object),
        expect.any(Error),
      );
    } finally {
      errors.mockRestore();
      revalidatePath.mockReset();
    }

    const db = await getDb();
    const after = await getOrderBySessionId(db, "cs_test_wh_exp_revalide_ko");
    expect(after?.order.status).toBe("cancelled");
  });

  it("répond 200 aux événements ignorés (signés)", async () => {
    const payload = JSON.stringify({
      id: "evt_test_3",
      object: "event",
      type: "payment_intent.created",
      data: { object: { id: "pi_x", object: "payment_intent" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    expect((await post(payload, signature)).status).toBe(200);
  });
});
