// @vitest-environment node
// Teste la route POST /api/stripe/webhook avec de vraies signatures
// (stripe.webhooks.generateTestHeaderString) — aucun appel réseau.
import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { POST } from "@/app/api/stripe/webhook/route";
import { getDb } from "@/lib/db/client";
import {
  attachStripeSession,
  createPendingOrder,
  getOrderBySessionId,
} from "@/lib/orders";

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
