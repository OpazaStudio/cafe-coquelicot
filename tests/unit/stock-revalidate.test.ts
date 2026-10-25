// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  sessionsCreate: vi.fn(),
  sessionsExpire: vi.fn(),
  sessionsRetrieve: vi.fn(),
  redirect: vi.fn<(url: string) => never>(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  getMailer: vi.fn(() => null),
  cookieStore: new Map<string, string>(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      mocks.cookieStore.set(name, value);
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
vi.mock("@/lib/stripe-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-session")>();
  return { ...actual, expireSessionForCancel: vi.fn(actual.expireSessionForCancel) };
});

import { startCheckout } from "@/app/checkout/actions";
import { RESERVATION_COOKIE } from "@/lib/checkout/reservation";
import { getDb, type Db } from "@/lib/db/client";
import { orderItems, orders, products } from "@/lib/db/schema";
import { createPendingOrder } from "@/lib/orders";
import { revalidateAvailability, slugsOfOrder } from "@/lib/stock/revalidate";
import { expireSessionForCancel } from "@/lib/stripe-session";
import { createTestDb } from "../helpers/db";

const CHECKOUT_URL = "https://checkout.stripe.test/c/pay/cs_test_revalidate";

const camille = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  fulfillment: "retrait" as const,
};

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

async function addProduct(db: Db, slug: string): Promise<string> {
  const [row] = await db
    .insert(products)
    .values({
      slug,
      name: `bouquet ${slug}`,
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
    })
    .returning({ id: products.id });
  return row.id;
}

function revalidatedPaths(): string[] {
  return mocks.revalidatePath.mock.calls.map((call) => String(call[0]));
}

describe("slugsOfOrder", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb({ seed: false });
  });

  it("retrouve les slugs d'une commande en ignorant product_id nul", async () => {
    await addProduct(db, "limite");
    await addProduct(db, "disparu");
    const { order } = await createPendingOrder(db, camille, [
      { slug: "limite", qty: 1 },
      { slug: "disparu", qty: 1 },
    ]);

    await db.delete(products).where(eq(products.slug, "disparu"));

    expect(await slugsOfOrder(db, order.id)).toEqual(["limite"]);
  });

  it("dédoublonne un produit présent sur plusieurs lignes", async () => {
    const productId = await addProduct(db, "limite");
    const { order } = await createPendingOrder(db, camille, [
      { slug: "limite", qty: 1 },
    ]);
    await db.insert(orderItems).values({
      orderId: order.id,
      productId,
      nameSnapshot: "bouquet limite",
      priceCentsSnapshot: 4000,
      qty: 2,
    });

    expect(await slugsOfOrder(db, order.id)).toEqual(["limite"]);
  });

  it("revalide des chemins littéraux, jamais le motif [slug]", async () => {
    await addProduct(db, "limite");
    const { order } = await createPendingOrder(db, camille, [
      { slug: "limite", qty: 1 },
    ]);
    mocks.revalidatePath.mockClear();

    await revalidateAvailability([order.id], db);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/boutique");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/boutique/limite");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/boutique/[slug]", "page");
    for (const call of mocks.revalidatePath.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });

  it("avale et journalise un échec de revalidation", async () => {
    await addProduct(db, "limite");
    const { order } = await createPendingOrder(db, camille, [
      { slug: "limite", qty: 1 },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.revalidatePath.mockImplementationOnce(() => {
      throw new Error("hors contexte de requête");
    });

    await expect(revalidateAvailability([order.id], db)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[stock] revalidation du cache impossible",
      { orderIds: [order.id] },
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe("startCheckout revalide la disponibilité", () => {
  beforeAll(() => {
    expect(process.env.PGLITE_DATA_DIR).toBe(":memory:");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.clear();
    mocks.revalidatePath.mockImplementation(() => {});
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.sessionsCreate.mockResolvedValue({
      id: `cs_test_${randomUUID()}`,
      url: CHECKOUT_URL,
    });
  });

  afterEach(() => {
    mocks.cookieStore.clear();
  });

  it("revalide aussi après une réservation réussie", async () => {
    const email = uniqueEmail("reservation");

    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.redirect).toHaveBeenCalledWith(CHECKOUT_URL);
    expect(revalidatedPaths()).toEqual(
      expect.arrayContaining(["/", "/boutique", "/boutique/rivage"]),
    );
  });

  it("ne revalide pas la retenue précédente quand le stock n'a pas bougé", async () => {
    const db = await getDb();
    const { order: held } = await createPendingOrder(
      db,
      { ...camille, email: uniqueEmail("retenue") },
      [{ slug: "gabut", qty: 1 }],
    );
    mocks.cookieStore.set(RESERVATION_COOKIE, held.id);
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce({
      outcome: "already_paid",
      paymentIntent: "pi_test_retenue",
    });

    await expect(
      startCheckout(undefined, formDataFor(uniqueEmail("apres-retenue"))),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatedPaths()).toContain("/boutique/rivage");
    expect(revalidatedPaths()).not.toContain("/boutique/gabut");
  });

  it("revalide la retenue précédente libérée", async () => {
    const db = await getDb();
    const { order: released } = await createPendingOrder(
      db,
      { ...camille, email: uniqueEmail("liberee") },
      [{ slug: "gabut", qty: 1 }],
    );
    mocks.cookieStore.set(RESERVATION_COOKIE, released.id);
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce({ outcome: "no_session" });

    await expect(
      startCheckout(undefined, formDataFor(uniqueEmail("apres-liberation"))),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(revalidatedPaths()).toContain("/boutique/gabut");
    expect(revalidatedPaths()).toContain("/boutique/rivage");
  });

  it("revalide la retenue libérée même quand la nouvelle commande est refusée", async () => {
    const db = await getDb();
    await addProduct(db, "epuise-refus");
    await db
      .update(products)
      .set({ stockQty: 0 })
      .where(eq(products.slug, "epuise-refus"));
    const { order: released } = await createPendingOrder(
      db,
      { ...camille, email: uniqueEmail("liberee-refus") },
      [{ slug: "gabut", qty: 1 }],
    );
    mocks.cookieStore.set(RESERVATION_COOKIE, released.id);
    vi.mocked(expireSessionForCancel).mockResolvedValueOnce({ outcome: "no_session" });

    const res = await startCheckout(
      undefined,
      formDataFor(uniqueEmail("refus"), [{ slug: "epuise-refus", qty: 1 }]),
    );

    expect(res).toMatchObject({ error: expect.any(String) });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
    expect(revalidatedPaths()).toContain("/boutique/gabut");
  });

  it("redirige vers Stripe même quand la revalidation échoue", async () => {
    const email = uniqueEmail("revalidation-ko");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error("hors contexte de requête");
    });

    await expect(startCheckout(undefined, formDataFor(email))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.redirect).toHaveBeenCalledWith(CHECKOUT_URL);
    const db = await getDb();
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.customerEmail, email));
    expect(rows[0]?.status).toBe("pending");
    errorSpy.mockRestore();
  });
});
