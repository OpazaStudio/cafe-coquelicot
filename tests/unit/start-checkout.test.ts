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
  cookieStore: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      mocks.cookieStore.set(name, value);
      mocks.cookieOptions.set(name, options ?? {});
    },
    delete: (name: string) => {
      mocks.cookieStore.delete(name);
    },
  }),
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
  return {
    ...actual,
    attachStripeSession: vi.fn(actual.attachStripeSession),
    getOrderWithItems: vi.fn(actual.getOrderWithItems),
  };
});
vi.mock("@/lib/stripe-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-session")>();
  return { ...actual, expireSessionForCancel: vi.fn(actual.expireSessionForCancel) };
});

import { startCheckout } from "@/app/checkout/actions";
import { abandonPendingOrder } from "@/lib/checkout/abandon";
import { RESERVATION_COOKIE } from "@/lib/checkout/reservation";
import { getDb } from "@/lib/db/client";
import { orders, productColors, productSizes, products } from "@/lib/db/schema";
import {
  CheckoutError,
  attachStripeSession,
  createPendingOrder,
  getOrderWithItems,
  updateOrderStatus,
} from "@/lib/orders";
import {
  expireSessionForCancel,
  type SessionGuard,
} from "@/lib/stripe-session";

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
  mocks.cookieStore.clear();
  mocks.cookieOptions.clear();
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
    expect(vi.mocked(attachStripeSession).mock.calls.length).toBe(0);
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
    expect(errorSpy).toHaveBeenCalledWith(
      COMPENSATION_IMPOSSIBLE,
      expect.objectContaining({ orderId: expect.any(String) }),
      expect.any(Error),
    );
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

  it("renvoie le refus de stock au client, sans commande ni appel à Stripe", async () => {
    const db = await getDb();
    const slug = "bouquet-stock-refuse";
    const [limite] = await db
      .insert(products)
      .values({
        slug,
        name: "bouquet limité",
        description: "Édition limitée.",
        priceCents: 4000,
        category: "frais",
        stockQty: 1,
      })
      .returning({ id: products.id });
    const email = uniqueEmail("stock-refuse");

    const res = await startCheckout(undefined, formDataFor(email, [{ slug, qty: 2 }]));

    expect(res).toEqual({
      error:
        "Stock insuffisant pour bouquet limité (2 demandés). " +
        "Réduisez la quantité ou retirez-le du panier.",
    });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(expireSessionForCancel).not.toHaveBeenCalled();
    expect(await statusOfOrderFor(email)).toBeUndefined();
    const [row] = await db
      .select({ stockQty: products.stockQty })
      .from(products)
      .where(eq(products.id, limite.id));
    expect(row.stockQty).toBe(1);
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

describe("startCheckout : expiration de la session Stripe", () => {
  it("pose expires_at à 35 minutes, au-dessus du plancher Stripe de 30", async () => {
    const email = uniqueEmail("expires-at");
    sessionCreated("cs_test_expires_at");

    const before = Math.floor(Date.now() / 1000);
    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow("NEXT_REDIRECT");
    const after = Math.floor(Date.now() / 1000);

    const { expires_at: expiresAt } = mocks.sessionsCreate.mock.calls[0][0] as {
      expires_at?: number;
    };
    expect(expiresAt).toBeGreaterThanOrEqual(before + 35 * 60);
    expect(expiresAt).toBeLessThanOrEqual(after + 35 * 60);
  });
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

    await expect(abandonPendingOrder(db, randomUUID())).resolves.toEqual({
      outcome: "not_pending",
    });

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

async function limitedProduct(stockQty: number) {
  const db = await getDb();
  const slug = `plafond-${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(products)
    .values({
      slug,
      name: `bouquet ${slug}`,
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
      stockQty,
    })
    .returning({ id: products.id });
  return { slug, id: row.id };
}

async function productStock(id: string): Promise<number | null> {
  const db = await getDb();
  const [row] = await db
    .select({ stockQty: products.stockQty })
    .from(products)
    .where(eq(products.id, id));
  return row.stockQty;
}

async function sizedProduct(stockQty: number) {
  const db = await getDb();
  const { slug, id } = await limitedProduct(99);
  const [size] = await db
    .insert(productSizes)
    .values({ productId: id, label: "Petit", priceCents: 3000, stockQty, sortOrder: 0 })
    .returning({ id: productSizes.id });
  const colors = await db
    .insert(productColors)
    .values([
      { productId: id, label: "Naturel", sortOrder: 0 },
      { productId: id, label: "Blanc", sortOrder: 1 },
    ])
    .returning({ id: productColors.id });
  return { slug, id, sizeId: size.id, colorIds: colors.map((c) => c.id) };
}

async function sizeStock(sizeId: string): Promise<number | null> {
  const db = await getDb();
  const [row] = await db
    .select({ stockQty: productSizes.stockQty })
    .from(productSizes)
    .where(eq(productSizes.id, sizeId));
  return row.stockQty;
}

describe("startCheckout : cookie de réservation (logique, sans concurrence réelle)", () => {
  it("pose le cookie httpOnly sur l'id de la commande, aligné sur expires_at", async () => {
    const email = uniqueEmail("cookie-pose");
    sessionCreated("cs_test_cookie_pose");

    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow("NEXT_REDIRECT");

    const order = await orderFor(email);
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(order?.id);
    expect(mocks.cookieOptions.get(RESERVATION_COOKIE)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 35 * 60,
    });
  });

  it("libère la commande désignée par le cookie avant de réserver", async () => {
    const { slug, id } = await limitedProduct(1);
    const premier = uniqueEmail("cookie-premier");
    const second = uniqueEmail("cookie-second");
    sessionCreated("cs_test_cookie_premier");

    await expect(
      startCheckout(undefined, formDataFor(premier, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(await productStock(id)).toBe(0);

    sessionCreated("cs_test_cookie_second");
    mocks.sessionsExpire.mockResolvedValue({});

    await expect(
      startCheckout(undefined, formDataFor(second, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.sessionsExpire).toHaveBeenCalledWith("cs_test_cookie_premier");
    expect(await statusOfOrderFor(premier)).toBe("cancelled");
    expect(await statusOfOrderFor(second)).toBe("pending");
    expect(await productStock(id)).toBe(0);
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(
      (await orderFor(second))?.id,
    );
  });

  it("ignore un cookie qui ne désigne aucune commande", async () => {
    const email = uniqueEmail("cookie-orphelin");
    mocks.cookieStore.set(RESERVATION_COOKIE, randomUUID());
    sessionCreated("cs_test_cookie_orphelin");

    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow("NEXT_REDIRECT");

    expect(expireSessionForCancel).not.toHaveBeenCalled();
    expect(await statusOfOrderFor(email)).toBe("pending");
  });

  it.each([
    ["chemin", "../../etc/passwd"],
    ["uuid tronqué", "00000000-0000-4000-8000"],
    ["uuid de mauvaise version", "00000000-0000-9000-8000-000000000001"],
    ["vide", ""],
  ])("ignore un cookie forgé (%s) sans interroger la base", async (_quoi, forge) => {
    const email = uniqueEmail("cookie-forge");
    mocks.cookieStore.set(RESERVATION_COOKIE, forge);
    sessionCreated(`cs_test_cookie_forge_${randomUUID()}`);

    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow("NEXT_REDIRECT");

    expect(vi.mocked(getOrderWithItems).mock.calls.length).toBe(0);
    expect(expireSessionForCancel).not.toHaveBeenCalled();
    expect(await statusOfOrderFor(email)).toBe("pending");
  });

  it("efface le cookie d'une commande déjà payée, sans la toucher", async () => {
    const { slug, id } = await limitedProduct(1);
    const payee = uniqueEmail("cookie-terminal");
    sessionCreated(`cs_test_cookie_terminal_${randomUUID()}`);
    await expect(
      startCheckout(undefined, formDataFor(payee, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    await updateOrderStatus(await getDb(), (await orderFor(payee))!.id, "paid");

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("cookie-terminal-2"), [
        { slug: "bouquet-jamais-vu", qty: 1 },
      ]),
    );

    expect(res?.error).toMatch(/n'est plus disponible/);
    expect(await statusOfOrderFor(payee)).toBe("paid");
    expect(await productStock(id)).toBe(0);
    expect(mocks.cookieStore.has(RESERVATION_COOKIE)).toBe(false);
    expect(mocks.sessionsExpire).not.toHaveBeenCalled();
  });

  it("ne libère pas le stock d'une commande payée entre la garde et l'annulation", async () => {
    const { slug, id } = await limitedProduct(1);
    const email = uniqueEmail("paiement-entre-deux");
    sessionCreated(`cs_test_paiement_entre_deux_${randomUUID()}`);
    await expect(
      startCheckout(undefined, formDataFor(email, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    const db = await getDb();
    const orderId = (await orderFor(email))!.id;
    expect(await productStock(id)).toBe(0);

    vi.mocked(expireSessionForCancel).mockImplementationOnce(async () => {
      await updateOrderStatus(db, orderId, "paid");
      return { outcome: "expired" };
    });

    await expect(abandonPendingOrder(db, orderId)).resolves.toEqual({
      outcome: "not_pending",
    });
    expect(await statusOfOrderFor(email)).toBe("paid");
    expect(await productStock(id)).toBe(0);
  });

  it("ne touche pas à une commande payée désignée par le cookie", async () => {
    const { slug, id } = await limitedProduct(2);
    const payee = uniqueEmail("cookie-payee");
    sessionCreated("cs_test_cookie_payee");
    await expect(
      startCheckout(undefined, formDataFor(payee, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    await updateOrderStatus(await getDb(), (await orderFor(payee))!.id, "paid");

    const suivant = uniqueEmail("cookie-apres-payee");
    sessionCreated("cs_test_cookie_apres_payee");
    await expect(
      startCheckout(undefined, formDataFor(suivant, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(await statusOfOrderFor(payee)).toBe("paid");
    expect(mocks.sessionsExpire).not.toHaveBeenCalled();
    expect(await productStock(id)).toBe(0);
  });
});

describe("startCheckout : refus de stock (logique, sans concurrence réelle)", () => {
  it("refuse 99 sur une taille à 3 sans écrire ni appeler Stripe", async () => {
    const { slug, sizeId, colorIds } = await sizedProduct(3);
    const email = uniqueEmail("plafond-99");

    const res = await startCheckout(
      undefined,
      formDataFor(email, [{ slug, sizeId, colorId: colorIds[0], qty: 99 }]),
    );

    expect(res).toEqual({
      error:
        `Stock insuffisant pour bouquet ${slug} — Petit (99 demandés). ` +
        `Réduisez la quantité ou retirez-le du panier.`,
    });
    expect(await statusOfOrderFor(email)).toBeUndefined();
    expect(await sizeStock(sizeId)).toBe(3);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuse sur le total agrégé de la taille, deux coloris confondus", async () => {
    const { slug, sizeId, colorIds } = await sizedProduct(3);
    const email = uniqueEmail("plafond-agrege");

    const res = await startCheckout(
      undefined,
      formDataFor(email, [
        { slug, sizeId, colorId: colorIds[0], qty: 2 },
        { slug, sizeId, colorId: colorIds[1], qty: 2 },
      ]),
    );

    expect(res).toEqual({
      error:
        `Stock insuffisant pour bouquet ${slug} — Petit (4 demandés). ` +
        `Réduisez la quantité ou retirez-le du panier.`,
    });
    expect(await statusOfOrderFor(email)).toBeUndefined();
    expect(await sizeStock(sizeId)).toBe(3);
  });

  it("laisse passer le total agrégé qui tient dans le compteur", async () => {
    const { slug, sizeId, colorIds } = await sizedProduct(3);
    const email = uniqueEmail("plafond-agrege-ok");
    sessionCreated("cs_test_plafond_agrege_ok");

    await expect(
      startCheckout(
        undefined,
        formDataFor(email, [
          { slug, sizeId, colorId: colorIds[0], qty: 2 },
          { slug, sizeId, colorId: colorIds[1], qty: 1 },
        ]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(await statusOfOrderFor(email)).toBe("pending");
    expect(await sizeStock(sizeId)).toBe(0);
  });

  it("laisse createPendingOrder refuser lui-même une ligne irrésoluble", async () => {
    const { slug, sizeId } = await sizedProduct(1);
    const sansTaille = uniqueEmail("plafond-sans-taille");
    const inconnu = uniqueEmail("plafond-inconnu");

    expect(
      (await startCheckout(undefined, formDataFor(sansTaille, [{ slug, qty: 99 }])))?.error,
    ).toMatch(/Choix de taille requis/);
    expect(
      (
        await startCheckout(
          undefined,
          formDataFor(inconnu, [{ slug: "bouquet-jamais-vu", qty: 99 }]),
        )
      )?.error,
    ).toMatch(/n'est plus disponible/);
    expect(await sizeStock(sizeId)).toBe(1);
  });
});

const retenueEchec = (item: string) =>
  `Une commande précédente retient encore « ${item} ». ` +
  `Réessayez dans quelques instants, ou retirez-le du panier pour ` +
  `commander le reste. Si cela persiste, contactez-nous.`;
const retenuePayee = (item: string) =>
  `Un paiement pour « ${item} » vient d'être enregistré. ` +
  `Vous allez recevoir un e-mail de confirmation. ` +
  `Retirez-le du panier pour commander le reste.`;
const retenueEnCours = (item: string) =>
  `Un paiement est en cours de confirmation pour « ${item} ». ` +
  `Retirez-le du panier pour commander le reste.`;

describe("startCheckout : retenue précédente non libérée (logique, sans concurrence réelle)", () => {
  async function retenueBloquee(verdict: SessionGuard) {
    const { slug, id } = await limitedProduct(1);
    const premier = uniqueEmail("retenue");
    sessionCreated(`cs_test_retenue_${randomUUID()}`);

    await expect(
      startCheckout(undefined, formDataFor(premier, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(await productStock(id)).toBe(0);

    const orderId = (await orderFor(premier))!.id;
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce(verdict);
    return { slug, id, premier, orderId };
  }

  it("dit la vérité au lieu de « réduisez la quantité » quand la libération échoue", async () => {
    const { slug, id, premier, orderId } = await retenueBloquee({ outcome: "unreachable" });
    const second = uniqueEmail("retenue-echec");

    const res = await startCheckout(undefined, formDataFor(second, [{ slug, qty: 1 }]));

    expect(res).toEqual({ error: retenueEchec(`bouquet ${slug}`) });
    expect(await statusOfOrderFor(premier)).toBe("pending");
    expect(await statusOfOrderFor(second)).toBeUndefined();
    expect(await productStock(id)).toBe(0);
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(orderId);
  });

  it("renvoie au courriel quand le paiement précédent est déjà encaissé", async () => {
    const { slug, premier, orderId } = await retenueBloquee({
      outcome: "already_paid",
      paymentIntent: "pi_test_retenue",
    });
    const second = uniqueEmail("retenue-paiement");

    const res = await startCheckout(undefined, formDataFor(second, [{ slug, qty: 1 }]));

    expect(res).toEqual({ error: retenuePayee(`bouquet ${slug}`) });
    expect(await statusOfOrderFor(premier)).toBe("pending");
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(orderId);
  });

  it("ne promet ni encaissement ni courriel sur un paiement asynchrone", async () => {
    const { slug, premier, orderId } = await retenueBloquee({ outcome: "awaiting_async" });
    const second = uniqueEmail("retenue-async");

    const res = await startCheckout(undefined, formDataFor(second, [{ slug, qty: 1 }]));

    expect(res).toEqual({ error: retenueEnCours(`bouquet ${slug}`) });
    expect(await statusOfOrderFor(premier)).toBe("pending");
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(orderId);
  });

  it("ne parle de retenue que pour la clé que la commande précédente retient", async () => {
    const { premier } = await retenueBloquee({ outcome: "unreachable" });
    const epuise = await limitedProduct(0);
    const second = uniqueEmail("retenue-sans-rapport");

    const res = await startCheckout(
      undefined,
      formDataFor(second, [{ slug: epuise.slug, qty: 1 }]),
    );

    expect(res).toEqual({
      error:
        `Stock insuffisant pour bouquet ${epuise.slug} (1 demandé). ` +
        `Retirez-le du panier.`,
    });
    expect(await statusOfOrderFor(premier)).toBe("pending");
  });

  it("dit la vérité sur une taille retenue, pas seulement sur un produit sans taille", async () => {
    const { slug, sizeId, colorIds } = await sizedProduct(1);
    const premier = uniqueEmail("retenue-taille");
    sessionCreated(`cs_test_retenue_taille_${randomUUID()}`);
    await expect(
      startCheckout(
        undefined,
        formDataFor(premier, [{ slug, sizeId, colorId: colorIds[0], qty: 1 }]),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(await sizeStock(sizeId)).toBe(0);
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce({ outcome: "unreachable" });

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("retenue-taille-2"), [
        { slug, sizeId, colorId: colorIds[0], qty: 1 },
      ]),
    );

    expect(res).toEqual({ error: retenueEchec(`bouquet ${slug} — Petit`) });
    expect(await statusOfOrderFor(premier)).toBe("pending");
    expect(await sizeStock(sizeId)).toBe(0);
  });

  it("garde le message d'origine sur une CheckoutError qui n'est pas un refus de stock", async () => {
    const { premier } = await retenueBloquee({ outcome: "unreachable" });
    const second = uniqueEmail("retenue-autre-erreur");

    const res = await startCheckout(
      undefined,
      formDataFor(second, [{ slug: "bouquet-jamais-vu", qty: 1 }]),
    );

    expect(res?.error).toMatch(/n'est plus disponible/);
    expect(await statusOfOrderFor(premier)).toBe("pending");
  });

  it("retombe sur le message ordinaire quand les clés retenues sont inconnues", async () => {
    const { slug, id } = await limitedProduct(1);
    const premier = uniqueEmail("retenue-base-ko");
    sessionCreated(`cs_test_retenue_${randomUUID()}`);
    await expect(
      startCheckout(undefined, formDataFor(premier, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    const orderId = (await orderFor(premier))!.id;
    vi.mocked(getOrderWithItems).mockRejectedValueOnce(new Error("base indisponible"));

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("retenue-base-ko-2"), [{ slug, qty: 1 }]),
    );

    expect(res).toEqual({
      error:
        `Stock insuffisant pour bouquet ${slug} (1 demandé). ` +
        `Retirez-le du panier.`,
    });
    expect(await productStock(id)).toBe(0);
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(orderId);
  });

  it("ne remplace pas le cookie par une commande que Stripe a refusée", async () => {
    const { premier, orderId } = await retenueBloquee({ outcome: "unreachable" });
    const autre = await limitedProduct(5);
    mocks.sessionsCreate.mockRejectedValue(new Error("stripe down"));

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("cookie-apres-stripe-ko"), [
        { slug: autre.slug, qty: 1 },
      ]),
    );

    expect(res?.error).toBeTruthy();
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(orderId);
    expect(await statusOfOrderFor(premier)).toBe("pending");
    expect(await productStock(autre.id)).toBe(5);
  });

  it("n'empêche pas d'acheter un autre bouquet en stock", async () => {
    const { premier } = await retenueBloquee({ outcome: "unreachable" });
    const autre = await limitedProduct(5);
    const second = uniqueEmail("retenue-autre");
    sessionCreated("cs_test_retenue_autre");
    const before = mocks.sessionsCreate.mock.calls.length;

    await expect(
      startCheckout(undefined, formDataFor(second, [{ slug: autre.slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.sessionsCreate.mock.calls.length).toBe(before + 1);
    expect(await statusOfOrderFor(second)).toBe("pending");
    expect(await statusOfOrderFor(premier)).toBe("pending");
    expect(await productStock(autre.id)).toBe(4);
  });

  it("garde le message de stock quand la retenue précédente a bien été libérée", async () => {
    const { slug, id } = await limitedProduct(1);
    const premier = uniqueEmail("retenue-liberee");
    sessionCreated("cs_test_retenue_liberee");
    await expect(
      startCheckout(undefined, formDataFor(premier, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    mocks.sessionsExpire.mockResolvedValue({});

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("retenue-liberee-2"), [{ slug, qty: 2 }]),
    );

    expect(res).toEqual({
      error:
        `Stock insuffisant pour bouquet ${slug} (2 demandés). ` +
        `Réduisez la quantité ou retirez-le du panier.`,
    });
    expect(await statusOfOrderFor(premier)).toBe("cancelled");
    expect(await productStock(id)).toBe(1);
  });

  it("efface le cookie dès que la retenue précédente est libérée", async () => {
    const { slug, id } = await limitedProduct(1);
    const premier = uniqueEmail("cookie-efface");
    sessionCreated("cs_test_cookie_efface");
    await expect(
      startCheckout(undefined, formDataFor(premier, [{ slug, qty: 1 }])),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.cookieStore.get(RESERVATION_COOKIE)).toBe(
      (await orderFor(premier))?.id,
    );
    mocks.sessionsExpire.mockResolvedValue({});

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("cookie-efface-2"), [
        { slug: "bouquet-jamais-vu", qty: 1 },
      ]),
    );

    expect(res?.error).toMatch(/n'est plus disponible/);
    expect(await statusOfOrderFor(premier)).toBe("cancelled");
    expect(await productStock(id)).toBe(1);
    expect(mocks.cookieStore.has(RESERVATION_COOKIE)).toBe(false);
  });
});
