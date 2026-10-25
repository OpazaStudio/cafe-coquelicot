// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

let sessionMetadata: Record<string, string> = {};

const retrieve = vi.fn(async (id: string) => ({
  id,
  payment_status: "paid",
  payment_intent: "pi_page",
  metadata: sessionMetadata,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve } } }),
}));

const send = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/email/resend", () => ({
  getMailer: () => ({
    resend: { emails: { send } },
    to: "boutique@test.local",
    from: "Test <no@test.local>",
    bcc: ["copie@test.local"],
  }),
}));

import ConfirmationPage from "@/app/commande/confirmee/page";
import type { ConfirmationState } from "@/components/views/confirmation-view";
import { getDb } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import {
  attachStripeSession,
  cancelOrderBySession,
  createPendingOrder,
  markOrderPaidBySession,
  updateOrderStatus,
} from "@/lib/orders";

async function renderPage(sessionId: string): Promise<ConfirmationState> {
  const element = await ConfirmationPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ session_id: sessionId }),
  });
  return (element.props as { state: ConfirmationState }).state;
}

beforeEach(() => {
  sessionMetadata = {};
  send.mockClear();
});

describe("page /commande/confirmee", () => {
  it("montre une vérification en cours, pas une attente de paiement, sur une commande annulée encaissée", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    await attachStripeSession(db, order.id, "cs_page_cancelled");
    await cancelOrderBySession(db, "cs_page_cancelled");

    const state = await renderPage("cs_page_cancelled");
    expect(state).toEqual({ kind: "needsReview", number: order.number });

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.status).toBe("cancelled");
    expect(after.stripePaymentIntent).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("annonce l'annulation au client dont la commande payée a été annulée par la boutique", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    await attachStripeSession(db, order.id, "cs_page_paid_cancelled");
    await markOrderPaidBySession(db, "cs_page_paid_cancelled", "pi_page_paid_cancelled");
    await updateOrderStatus(db, order.id, "cancelled");
    send.mockClear();

    const state = await renderPage("cs_page_paid_cancelled");
    expect(state).toEqual({ kind: "cancelled", number: order.number });

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.status).toBe("cancelled");
    expect(after.stripePaymentIntent).toBe("pi_page_paid_cancelled");
    expect(send).not.toHaveBeenCalled();
  });

  it("annonce l'annulation même quand Stripe est injoignable et qu'aucun verdict n'est rendu", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    await attachStripeSession(db, order.id, "cs_page_cancelled_offline");
    await cancelOrderBySession(db, "cs_page_cancelled_offline");
    retrieve.mockRejectedValueOnce(new Error("Stripe injoignable"));

    const state = await renderPage("cs_page_cancelled_offline");
    expect(state).toEqual({ kind: "cancelled", number: order.number });
    expect(send).not.toHaveBeenCalled();
  });

  it("marque payé et affiche la commande quand le paiement est régulier", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    await attachStripeSession(db, order.id, "cs_page_ok");

    const state = await renderPage("cs_page_ok");
    expect(state.kind).toBe("paid");

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.status).toBe("paid");
    expect(after.stripePaymentIntent).toBe("pi_page");
    expect(send).toHaveBeenCalled();
  });

  it("retrouve la commande annulée par metadata.orderId quand aucune session n'est attachée", async () => {
    const db = await getDb();
    const { order } = await createPendingOrder(
      db,
      { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
      [{ slug: "rivage", qty: 1 }],
    );
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    sessionMetadata = { orderId: order.id };

    const state = await renderPage("cs_page_orphan");
    expect(state).toEqual({ kind: "needsReview", number: order.number });

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.status).toBe("cancelled");
    expect(after.stripeSessionId).toBeNull();
    expect(after.stripePaymentIntent).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
