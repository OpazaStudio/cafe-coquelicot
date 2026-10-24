// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
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
vi.mock("@/lib/auth/dal", () => ({ verifySession: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/stripe-session", () => ({
  expireSessionForCancel: mocks.expireSessionForCancel,
}));
vi.mock("@/lib/orders/paid-side-effects", () => ({
  applyPaidSideEffects: async (_db: unknown, orderId: string) =>
    mocks.applyPaidSideEffects(orderId),
}));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));
vi.mock("@/lib/email/resend", () => ({ getMailer: mocks.getMailer }));
vi.mock("@/lib/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orders")>();
  return { ...actual, updateOrderStatus: vi.fn(actual.updateOrderStatus) };
});

import { changeOrderStatus } from "@/app/(admin)/admin/(panel)/commandes/actions";
import { getDb } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import {
  OrderStatusConflictError,
  attachStripeSession,
  createPendingOrder,
  getOrderWithItems,
  updateOrderStatus,
} from "@/lib/orders";

const ALREADY_PAID_MESSAGE =
  "Cette commande a déjà été payée chez Stripe ; elle a été passée en « Payée » au lieu d'être annulée.";
const PAID_NOT_RECONCILED_MESSAGE =
  "Stripe a encaissé un paiement sur cette commande, mais la boutique n'a pas pu le rattacher : vérifiez la commande dans Stripe. Cette demande d'annulation n'a pas été appliquée.";
const AWAITING_ASYNC_MESSAGE =
  "Un paiement est en cours sur cette commande. Réessayez plus tard.";
const UNREACHABLE_MESSAGE =
  "Stripe est injoignable : l'annulation n'a pas été appliquée.";

let counter = 0;

async function makeOrder(options: { withSession?: boolean } = {}) {
  const { withSession = true } = options;
  counter += 1;
  const db = await getDb();
  const { order } = await createPendingOrder(
    db,
    {
      name: "Camille",
      email: `annulation-${counter}-${randomUUID()}@exemple.fr`,
      fulfillment: "retrait",
    },
    [{ slug: "rivage", qty: 1 }],
  );
  const sessionId = withSession ? `cs_test_cancel_${counter}_${randomUUID()}` : null;
  if (sessionId) await attachStripeSession(db, order.id, sessionId);
  return { order, sessionId };
}

async function reload(orderId: string) {
  const found = await getOrderWithItems(await getDb(), orderId);
  if (!found) throw new Error("commande introuvable dans le test");
  return found.order;
}

function expectViewsRevalidated(orderId: string) {
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/commandes");
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/commandes/${orderId}`);
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
}

beforeAll(() => {
  expect(process.env.PGLITE_DATA_DIR).toBe(":memory:");
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  expect(mocks.getStripe).not.toHaveBeenCalled();
  expect(mocks.getMailer).not.toHaveBeenCalled();
});

describe("changeOrderStatus : annulation depuis le back-office", () => {
  it("refuse l'annulation et marque payé quand la session est déjà payée", async () => {
    const { order, sessionId } = await makeOrder();
    mocks.expireSessionForCancel.mockResolvedValue({
      outcome: "already_paid",
      paymentIntent: "pi_test_cancel_paid",
    });

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: ALREADY_PAID_MESSAGE });
    expect(mocks.expireSessionForCancel).toHaveBeenCalledWith(sessionId);
    const after = await reload(order.id);
    expect(after.status).toBe("paid");
    expect(after.stripePaymentIntent).toBe("pi_test_cancel_paid");
    expectViewsRevalidated(order.id);
  });

  it("envoie les effets de bord du paiement quand la session était déjà payée", async () => {
    const { order } = await makeOrder();
    mocks.expireSessionForCancel.mockResolvedValue({
      outcome: "already_paid",
      paymentIntent: "pi_test_cancel_effects",
    });

    await changeOrderStatus(order.id, "cancelled");

    expect(mocks.applyPaidSideEffects).toHaveBeenCalledTimes(1);
    expect(mocks.applyPaidSideEffects).toHaveBeenCalledWith(order.id);
  });

  it("n'envoie pas deux fois les effets de bord quand le webhook a déjà marqué la commande payée", async () => {
    const { order } = await makeOrder();
    mocks.expireSessionForCancel.mockImplementation(async () => {
      const db = await getDb();
      await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
      return { outcome: "already_paid", paymentIntent: "pi_test_cancel_replay" };
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: ALREADY_PAID_MESSAGE });
    expect((await reload(order.id)).status).toBe("paid");
    expect(mocks.applyPaidSideEffects).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expectViewsRevalidated(order.id);
    errorSpy.mockRestore();
  });

  it("n'annonce pas « passée en Payée » quand la commande reste annulée, sans effets de bord", async () => {
    const { order, sessionId } = await makeOrder();
    mocks.expireSessionForCancel.mockImplementation(async () => {
      const db = await getDb();
      await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
      return { outcome: "already_paid", paymentIntent: "pi_test_cancel_late" };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: PAID_NOT_RECONCILED_MESSAGE });
    expect((await reload(order.id)).status).toBe("cancelled");
    expect(mocks.applyPaidSideEffects).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        orderId: order.id,
        stripeSessionId: sessionId,
        outcome: "paid_on_cancelled",
      }),
    );
    expectViewsRevalidated(order.id);
    errorSpy.mockRestore();
  });

  it("n'annonce pas « passée en Payée » quand la commande reste en attente, sans effets de bord", async () => {
    const { order, sessionId } = await makeOrder();
    mocks.expireSessionForCancel.mockImplementation(async () => {
      const db = await getDb();
      await db
        .update(orders)
        .set({ stripeSessionId: `${sessionId}_autre` })
        .where(eq(orders.id, order.id));
      return { outcome: "already_paid", paymentIntent: "pi_test_cancel_lost" };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: PAID_NOT_RECONCILED_MESSAGE });
    expect((await reload(order.id)).status).toBe("pending");
    expect(mocks.applyPaidSideEffects).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        orderId: order.id,
        stripeSessionId: sessionId,
        outcome: "unknown",
      }),
    );
    expectViewsRevalidated(order.id);
    errorSpy.mockRestore();
  });

  it("refuse l'annulation quand Stripe est injoignable et journalise la commande, la session et la cause", async () => {
    const { order, sessionId } = await makeOrder();
    const refus = new Error("The provided key does not have the required permissions.");
    mocks.expireSessionForCancel.mockResolvedValue({ outcome: "unreachable", cause: refus });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: UNREACHABLE_MESSAGE });
    expect((await reload(order.id)).status).toBe("pending");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        orderId: order.id,
        stripeSessionId: sessionId,
        cause: refus,
      }),
    );
    expect(mocks.applyPaidSideEffects).not.toHaveBeenCalled();
    expectViewsRevalidated(order.id);
    errorSpy.mockRestore();
  });

  it("refuse l'annulation pendant un paiement asynchrone", async () => {
    const { order } = await makeOrder();
    mocks.expireSessionForCancel.mockResolvedValue({ outcome: "awaiting_async" });

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: AWAITING_ASYNC_MESSAGE });
    expect((await reload(order.id)).status).toBe("pending");
    expect(mocks.applyPaidSideEffects).not.toHaveBeenCalled();
    expectViewsRevalidated(order.id);
  });

  it("refuse l'annulation face à un verdict Stripe inconnu", async () => {
    const { order } = await makeOrder();
    mocks.expireSessionForCancel.mockResolvedValue({ outcome: "verdict_futur" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: UNREACHABLE_MESSAGE });
    expect((await reload(order.id)).status).toBe("pending");
    expect(mocks.applyPaidSideEffects).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ orderId: order.id }),
    );
    expectViewsRevalidated(order.id);
    errorSpy.mockRestore();
  });

  it("annule quand la session a bien été expirée", async () => {
    const { order, sessionId } = await makeOrder();
    mocks.expireSessionForCancel.mockResolvedValue({ outcome: "expired" });

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toBeUndefined();
    expect(mocks.expireSessionForCancel).toHaveBeenCalledWith(sessionId);
    expect((await reload(order.id)).status).toBe("cancelled");
    expectViewsRevalidated(order.id);
  });

  it("annule une commande sans session Stripe", async () => {
    const { order } = await makeOrder({ withSession: false });
    mocks.expireSessionForCancel.mockResolvedValue({ outcome: "no_session" });

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toBeUndefined();
    expect(mocks.expireSessionForCancel).toHaveBeenCalledWith(null);
    expect((await reload(order.id)).status).toBe("cancelled");
  });

  it("rafraîchit les vues et renvoie le message quand la commande a changé de statut", async () => {
    const { order } = await makeOrder();
    mocks.expireSessionForCancel.mockResolvedValue({ outcome: "expired" });
    vi.mocked(updateOrderStatus).mockRejectedValueOnce(
      new OrderStatusConflictError("La commande a changé de statut, rechargez la page."),
    );

    const res = await changeOrderStatus(order.id, "cancelled");

    expect(res).toEqual({ error: "La commande a changé de statut, rechargez la page." });
    expect((await reload(order.id)).status).toBe("pending");
    expectViewsRevalidated(order.id);
  });

  it.each(["paid", "preparing"] as const)(
    "n'appelle pas Stripe pour annuler depuis %s",
    async (status) => {
      const { order } = await makeOrder();
      const db = await getDb();
      await updateOrderStatus(db, order.id, "paid");
      if (status === "preparing") await updateOrderStatus(db, order.id, "preparing");
      expect((await reload(order.id)).status).toBe(status);

      const res = await changeOrderStatus(order.id, "cancelled");

      expect(res).toBeUndefined();
      expect(mocks.expireSessionForCancel).not.toHaveBeenCalled();
      expect((await reload(order.id)).status).toBe("cancelled");
    },
  );

  it("n'appelle pas Stripe pour une transition autre que l'annulation", async () => {
    const { order } = await makeOrder();

    const res = await changeOrderStatus(order.id, "paid");

    expect(res).toBeUndefined();
    expect(mocks.expireSessionForCancel).not.toHaveBeenCalled();
    expect((await reload(order.id)).status).toBe("paid");
  });

  it("renvoie une erreur sans consulter Stripe pour une commande inconnue", async () => {
    const res = await changeOrderStatus(randomUUID(), "cancelled");

    expect(res).toEqual({ error: "Commande introuvable." });
    expect(mocks.expireSessionForCancel).not.toHaveBeenCalled();
  });

  it("rejette une requête invalide sans rien rafraîchir", async () => {
    const res = await changeOrderStatus("pas-un-uuid", "cancelled");

    expect(res).toEqual({ error: "Requête invalide." });
    expect(mocks.expireSessionForCancel).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
