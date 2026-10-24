// @vitest-environment node
// La route de hooks e2e crée des commandes `paid` sans authentification.
//
// La garde ne peut pas s'appuyer sur NODE_ENV : les e2e tournent justement
// contre un build de production (playwright.config.ts → build && start).
// On exige donc, en plus du flag, l'absence de DATABASE_URL — c'est-à-dire
// une base PGlite jetable. En déploiement réel DATABASE_URL est obligatoire,
// donc un E2E_TEST_HOOKS=1 ayant fuité dans un env group ne suffit jamais.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { POST } from "@/app/api/e2e/orders/route";
import { getDb } from "@/lib/db/client";
import { orderItems, orders, productSizes, products } from "@/lib/db/schema";

function post(body: Record<string, unknown> = { name: "Camille", items: [{ slug: "rivage", qty: 1 }] }) {
  return POST(
    new Request("http://localhost/api/e2e/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/e2e/orders", () => {
  it("répond 404 quand une vraie base est configurée, même avec le flag", async () => {
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@db.example.com:5432/prod");
    expect((await post()).status).toBe(404);
  });

  it("répond 404 quand le flag est absent", async () => {
    vi.stubEnv("E2E_TEST_HOOKS", "");
    vi.stubEnv("DATABASE_URL", "");
    expect((await post()).status).toBe(404);
  });

  it("répond 404 sur une plateforme d'hébergement, même sans DATABASE_URL", async () => {
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "1");
    expect((await post()).status).toBe(404);
  });

  // NB : NODE_ENV n'est volontairement PAS un critère — le banc e2e tourne
  // contre un build de production. Un déploiement réel sans DATABASE_URL
  // tournerait sur une PGlite éphémère (commandes perdues à chaque
  // redéploiement) : ce n'est pas une configuration de boutique viable.

  it("reste utilisable pour les e2e : flag posé, base PGlite jetable", async () => {
    // Configuration réelle de playwright.config.ts, y compris le build de
    // production (NODE_ENV=production) contre lequel tournent les specs.
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: expect.any(String) });
  });
});

async function sizeOf(slug: string, label: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: productSizes.id, stockQty: productSizes.stockQty })
    .from(productSizes)
    .innerJoin(products, eq(productSizes.productId, products.id))
    .where(and(eq(products.slug, slug), eq(productSizes.label, label)))
    .limit(1);
  return row;
}

async function setStock(slug: string, label: string, stockQty: number | null) {
  const db = await getDb();
  const size = await sizeOf(slug, label);
  await db.update(productSizes).set({ stockQty }).where(eq(productSizes.id, size.id));
}

async function productOf(slug: string) {
  const db = await getDb();
  const [row] = await db
    .select({ stockQty: products.stockQty })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  return row;
}

async function setProductStock(slug: string, stockQty: number | null) {
  const db = await getDb();
  await db.update(products).set({ stockQty }).where(eq(products.slug, slug));
}

async function itemsOf(res: Response) {
  const db = await getDb();
  const { id } = (await res.json()) as { id: string };
  const rows = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(orderItems.nameSnapshot);
  return { id, rows };
}

describe("POST /api/e2e/orders — variantes et stock", () => {
  beforeEach(() => {
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
  });

  it("résout taille et coloris par libellé, sans jamais exposer d'uuid", async () => {
    const res = await post({
      name: "Alix Variantes",
      items: [
        { slug: "lagune", qty: 1, sizeLabel: "Grand" },
        { slug: "solana", qty: 1, sizeLabel: "Moyen", colorLabel: "Blanc" },
      ],
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const { rows } = await itemsOf(res);
    expect(
      rows.map((row) => [
        row.nameSnapshot,
        row.sizeLabelSnapshot,
        row.colorLabelSnapshot,
        row.priceCentsSnapshot,
      ]),
    ).toEqual([
      ["lagune", "Grand", null, 7200],
      ["solana", "Moyen", "Blanc", 3400],
    ]);
  });

  it("décrémente la taille commandée, ni le produit ni les autres tailles", async () => {
    await setStock("lagune", "Grand", 2);
    await setStock("lagune", "Moyen", 5);
    await setProductStock("lagune", 9);
    const res = await post({
      name: "Bruno Stock",
      items: [{ slug: "lagune", qty: 1, sizeLabel: "Grand" }],
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const { rows } = await itemsOf(res);
    expect(rows.map((row) => row.stockReservedQty)).toEqual([1]);
    expect((await sizeOf("lagune", "Grand")).stockQty).toBe(1);
    expect((await sizeOf("lagune", "Moyen")).stockQty).toBe(5);
    expect((await productOf("lagune")).stockQty).toBe(9);
  });

  it("répond 409 avec le message de stock et ne crée aucune commande", async () => {
    await setStock("lagune", "Grand", 0);
    const res = await post({
      name: "Nadia Rupture",
      items: [{ slug: "lagune", qty: 1, sizeLabel: "Grand" }],
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error:
        "Stock insuffisant pour lagune — Grand (1 demandé). " +
        "Réduisez la quantité ou retirez-le du panier.",
    });
    const db = await getDb();
    expect(
      await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.customerName, "Nadia Rupture")),
    ).toEqual([]);
    expect((await sizeOf("lagune", "Grand")).stockQty).toBe(0);
  });

  it("répond 409 sur un libellé introuvable, taille absente du produit comprise", async () => {
    await setStock("lagune", "Grand", 2);
    const inconnu = await post({
      name: "Oscar Libellé",
      items: [{ slug: "lagune", qty: 1, sizeLabel: "Grande" }],
    });
    expect(inconnu.status).toBe(409);
    expect(await inconnu.json()).toEqual({
      error: "Taille « Grande » introuvable pour lagune.",
    });

    const sansTaille = await post({
      name: "Paul SansTaille",
      items: [{ slug: "rivage", qty: 1, sizeLabel: "Grand" }],
    });
    expect(sansTaille.status).toBe(409);
    expect(await sansTaille.json()).toEqual({
      error: "Taille « Grand » introuvable pour rivage.",
    });

    const coloris = await post({
      name: "Rose Coloris",
      items: [{ slug: "solana", qty: 1, sizeLabel: "Moyen", colorLabel: "Doré" }],
    });
    expect(coloris.status).toBe(409);
    expect(await coloris.json()).toEqual({
      error: "Coloris « Doré » introuvable pour solana.",
    });

    const db = await getDb();
    expect(
      await db
        .select({ name: orders.customerName })
        .from(orders)
        .where(
          inArray(orders.customerName, [
            "Oscar Libellé",
            "Paul SansTaille",
            "Rose Coloris",
          ]),
        ),
    ).toEqual([]);
    expect((await sizeOf("lagune", "Grand")).stockQty).toBe(2);
  });

  it("libère le stock quand le hook pose le statut cancelled", async () => {
    await setStock("lagune", "Grand", 2);
    const res = await post({
      name: "Chloé Annulée",
      items: [{ slug: "lagune", qty: 1, sizeLabel: "Grand" }],
      status: "cancelled",
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const { id, rows } = await itemsOf(res);
    const db = await getDb();
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, id));
    expect(order.status).toBe("cancelled");
    expect(rows.map((row) => row.stockReservedQty)).toEqual([0]);
    expect((await sizeOf("lagune", "Grand")).stockQty).toBe(2);
  });
});
