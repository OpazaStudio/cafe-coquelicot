// @vitest-environment node
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

vi.mock("@/lib/auth/dal", () => ({ verifySession: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/storage", () => ({
  deleteImage: vi.fn().mockResolvedValue(undefined),
  uploadImage: vi.fn(),
}));

import type { Db } from "@/lib/db/client";
import { orderItems, orders, productSizes, products } from "@/lib/db/schema";
import { createPendingOrder } from "@/lib/orders";
import { releaseOrderStock } from "@/lib/stock/release";
import { createTestDb } from "../helpers/db";

let db: Db;
vi.mock("@/lib/db/client", async (orig) => {
  const actual = await orig<typeof import("@/lib/db/client")>();
  return { ...actual, getDb: async () => db };
});

const { createProduct, deleteProduct, updateProduct } = await import(
  "@/app/(admin)/admin/(panel)/produits/actions"
);

const DESCRIPTION = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Édition limitée." }] }],
});

type SizePayload = {
  id?: string;
  key?: string;
  label: string;
  price: string;
  active?: boolean;
  stockQty?: string;
  stockQtyInitial?: string;
};

function formFor(
  sizes: SizePayload[],
  extra: Record<string, string> = {},
  name = "bouquet limite",
): FormData {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("descriptionRich", DESCRIPTION);
  fd.set("price", "40");
  fd.set("category", "frais");
  fd.set("badge", "");
  fd.set("illustrationVariant", "0");
  fd.set("active", "on");
  fd.set(
    "sizes",
    JSON.stringify(
      sizes.map((s, i) => ({ key: s.key ?? s.id ?? `k${i}`, active: true, ...s })),
    ),
  );
  fd.set("colors", "[]");
  fd.set("images", "[]");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function submit(id: string, fd: FormData) {
  try {
    return await updateProduct(id, undefined, fd);
  } catch (e) {
    if ((e as Error).message !== "NEXT_REDIRECT") throw e;
    return undefined;
  }
}

async function makeProduct(opts: {
  slug?: string;
  stockQty?: number | null;
  sizes?: { label: string; stockQty: number | null; active?: boolean }[];
} = {}) {
  const [row] = await db
    .insert(products)
    .values({
      slug: opts.slug ?? "limite",
      name: "bouquet limite",
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
      stockQty: opts.stockQty ?? null,
    })
    .returning({ id: products.id });
  const sizes = opts.sizes
    ? await db
        .insert(productSizes)
        .values(
          opts.sizes.map((s, i) => ({
            productId: row.id,
            label: s.label,
            priceCents: 3000 + i * 1000,
            sortOrder: i,
            active: s.active ?? true,
            stockQty: s.stockQty,
          })),
        )
        .returning({ id: productSizes.id, label: productSizes.label })
    : [];
  return { id: row.id, sizes };
}

async function sizeRows(productId: string) {
  return db
    .select()
    .from(productSizes)
    .where(eq(productSizes.productId, productId))
    .orderBy(asc(productSizes.sortOrder));
}

async function productRow(id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row;
}

async function loggedTestDb(
  queries: { sql: string; params: unknown[] }[],
): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/lib/db/schema");
  const logged = drizzle(new PGlite(), {
    schema,
    logger: { logQuery: (sql, params) => queries.push({ sql, params }) },
  });
  await migrate(logged, {
    migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations"),
  });
  return logged as unknown as Db;
}

let orderSeq = 0;
async function reserveOn(
  sizeId: string | null,
  productId: string | null,
  qty: number,
  status: "pending" | "paid" = "pending",
) {
  orderSeq += 1;
  const [order] = await db
    .insert(orders)
    .values({
      number: `CMD-${String(orderSeq).padStart(4, "0")}`,
      status,
      customerName: "Camille Martin",
      customerEmail: "camille@exemple.fr",
      fulfillment: "retrait",
      subtotalCents: 3000,
      totalCents: 3000,
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values({
    orderId: order.id,
    nameSnapshot: "bouquet limite",
    priceCentsSnapshot: 3000,
    qty,
    stockReservedQty: qty,
    stockReservedSizeId: sizeId,
    stockReservedProductId: productId,
  });
  return order.id;
}

beforeEach(async () => {
  db = await createTestDb({ seed: false });
});

describe("stock depuis le back-office (logique, sans concurrence réelle)", () => {
  it("payload sans clé de stock laisse le compteur inchangé", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 4 }] });
    await submit(
      p.id,
      formFor([{ id: p.sizes[0].id, label: "Petit", price: "30" }]),
    );
    const after = await sizeRows(p.id);
    expect(after[0].stockQty).toBe(4);
    expect(after[0].priceCents).toBe(3000);
  });

  it("saisie égale à l'initiale après un décrément concurrent conserve le compteur courant", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 5 }] });
    await db
      .update(productSizes)
      .set({ stockQty: 3 })
      .where(eq(productSizes.id, p.sizes[0].id));
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "5",
          stockQtyInitial: "5",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(3);
  });

  it("compare après parse numérique : « 07 » vaut « 7 »", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 7 }] });
    await db
      .update(productSizes)
      .set({ stockQty: 2 })
      .where(eq(productSizes.id, p.sizes[0].id));
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "07",
          stockQtyInitial: "7",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(2);
  });

  it("saisie différente applique le delta", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 3 }] });
    await db
      .update(productSizes)
      .set({ stockQty: 2 })
      .where(eq(productSizes.id, p.sizes[0].id));
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "5",
          stockQtyInitial: "3",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(4);
  });

  it("borne le delta à zéro au lieu de passer sous zéro", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 9 }] });
    await db
      .update(productSizes)
      .set({ stockQty: 1 })
      .where(eq(productSizes.id, p.sizes[0].id));
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "2",
          stockQtyInitial: "9",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(0);
  });

  it("chaîne vide pose NULL, « 0 » pose 0", async () => {
    const p = await makeProduct({
      sizes: [
        { label: "Petit", stockQty: 4 },
        { label: "Grand", stockQty: 4 },
      ],
    });
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "",
          stockQtyInitial: "4",
        },
        {
          id: p.sizes[1].id,
          label: "Grand",
          price: "40",
          stockQty: "0",
          stockQtyInitial: "4",
        },
      ]),
    );
    const after = await sizeRows(p.id);
    expect(after[0].stockQty).toBeNull();
    expect(after[1].stockQty).toBe(0);
  });

  it("delta sur un compteur passé à NULL pose la valeur absolue", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 3 }] });
    await db
      .update(productSizes)
      .set({ stockQty: null })
      .where(eq(productSizes.id, p.sizes[0].id));
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "5",
          stockQtyInitial: "3",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(5);
  });

  it("une initiale illimitée pose la valeur absolue", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: null }] });
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "6",
          stockQtyInitial: "",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(6);
  });

  it("laisse l'aller-retour illimité puis retour à la même valeur sans effet", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 4 }] });
    const orderId = await reserveOn(p.sizes[0].id, null, 3);
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "",
          stockQtyInitial: "4",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBeNull();
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          stockQty: "4",
          stockQtyInitial: "",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(4);
    await db.transaction(async (tx) => releaseOrderStock(tx, orderId));
    expect((await sizeRows(p.id))[0].stockQty).toBe(7);
  });

  it("insère le stock d'une taille nouvelle telle quelle", async () => {
    const p = await makeProduct({});
    await submit(
      p.id,
      formFor([
        { label: "Petit", price: "30", stockQty: "2" },
        { label: "Grand", price: "40", stockQty: "" },
      ]),
    );
    const after = await sizeRows(p.id);
    expect(after.map((s) => [s.label, s.stockQty])).toEqual([
      ["Petit", 2],
      ["Grand", null],
    ]);
  });

  it("refuse abc, 1.5 et -1 avec un message nommant la taille", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 4 }] });
    for (const bad of ["abc", "1.5", "-1"]) {
      const state = await submit(
        p.id,
        formFor([
          {
            id: p.sizes[0].id,
            label: "Moyen",
            price: "30",
            stockQty: bad,
            stockQtyInitial: "4",
          },
        ]),
      );
      expect(state?.errors?.sizes?.[0]).toBe(
        "Taille « Moyen » : stock invalide — un nombre entier jusqu'à 9999, ou vide pour illimité.",
      );
      expect((await sizeRows(p.id))[0].stockQty).toBe(4);
    }
  });

  it("refuse une saisie qui n'est pas une chaîne, sans la coercer", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 4 }] });
    const fd = formFor([]);
    fd.set(
      "sizes",
      JSON.stringify([
        {
          key: "k0",
          id: p.sizes[0].id,
          label: "Moyen",
          price: "30",
          active: true,
          stockQty: 9,
          stockQtyInitial: "4",
        },
      ]),
    );
    const state = await submit(p.id, fd);
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : stock invalide — un nombre entier jusqu'à 9999, ou vide pour illimité.",
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(4);
  });

  it("refuse une saisie sans valeur initiale sur une taille existante", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 4 }] });
    const state = await submit(
      p.id,
      formFor([
        { id: p.sizes[0].id, label: "Moyen", price: "30", stockQty: "9" },
      ]),
    );
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : stock initial manquant — rechargez la page avant d'enregistrer.",
    );
    expect((await sizeRows(p.id))[0].stockQty).toBe(4);
  });

  it("refuse de supprimer une taille qui porte une réservation pending", async () => {
    const p = await makeProduct({
      sizes: [
        { label: "Moyen", stockQty: 1 },
        { label: "Grand", stockQty: 2 },
      ],
    });
    await reserveOn(p.sizes[0].id, null, 1);
    await reserveOn(p.sizes[0].id, null, 1);
    const before = await productRow(p.id);
    const state = await submit(
      p.id,
      formFor(
        [
          {
            id: p.sizes[1].id,
            label: "Grand",
            price: "40",
            stockQty: "2",
            stockQtyInitial: "2",
          },
        ],
        {},
        "nom réécrit par la soumission",
      ),
    );
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : 2 commandes en attente de paiement retiennent encore son stock — impossible de la supprimer. Attendez leur expiration ou annulez-les.",
    );
    const row = await productRow(p.id);
    expect(row.name).toBe("bouquet limite");
    expect(row.updatedAt).toEqual(before.updatedAt);
    const after = await sizeRows(p.id);
    expect(after.map((s) => s.label)).toEqual(["Moyen", "Grand"]);
    expect(after.map((s) => s.stockQty)).toEqual([1, 2]);
  });

  it("accorde le singulier au message de refus", async () => {
    const p = await makeProduct({
      sizes: [
        { label: "Moyen", stockQty: 1 },
        { label: "Grand", stockQty: 2 },
      ],
    });
    await reserveOn(p.sizes[0].id, null, 1);
    const state = await submit(
      p.id,
      formFor([
        {
          id: p.sizes[1].id,
          label: "Grand",
          price: "40",
          stockQty: "2",
          stockQtyInitial: "2",
        },
      ]),
    );
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : 1 commande en attente de paiement retient encore son stock — impossible de la supprimer. Attendez son expiration ou annulez-la.",
    );
    const after = await sizeRows(p.id);
    expect(after.map((size) => size.label)).toEqual(["Moyen", "Grand"]);
    expect(after.map((size) => size.stockQty)).toEqual([1, 2]);
  });

  it("laisse supprimer une taille dont la réservation appartient à une commande payée", async () => {
    const p = await makeProduct({
      sizes: [
        { label: "Moyen", stockQty: 1 },
        { label: "Grand", stockQty: 2 },
      ],
    });
    await reserveOn(p.sizes[0].id, null, 1, "paid");
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[1].id,
          label: "Grand",
          price: "40",
          stockQty: "2",
          stockQtyInitial: "2",
        },
      ]),
    );
    expect((await sizeRows(p.id)).map((s) => s.label)).toEqual(["Grand"]);
  });

  it("refuse de désactiver la dernière taille active d'un produit à compteur fini", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 0 }] });
    const before = await productRow(p.id);
    const state = await submit(
      p.id,
      formFor(
        [
          {
            id: p.sizes[0].id,
            label: "Moyen",
            price: "30",
            active: false,
            stockQty: "0",
            stockQtyInitial: "0",
          },
        ],
        {},
        "nom réécrit par la soumission",
      ),
    );
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : impossible de désactiver la dernière taille active d'un produit à stock limité — le produit repasserait en vente illimitée. Gardez une taille active, ou passez son stock à « Illimité » (champ vide) d'abord.",
    );
    const row = await productRow(p.id);
    expect(row.name).toBe("bouquet limite");
    expect(row.updatedAt).toEqual(before.updatedAt);
    const after = await sizeRows(p.id);
    expect(after[0].active).toBe(true);
    expect(after[0].stockQty).toBe(0);
  });

  it("refuse de retirer toutes les tailles d'un produit épuisé sans compteur produit", async () => {
    const p = await makeProduct({
      stockQty: null,
      sizes: [{ label: "Moyen", stockQty: 0 }],
    });
    const state = await submit(p.id, formFor([]));
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : retirer la dernière taille active d'un produit à stock limité le remettrait en vente illimitée. Renseignez « Disponible à la vente » sur le produit, ou gardez une taille active.",
    );
    expect((await sizeRows(p.id)).map((s) => s.label)).toEqual(["Moyen"]);
    expect((await productRow(p.id)).stockQty).toBeNull();
  });

  it("laisse convertir en produit nu quand un compteur produit fini est soumis", async () => {
    const p = await makeProduct({
      stockQty: null,
      sizes: [{ label: "Moyen", stockQty: 0 }],
    });
    await submit(p.id, formFor([], { stockQty: "0", stockQtyInitial: "" }));
    expect(await sizeRows(p.id)).toEqual([]);
    expect((await productRow(p.id)).stockQty).toBe(0);
  });

  it("refuse de retirer la taille à compteur fini en ne gardant qu'une taille inactive illimitée", async () => {
    const p = await makeProduct({
      sizes: [
        { label: "Moyen", stockQty: 0, active: true },
        { label: "Archive", stockQty: null, active: false },
      ],
    });
    const state = await submit(
      p.id,
      formFor([
        {
          id: p.sizes[1].id,
          label: "Archive",
          price: "40",
          active: false,
          stockQty: "",
          stockQtyInitial: "",
        },
      ]),
    );
    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Moyen » : retirer la dernière taille active d'un produit à stock limité le remettrait en vente illimitée. Renseignez « Disponible à la vente » sur le produit, ou gardez une taille active.",
    );
    expect((await sizeRows(p.id)).map((s) => s.label)).toEqual(["Moyen", "Archive"]);
  });

  it("ne compte pas comme active une taille soumise qui n'existe plus en base", async () => {
    const p = await makeProduct({ sizes: [{ label: "Petit", stockQty: 0 }] });
    const fantome = "00000000-0000-4000-8000-0000000000ff";

    const state = await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Petit",
          price: "30",
          active: false,
          stockQty: "0",
          stockQtyInitial: "0",
        },
        { id: fantome, label: "Grand", price: "40", active: true },
      ]),
    );

    expect(state?.errors?.sizes?.[0]).toBe(
      "Taille « Petit » : impossible de désactiver la dernière taille active d'un produit à stock limité — le produit repasserait en vente illimitée. Gardez une taille active, ou passez son stock à « Illimité » (champ vide) d'abord.",
    );
    expect(
      (await sizeRows(p.id)).map((s) => [s.label, s.active, s.stockQty]),
    ).toEqual([["Petit", true, 0]]);
    await expect(
      createPendingOrder(
        db,
        { name: "Camille", email: "camille@exemple.fr", fulfillment: "retrait" },
        [{ slug: "limite", qty: 3 }],
      ),
    ).rejects.toThrow("Choix de taille requis pour bouquet limite.");
  });

  it("laisse désactiver la dernière taille active quand son stock devient illimité", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 0 }] });
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Moyen",
          price: "30",
          active: false,
          stockQty: "",
          stockQtyInitial: "0",
        },
      ]),
    );
    const after = await sizeRows(p.id);
    expect(after[0].active).toBe(false);
    expect(after[0].stockQty).toBeNull();
  });

  it("laisse désactiver la dernière taille active d'un produit illimité", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: null }] });
    await submit(
      p.id,
      formFor([
        {
          id: p.sizes[0].id,
          label: "Moyen",
          price: "30",
          active: false,
          stockQty: "",
          stockQtyInitial: "",
        },
      ]),
    );
    expect((await sizeRows(p.id))[0].active).toBe(false);
  });

  it("n'écrit jamais stockQty via values ni via ...rest", async () => {
    const p = await makeProduct({
      stockQty: null,
      sizes: [{ label: "Moyen", stockQty: 4 }],
    });
    await db
      .update(productSizes)
      .set({ stockQty: 1 })
      .where(eq(productSizes.id, p.sizes[0].id));
    await submit(
      p.id,
      formFor(
        [
          {
            id: p.sizes[0].id,
            label: "Moyen",
            price: "30",
            stockQty: "4",
            stockQtyInitial: "4",
          },
        ],
        { stockQty: "999", stockQtyInitial: "0" },
      ),
    );
    expect((await productRow(p.id)).stockQty).toBeNull();
    expect((await sizeRows(p.id))[0].stockQty).toBe(1);
  });

  it("applique le delta au produit nu quand il n'a aucune taille", async () => {
    const p = await makeProduct({ stockQty: 3 });
    await db.update(products).set({ stockQty: 2 }).where(eq(products.id, p.id));
    await submit(p.id, formFor([], { stockQty: "5", stockQtyInitial: "3" }));
    expect((await productRow(p.id)).stockQty).toBe(4);
  });

  it("pose le stock d'un produit créé depuis le formulaire", async () => {
    try {
      await createProduct(
        undefined,
        formFor([], { stockQty: "2", stockQtyInitial: "" }, "bouquet neuf"),
      );
    } catch (e) {
      if ((e as Error).message !== "NEXT_REDIRECT") throw e;
    }
    const [row] = await db
      .select()
      .from(products)
      .where(eq(products.slug, "bouquet-neuf"));
    expect(row.stockQty).toBe(2);
  });

  it("prend tous ses verrous de tailles dans l'ordre trié, quel que soit l'ordre de soumission", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    db = await loggedTestDb(queries);
    const p = await makeProduct({
      sizes: [
        { label: "Moyen", stockQty: 4 },
        { label: "Grand", stockQty: 4 },
      ],
    });
    const ordered = [...p.sizes].sort((a, b) => (a.id < b.id ? -1 : 1));
    queries.length = 0;
    await submit(
      p.id,
      formFor(
        [...ordered].reverse().map((s, i) => ({
          id: s.id,
          label: s.label,
          price: `${30 + i}`,
          stockQty: "6",
          stockQtyInitial: "4",
        })),
      ),
    );
    const idOf = (q: { params: unknown[] }) =>
      q.params.find((v) => ordered.some((s) => s.id === v));
    const touched = queries
      .filter((q) => /update "product_sizes"/.test(q.sql))
      .map(idOf);
    const deltas = queries
      .filter((q) => /update "product_sizes" set "stock_qty"/.test(q.sql))
      .map(idOf);
    const sorted = ordered.map((s) => s.id);
    expect(touched.length).toBe(4);
    expect([...new Set(touched)]).toEqual(sorted);
    expect(deltas).toEqual(sorted);
  });
});

describe("deleteProduct et les réservations en attente (logique, sans concurrence réelle)", () => {
  it("refuse de supprimer un produit dont une taille porte une réservation pending", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 1 }] });
    await reserveOn(p.sizes[0].id, null, 1);
    await expect(deleteProduct(p.id)).rejects.toThrow(
      "Taille « Moyen » : 1 commande en attente de paiement retient encore son stock — impossible de supprimer le produit. Attendez son expiration ou annulez-la.",
    );
    expect(await productRow(p.id)).toBeTruthy();
    expect((await sizeRows(p.id)).length).toBe(1);
  });

  it("supprime le produit quand aucune commande en attente ne retient son stock", async () => {
    const p = await makeProduct({ sizes: [{ label: "Moyen", stockQty: 1 }] });
    await reserveOn(p.sizes[0].id, null, 1, "paid");
    await deleteProduct(p.id);
    expect(await productRow(p.id)).toBeUndefined();
  });
});
