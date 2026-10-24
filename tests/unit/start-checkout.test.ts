// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsExpire: vi.fn(),
  sessionsRetrieve: vi.fn(),
  redirect: vi.fn<(url: string) => never>(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  getMailer: vi.fn(() => null),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mocks.sessionsCreate,
        expire: mocks.sessionsExpire,
        retrieve: mocks.sessionsRetrieve,
      },
    },
  }),
  getSiteUrl: () => "http://x",
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/email/resend", () => ({ getMailer: mocks.getMailer }));
vi.mock("@/lib/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orders")>();
  return { ...actual, attachStripeSession: vi.fn(actual.attachStripeSession) };
});
vi.mock("@/lib/stripe-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-session")>();
  return { ...actual, expireSessionForCancel: vi.fn(actual.expireSessionForCancel) };
});

import { startCheckout } from "@/app/checkout/actions";
import { abandonPendingOrder } from "@/lib/checkout/abandon";
import { getDb } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import {
  CheckoutError,
  attachStripeSession,
  createPendingOrder,
  getOrderWithItems,
  updateOrderStatus,
} from "@/lib/orders";
import { expireSessionForCancel } from "@/lib/stripe-session";

const CHECKOUT_URL = "https://checkout.stripe.test/c/pay/cs_test_start";
const INJOIGNABLE = "[checkout] session Stripe injoignable, commande laissée en attente";
const EXPLOITABLE = "[checkout] session Stripe encore exploitable, commande laissée en attente";
const COMPENSATION_IMPOSSIBLE = "[checkout] compensation impossible";

let errorSpy: ReturnType<typeof vi.spyOn>;

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@exemple.fr`;
}

function formDataFor(email: string, items: unknown = [{ slug: "rivage", qty: 1 }]) {
  const formData = new FormData();
  formData.set("fulfillment", "poste");
  formData.set("name", "Camille Test");
  formData.set("email", email);
  formData.set("phone", "0612345678");
  formData.set("address", "12 rue des Fleurs");
  formData.set("postalCode", "13300");
  formData.set("city", "Salon-de-Provence");
  formData.set("items", JSON.stringify(items));
  return formData;
}

async function orderFor(email: string) {
  const db = await getDb();
  const rows = await db.select().from(orders).where(eq(orders.customerEmail, email));
  if (rows.length > 1) throw new Error(`plusieurs commandes pour ${email}`);
  return rows[0];
}

async function statusOfOrderFor(email: string) {
  return (await orderFor(email))?.status;
}

async function pendingOrder() {
  const db = await getDb();
  const { order } = await createPendingOrder(
    db,
    { name: "Camille", email: uniqueEmail("abandon"), fulfillment: "retrait" },
    [{ slug: "rivage", qty: 1 }],
  );
  return { db, order };
}

async function reloadStatus(orderId: string) {
  const found = await getOrderWithItems(await getDb(), orderId);
  if (!found) throw new Error("commande introuvable dans le test");
  return found.order.status;
}

function sessionCreated(id: string, url: string | null = CHECKOUT_URL) {
  mocks.sessionsCreate.mockResolvedValue({ id, url });
}

function attachPersistsThenFails() {
  vi.mocked(attachStripeSession).mockImplementationOnce(async (db, orderId, sessionId) => {
    const actual = await vi.importActual<typeof import("@/lib/orders")>("@/lib/orders");
    await actual.attachStripeSession(db, orderId, sessionId);
    throw new Error("réponse perdue après l'écriture");
  });
}

beforeAll(() => {
  expect(process.env.PGLITE_DATA_DIR).toBe(":memory:");
});

beforeEach(() => {
  vi.resetAllMocks();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  expect(mocks.getMailer).not.toHaveBeenCalled();
});

describe("startCheckout : compensation de la commande en attente", () => {
  it("annule la commande quand sessions.create lève", async () => {
    const email = uniqueEmail("create-leve");
    mocks.sessionsCreate.mockRejectedValue(new Error("stripe down"));

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res?.error).toBeTruthy();
    expect(await statusOfOrderFor(email)).toBe("cancelled");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.sessionsExpire).not.toHaveBeenCalled();
  });

  it("annule la commande quand Stripe ne renvoie pas d'URL", async () => {
    const email = uniqueEmail("sans-url");
    sessionCreated("cs_test_sans_url", null);

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res?.error).toMatch(/URL de paiement/);
    expect(await statusOfOrderFor(email)).toBe("cancelled");
    expect(attachStripeSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("annule la commande quand attachStripeSession lève", async () => {
    const email = uniqueEmail("attach-leve");
    sessionCreated("cs_test_attach_leve");
    vi.mocked(attachStripeSession).mockRejectedValueOnce(new Error("base indisponible"));

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res?.error).toBeTruthy();
    expect(await statusOfOrderFor(email)).toBe("cancelled");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renvoie une erreur exploitable même si la compensation échoue", async () => {
    const email = uniqueEmail("compensation-echoue");
    mocks.sessionsCreate.mockRejectedValue(new Error("stripe down"));
    vi.mocked(expireSessionForCancel).mockRejectedValueOnce(new Error("garde indisponible"));

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res?.error).toBeTruthy();
    expect(await statusOfOrderFor(email)).toBe("pending");
    expect(errorSpy).toHaveBeenCalledWith(COMPENSATION_IMPOSSIBLE, expect.any(Error));
  });

  it("ne compense pas quand le panier est refusé avant toute commande", async () => {
    const email = uniqueEmail("panier-refuse");

    const res = await startCheckout(
      undefined,
      formDataFor(email, [{ slug: "bouquet-inexistant", qty: 1 }]),
    );

    expect(res?.error).toMatch(/n'est plus disponible/);
    expect(await statusOfOrderFor(email)).toBeUndefined();
    expect(expireSessionForCancel).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it("laisse la commande pending quand Stripe est injoignable à la compensation", async () => {
    const email = uniqueEmail("injoignable");
    mocks.sessionsCreate.mockRejectedValue(new Error("stripe down"));
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce({ outcome: "unreachable" });

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res?.error).toBeTruthy();
    expect(await statusOfOrderFor(email)).toBe("pending");
  });

  it("compense la commande déjà insérée même quand l'erreur est une CheckoutError", async () => {
    const email = uniqueEmail("checkouterror-apres-insertion");
    mocks.sessionsCreate.mockRejectedValue(
      new CheckoutError("Le bouquet « rivage » n'est plus disponible."),
    );

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res).toEqual({ error: "Le bouquet « rivage » n'est plus disponible." });
    expect(await statusOfOrderFor(email)).toBe("cancelled");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("n'envoie personne payer une commande annulée pendant sessions.create", async () => {
    const email = uniqueEmail("annulee-pendant-create");
    mocks.sessionsCreate.mockImplementation(
      async ({ client_reference_id: orderId }: { client_reference_id: string }) => {
        await updateOrderStatus(await getDb(), orderId, "cancelled");
        return { id: "cs_test_annulee_pendant_create", url: CHECKOUT_URL };
      },
    );

    const res = await startCheckout(undefined, formDataFor(email));

    const order = await orderFor(email);
    expect(res?.error).toBeTruthy();
    expect(order?.status).toBe("cancelled");
    expect(order?.stripeSessionId).toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(expireSessionForCancel).not.toHaveBeenCalled();
  });

  it("ne compense pas un checkout réussi : la redirection n'annule rien", async () => {
    const email = uniqueEmail("succes");
    sessionCreated("cs_test_succes");

    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(CHECKOUT_URL);
    const order = await orderFor(email);
    expect(order?.status).toBe("pending");
    expect(order?.stripeSessionId).toBe("cs_test_succes");
    expect(expireSessionForCancel).not.toHaveBeenCalled();
    expect(mocks.sessionsExpire).not.toHaveBeenCalled();
  });
});

describe("startCheckout : session déjà rattachée quand l'initialisation échoue", () => {
  it("expire la session chez Stripe puis annule la commande", async () => {
    const email = uniqueEmail("rattachee-expiree");
    sessionCreated("cs_test_rattachee_expiree");
    attachPersistsThenFails();
    mocks.sessionsExpire.mockResolvedValue({});

    const res = await startCheckout(undefined, formDataFor(email));

    expect(res?.error).toBeTruthy();
    expect(mocks.sessionsExpire).toHaveBeenCalledWith("cs_test_rattachee_expiree");
    expect(await statusOfOrderFor(email)).toBe("cancelled");
  });

  it("annule quand l'expiration échoue mais que la session est déjà expirée", async () => {
    const email = uniqueEmail("rattachee-deja-expiree");
    sessionCreated("cs_test_rattachee_deja_expiree");
    attachPersistsThenFails();
    mocks.sessionsExpire.mockRejectedValue(new Error("session non ouverte"));
    mocks.sessionsRetrieve.mockResolvedValue({ status: "expired" });

    await startCheckout(undefined, formDataFor(email));

    expect(await statusOfOrderFor(email)).toBe("cancelled");
  });

  it("laisse la commande pending et journalise commande, session et cause quand Stripe est injoignable", async () => {
    const email = uniqueEmail("rattachee-injoignable");
    const refus = new Error("The provided key does not have the required permissions.");
    sessionCreated("cs_test_rattachee_injoignable");
    attachPersistsThenFails();
    mocks.sessionsExpire.mockRejectedValue(new Error("clé restreinte"));
    mocks.sessionsRetrieve.mockRejectedValue(refus);

    const res = await startCheckout(undefined, formDataFor(email));

    const order = await orderFor(email);
    expect(res?.error).toBeTruthy();
    expect(order?.status).toBe("pending");
    expect(errorSpy).toHaveBeenCalledWith(INJOIGNABLE, {
      orderId: order?.id,
      stripeSessionId: "cs_test_rattachee_injoignable",
      cause: refus,
    });
  });

  it.each([
    ["already_paid", { status: "complete", payment_status: "paid", payment_intent: "pi_test_1" }],
    ["awaiting_async", { status: "complete", payment_status: "unpaid" }],
  ])(
    "n'annule pas une commande dont la session reste exploitable (%s)",
    async (outcome, session) => {
      const email = uniqueEmail(`rattachee-${outcome}`);
      sessionCreated(`cs_test_rattachee_${outcome}`);
      attachPersistsThenFails();
      mocks.sessionsExpire.mockRejectedValue(new Error("session terminée"));
      mocks.sessionsRetrieve.mockResolvedValue(session);

      const res = await startCheckout(undefined, formDataFor(email));

      const order = await orderFor(email);
      expect(res?.error).toBeTruthy();
      expect(order?.status).toBe("pending");
      expect(errorSpy).toHaveBeenCalledWith(EXPLOITABLE, {
        orderId: order?.id,
        stripeSessionId: `cs_test_rattachee_${outcome}`,
        outcome,
      });
    },
  );
});

describe("abandonPendingOrder", () => {
  it("annule une commande pending sans session Stripe", async () => {
    const { db, order } = await pendingOrder();

    await abandonPendingOrder(db, order.id);

    expect(expireSessionForCancel).toHaveBeenCalledWith(null);
    expect(await reloadStatus(order.id)).toBe("cancelled");
  });

  it("est idempotente : un second appel ne consulte plus Stripe", async () => {
    const { db, order } = await pendingOrder();

    await abandonPendingOrder(db, order.id);
    await abandonPendingOrder(db, order.id);

    expect(expireSessionForCancel).toHaveBeenCalledTimes(1);
    expect(await reloadStatus(order.id)).toBe("cancelled");
  });

  it("ne touche pas une commande déjà payée et ne consulte pas Stripe", async () => {
    const { db, order } = await pendingOrder();
    await updateOrderStatus(db, order.id, "paid");

    await abandonPendingOrder(db, order.id);

    expect(expireSessionForCancel).not.toHaveBeenCalled();
    expect(await reloadStatus(order.id)).toBe("paid");
  });

  it("ne lève pas pour une commande inconnue", async () => {
    const db = await getDb();

    await expect(abandonPendingOrder(db, randomUUID())).resolves.toBeUndefined();

    expect(expireSessionForCancel).not.toHaveBeenCalled();
  });

  it("n'écrase pas un paiement arrivé entre la garde Stripe et l'annulation", async () => {
    const { db, order } = await pendingOrder();
    vi.mocked(expireSessionForCancel).mockImplementationOnce(async () => {
      await updateOrderStatus(db, order.id, "paid");
      return { outcome: "expired" };
    });

    await abandonPendingOrder(db, order.id);

    expect(await reloadStatus(order.id)).toBe("paid");
  });

  it("laisse la commande pending sur un verdict Stripe inconnu et le journalise", async () => {
    const { db, order } = await pendingOrder();
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce({
      outcome: "verdict_futur",
    } as never);

    await abandonPendingOrder(db, order.id);

    expect(await reloadStatus(order.id)).toBe("pending");
    expect(errorSpy).toHaveBeenCalledWith(
      "[checkout] verdict Stripe inattendu, commande laissée en attente",
      expect.objectContaining({ orderId: order.id }),
    );
  });
});
