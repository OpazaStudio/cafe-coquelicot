// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));

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

import { cartAvailability } from "@/app/panier/availability";
import { RESERVATION_COOKIE } from "@/lib/checkout/reservation";
import { getDb } from "@/lib/db/client";
import { productColors, productSizes, products } from "@/lib/db/schema";
import { createPendingOrder, updateOrderStatus } from "@/lib/orders";

type SizeSeed = { label: string; priceCents: number; stockQty: number | null };

type Fixture = {
  slug: string;
  productId: string;
  sizes: { id: string; label: string }[];
  colors: { id: string; label: string }[];
};

async function addProduct(opts: {
  stockQty?: number | null;
  sizes?: SizeSeed[];
  colors?: string[];
}): Promise<Fixture> {
  const db = await getDb();
  const slug = `limite-${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(products)
    .values({
      slug,
      name: `bouquet ${slug}`,
      description: "Édition limitée.",
      priceCents: 4000,
      category: "frais",
      stockQty: opts.stockQty ?? null,
    })
    .returning({ id: products.id });
  const sizes = opts.sizes?.length
    ? await db
        .insert(productSizes)
        .values(
          opts.sizes.map((s, i) => ({
            productId: row.id,
            label: s.label,
            priceCents: s.priceCents,
            stockQty: s.stockQty,
            sortOrder: i,
          })),
        )
        .returning({ id: productSizes.id, label: productSizes.label })
    : [];
  const colors = opts.colors?.length
    ? await db
        .insert(productColors)
        .values(
          opts.colors.map((label, i) => ({
            productId: row.id,
            label,
            sortOrder: i,
          })),
        )
        .returning({ id: productColors.id, label: productColors.label })
    : [];
  return { slug, productId: row.id, sizes, colors };
}

async function pendingOrderFor(
  items: { slug: string; sizeId?: string | null; colorId?: string | null; qty: number }[],
) {
  const db = await getDb();
  const { order } = await createPendingOrder(
    db,
    {
      name: "Camille",
      email: `dispo-${randomUUID()}@exemple.fr`,
      fulfillment: "retrait",
    },
    items,
  );
  return order;
}

async function sizeStock(sizeId: string): Promise<number | null> {
  const db = await getDb();
  const [row] = await db
    .select({ stockQty: productSizes.stockQty })
    .from(productSizes)
    .where(eq(productSizes.id, sizeId));
  return row.stockQty;
}

beforeEach(() => {
  mocks.cookieStore.clear();
});

describe("cartAvailability (logique, sans concurrence réelle)", () => {
  it("plafonne sur le total agrégé de la taille", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 3 }],
      colors: ["Naturel", "Blanc"],
    });

    const rows = await cartAvailability([
      { slug, sizeId: sizes[0].id },
      { slug, sizeId: sizes[0].id },
    ]);

    expect(rows).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 3 },
      { slug, sizeId: sizes[0].id, maxQty: 3 },
    ]);
  });

  it("renvoie null pour une taille illimitée", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: null },
        { label: "Grand", priceCents: 5000, stockQty: 2 },
      ],
    });

    expect(await cartAvailability([{ slug, sizeId: sizes[0].id }])).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: null },
    ]);
  });

  it("ne répond que pour les couples demandés", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 1 },
        { label: "Grand", priceCents: 5000, stockQty: 7 },
      ],
    });
    const autre = await addProduct({ stockQty: 4 });

    expect(await cartAvailability([{ slug, sizeId: sizes[1].id }])).toEqual([
      { slug, sizeId: sizes[1].id, maxQty: 7 },
    ]);
    expect(await cartAvailability([{ slug: autre.slug, sizeId: null }])).toEqual([
      { slug: autre.slug, sizeId: null, maxQty: 4 },
    ]);
    expect(await cartAvailability([])).toEqual([]);
  });

  it("répond 0 pour une ligne qui ne se résout plus", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 5 },
        { label: "Grand", priceCents: 5000, stockQty: 5 },
      ],
    });
    const db = await getDb();
    await db
      .update(productSizes)
      .set({ active: false })
      .where(eq(productSizes.id, sizes[0].id));

    expect(
      await cartAvailability([
        { slug, sizeId: sizes[0].id },
        { slug: "bouquet-jamais-vu", sizeId: null },
      ]),
    ).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 0 },
      { slug: "bouquet-jamais-vu", sizeId: null, maxQty: 0 },
    ]);
  });

  it("distingue « taille à choisir » d'une ligne épuisée", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [
        { label: "Petit", priceCents: 3000, stockQty: 5 },
        { label: "Grand", priceCents: 5000, stockQty: 0 },
      ],
    });

    expect(
      await cartAvailability([
        { slug, sizeId: null },
        { slug, sizeId: sizes[1].id },
      ]),
    ).toEqual([
      { slug, sizeId: null, maxQty: 0, reason: "size_required" },
      { slug, sizeId: sizes[1].id, maxQty: 0 },
    ]);
  });

  it("réintègre les unités retenues par la propre commande pending du visiteur", async () => {
    const { slug, sizes, colors } = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 1 }],
      colors: ["Naturel"],
    });
    const order = await pendingOrderFor([
      { slug, sizeId: sizes[0].id, colorId: colors[0].id, qty: 1 },
    ]);
    expect(await sizeStock(sizes[0].id)).toBe(0);

    expect(await cartAvailability([{ slug, sizeId: sizes[0].id }])).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 0 },
    ]);

    mocks.cookieStore.set(RESERVATION_COOKIE, order.id);
    expect(await cartAvailability([{ slug, sizeId: sizes[0].id }])).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 1 },
    ]);
  });

  it("ne réintègre ni la commande d'un autre visiteur ni une commande annulée", async () => {
    const { slug, sizes, colors } = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 1 }],
      colors: ["Naturel"],
    });
    const mienne = await pendingOrderFor([
      { slug, sizeId: sizes[0].id, colorId: colors[0].id, qty: 1 },
    ]);
    const autre = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 1 }],
    });
    const voisine = await pendingOrderFor([
      { slug: autre.slug, sizeId: autre.sizes[0].id, qty: 1 },
    ]);

    mocks.cookieStore.set(RESERVATION_COOKIE, voisine.id);
    expect(await cartAvailability([{ slug, sizeId: sizes[0].id }])).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 0 },
    ]);

    mocks.cookieStore.set(RESERVATION_COOKIE, mienne.id);
    await updateOrderStatus(await getDb(), mienne.id, "paid");
    expect(await cartAvailability([{ slug, sizeId: sizes[0].id }])).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 0 },
    ]);
  });

  it("ignore un cookie qui n'est pas un uuid, sans toucher à la base", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 2 }],
    });

    mocks.cookieStore.set(RESERVATION_COOKIE, "'; drop table orders; --");

    expect(await cartAvailability([{ slug, sizeId: sizes[0].id }])).toEqual([
      { slug, sizeId: sizes[0].id, maxQty: 2 },
    ]);
  });

  it("refuse une charge utile hors format plutôt que d'interroger la base", async () => {
    expect(await cartAvailability([{ slug: "", sizeId: null }])).toEqual([]);
    expect(
      await cartAvailability([{ slug: "rivage", sizeId: "pas-un-uuid" }]),
    ).toEqual([]);
  });

  it("ignore la ligne mal formée sans désarmer le plafond des autres", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 2 }],
    });

    expect(
      await cartAvailability([
        { slug: "rivage", sizeId: "hérité-du-localStorage" },
        { slug, sizeId: sizes[0].id },
      ]),
    ).toEqual([{ slug, sizeId: sizes[0].id, maxQty: 2 }]);
  });

  it("borne la charge utile à 50 lignes sans tout refuser", async () => {
    const { slug, sizes } = await addProduct({
      sizes: [{ label: "Petit", priceCents: 3000, stockQty: 4 }],
    });
    const answer = await cartAvailability([
      ...Array.from({ length: 50 }, () => ({ slug, sizeId: sizes[0].id })),
      { slug: "rivage", sizeId: null },
    ]);

    expect(answer).toHaveLength(50);
    expect(answer.every((row) => row.slug === slug)).toBe(true);
  });
});

const ROOT = process.cwd();
const RESERVATION = path.join("lib", "checkout", "reservation.ts");
const CHECKOUT_ACTIONS = path.join("app", "checkout", "actions.ts");
const AVAILABILITY_ACTION = path.join("app", "panier", "availability.ts");

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(relative, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(relative);
  }
  return found;
}

const FILES = ["app", "lib", "components"].flatMap((dir) => sourceFiles(dir));
const sourceOf = new Map(
  FILES.map((file) => [file, readFileSync(path.join(ROOT, file), "utf8")]),
);

const IMPORTS = /(?:from|import)\s+"([^"]+)"/g;

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? path.join(path.dirname(from), specifier)
      : null;
  if (base === null) return null;
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => sourceOf.has(candidate)) ?? null;
}

const isServerAction = (file: string) => /^"use server";/.test(sourceOf.get(file)!);

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (file !== entry && isServerAction(file)) continue;
    for (const [, specifier] of sourceOf.get(file)!.matchAll(IMPORTS)) {
      const target = resolveImport(file, specifier);
      if (target !== null && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

const FORCE_DYNAMIC = /export const dynamic = "force-dynamic";/;
const REVALIDATE = /export const revalidate = ([^;]+);/;

const cacheablePages = FILES.filter(
  (file) =>
    /^app\//.test(file) &&
    !file.includes("(admin)") &&
    path.basename(file) === "page.tsx" &&
    !FORCE_DYNAMIC.test(sourceOf.get(file)!),
);
const isrPages = cacheablePages;

describe("les pages ISR ne lisent jamais le cookie de réservation", () => {
  it("le module du cookie existe et n'est importé que par les Server Actions", () => {
    expect(sourceOf.has(RESERVATION)).toBe(true);
    expect(
      FILES.filter(
        (file) =>
          file !== RESERVATION && /@\/lib\/checkout\/reservation"/.test(sourceOf.get(file)!),
      ).sort(),
    ).toEqual([AVAILABILITY_ACTION, CHECKOUT_ACTIONS].sort());
  });

  it("les deux Server Actions ne sont importées que par des modules client", () => {
    const actions = [AVAILABILITY_ACTION, CHECKOUT_ACTIONS];
    const importers = FILES.filter(
      (file) =>
        !actions.includes(file) &&
        /@\/app\/(?:panier\/availability|checkout\/actions)"/.test(sourceOf.get(file)!),
    );
    expect(importers.sort()).toEqual(
      [
        path.join("components", "checkout-form.tsx"),
        path.join("lib", "cart", "stock-caps.ts"),
      ].sort(),
    );
    expect(
      importers.filter((file) => !/^"use client";/.test(sourceOf.get(file)!)),
    ).toEqual([]);
  });

  it("recense toute page vitrine cacheable, et seulement les trois connues", () => {
    expect(cacheablePages.sort()).toEqual(
      [
        path.join("app", "page.tsx"),
        path.join("app", "boutique", "page.tsx"),
        path.join("app", "boutique", "[slug]", "page.tsx"),
      ].sort(),
    );
  });

  it("chaque page cacheable déclare un revalidate littéral", () => {
    expect(
      cacheablePages.filter(
        (file) => !/^\d+$/.test(REVALIDATE.exec(sourceOf.get(file)!)?.[1]?.trim() ?? ""),
      ),
    ).toEqual([]);
  });

  it("le graphe d'imports relie bien les Server Actions au module du cookie", () => {
    expect(isServerAction(CHECKOUT_ACTIONS)).toBe(true);
    expect(isServerAction(AVAILABILITY_ACTION)).toBe(true);
    expect(reachableFrom(CHECKOUT_ACTIONS)).toContain(RESERVATION);
    expect(reachableFrom(AVAILABILITY_ACTION)).toContain(RESERVATION);
    expect(reachableFrom(path.join("app", "boutique", "page.tsx"))).toContain(
      path.join("lib", "products.ts"),
    );
    expect(reachableFrom(path.join("app", "panier", "page.tsx"))).not.toContain(
      RESERVATION,
    );
  });

  it.each(isrPages)("%s n'appelle jamais cookies() au rendu", (page) => {
    const reached = [...reachableFrom(page)];
    expect(reached.filter((file) => file === RESERVATION)).toEqual([]);
    expect(reached.filter((file) => /cookies\(\)/.test(sourceOf.get(file)!))).toEqual(
      [],
    );
    expect(sourceOf.get(page)!).not.toMatch(/next\/headers|cartAvailability/);
  });
});
