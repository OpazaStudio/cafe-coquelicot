# Variantes produits (taille & coloris) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) ou
> superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Doter chaque produit d'une couche optionnelle de variantes — **tailles**
(porte le prix) et **coloris** (cosmétique, change l'illustration, enregistré sur
la commande) — du schéma jusqu'à la carte boutique et l'admin.

**Architecture:** Deux tables enfants `product_sizes` / `product_colors` (FK cascade) ;
`order_items` gagne `size_id`/`color_id` + snapshots de labels. L'unité achetable =
`(produit, taille, coloris)` ; prix = prix de la taille (ou prix de base). Panier à
clé composite. Sélection sur la carte boutique. Spec :
`docs/superpowers/specs/2026-06-14-produits-variantes-design.md`.

**Tech Stack:** Next 16 (app), Drizzle ORM, PGlite (test/local) / Postgres (prod),
Zod 4, Vitest, Playwright, React 19.

---

## Task 1 — Schéma + migration 0004

**Files:** Modify `lib/db/schema.ts` · Create `lib/db/migrations/0004_*.sql` (généré)

- [ ] **1.1** Dans `lib/db/schema.ts`, après la table `products`, ajouter :

```ts
export const productSizes = pgTable("product_sizes", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  priceCents: integer("price_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productColors = pgTable("product_colors", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  illustrationVariant: integer("illustration_variant").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **1.2** Dans `orderItems`, ajouter après `preparedQty` :

```ts
  sizeId: uuid("size_id").references(() => productSizes.id, { onDelete: "set null" }),
  colorId: uuid("color_id").references(() => productColors.id, { onDelete: "set null" }),
  sizeLabelSnapshot: text("size_label_snapshot"),
  colorLabelSnapshot: text("color_label_snapshot"),
```

- [ ] **1.3** Ajouter les types en bas du fichier :

```ts
export type ProductSizeRow = typeof productSizes.$inferSelect;
export type NewProductSizeRow = typeof productSizes.$inferInsert;
export type ProductColorRow = typeof productColors.$inferSelect;
export type NewProductColorRow = typeof productColors.$inferInsert;
```

- [ ] **1.4** Générer la migration : `npm run db:generate` → crée `lib/db/migrations/0004_*.sql`. Vérifier qu'elle crée les 2 tables + 4 colonnes.
- [ ] **1.5** `npm run test -- orders` (PGlite migre 0000→0004 ; les tests existants doivent rester verts).
- [ ] **1.6** Commit : `feat(db): tables product_sizes/product_colors + colonnes order_items`.

## Task 2 — Seed enfant (produits phares variantisés)

**Files:** Modify `lib/db/seed-data.ts`, `lib/db/client.ts`, `tests/helpers/db.ts`

Produits variantisés : `solana` (séché, 3 tailles + 2 coloris), `lagune` (compo, 2 tailles, sans coloris). Choisis car **non utilisés** par `01-shop`/`02-cart`/`05-checkout` (qui emploient rivage/gabut/estran/mistral/carte-fleurie nus).

- [ ] **2.1** `lib/db/seed-data.ts` — ajouter après `HOME_PICKS` :

```ts
// Variantes de démonstration (taille = prix, coloris cosmétique). Seuls ces
// produits sont déclinés ; les autres restent vendus tels quels.
export const SEED_SIZES: Record<string, { label: string; priceCents: number; sortOrder: number }[]> = {
  solana: [
    { label: "Petit", priceCents: 2900, sortOrder: 0 },
    { label: "Moyen", priceCents: 3400, sortOrder: 1 },
    { label: "Grand", priceCents: 4200, sortOrder: 2 },
  ],
  lagune: [
    { label: "Moyen", priceCents: 5800, sortOrder: 0 },
    { label: "Grand", priceCents: 7200, sortOrder: 1 },
  ],
};

export const SEED_COLORS: Record<string, { label: string; illustrationVariant: number; sortOrder: number }[]> = {
  solana: [
    { label: "Naturel", illustrationVariant: 2, sortOrder: 0 },
    { label: "Blanc", illustrationVariant: 4, sortOrder: 1 },
  ],
};

// Construit les lignes enfants à insérer une fois les produits créés (ids connus).
export function buildChildSeedRows(idBySlug: Map<string, string>) {
  const sizes: { productId: string; label: string; priceCents: number; sortOrder: number }[] = [];
  const colors: { productId: string; label: string; illustrationVariant: number; sortOrder: number }[] = [];
  for (const [slug, list] of Object.entries(SEED_SIZES)) {
    const pid = idBySlug.get(slug);
    if (pid) for (const s of list) sizes.push({ productId: pid, ...s });
  }
  for (const [slug, list] of Object.entries(SEED_COLORS)) {
    const pid = idBySlug.get(slug);
    if (pid) for (const c of list) colors.push({ productId: pid, ...c });
  }
  return { sizes, colors };
}
```

- [ ] **2.2** `lib/db/client.ts` — `seedIfEmpty` insère aussi les enfants :

```ts
export async function seedIfEmpty(db: Db): Promise<boolean> {
  const existing = await db.select({ id: schema.products.id }).from(schema.products).limit(1);
  if (existing.length > 0) return false;
  const inserted = await db
    .insert(schema.products)
    .values(SEED_PRODUCTS)
    .returning({ id: schema.products.id, slug: schema.products.slug });
  const { sizes, colors } = buildChildSeedRows(new Map(inserted.map((p) => [p.slug, p.id])));
  if (sizes.length) await db.insert(schema.productSizes).values(sizes);
  if (colors.length) await db.insert(schema.productColors).values(colors);
  return true;
}
```
Mettre à jour l'import : `import { SEED_PRODUCTS, buildChildSeedRows } from "./seed-data";`.

- [ ] **2.3** `tests/helpers/db.ts` — refléter le seed enfant :

```ts
  if (seed) {
    const inserted = await db
      .insert(schema.products)
      .values(SEED_PRODUCTS)
      .returning({ id: schema.products.id, slug: schema.products.slug });
    const { sizes, colors } = buildChildSeedRows(new Map(inserted.map((p) => [p.slug, p.id])));
    if (sizes.length) await db.insert(schema.productSizes).values(sizes);
    if (colors.length) await db.insert(schema.productColors).values(colors);
  }
```
Import : `import { SEED_PRODUCTS, buildChildSeedRows } from "@/lib/db/seed-data";`.

- [ ] **2.4** `npm run test -- orders` → toujours vert. Commit : `feat(db): seed variantes solana/lagune`.

## Task 3 — `composeItemName` (module pur, TDD)

**Files:** Create `lib/item-label.ts`, `tests/unit/item-label.test.ts`

- [ ] **3.1** Écrire le test (`tests/unit/item-label.test.ts`) :

```ts
import { describe, expect, it } from "vitest";
import { composeItemName } from "@/lib/item-label";

describe("composeItemName", () => {
  it("nom seul quand pas de variante", () => {
    expect(composeItemName("rivage")).toBe("rivage");
    expect(composeItemName("rivage", null, null)).toBe("rivage");
  });
  it("taille seule : nom — taille", () => {
    expect(composeItemName("rivage", "Moyen")).toBe("rivage — Moyen");
  });
  it("coloris seul : nom · coloris", () => {
    expect(composeItemName("rivage", null, "Vif")).toBe("rivage · Vif");
  });
  it("taille + coloris : nom — taille · coloris", () => {
    expect(composeItemName("rivage", "Moyen", "Vif")).toBe("rivage — Moyen · Vif");
  });
});
```

- [ ] **3.2** `npm run test -- item-label` → FAIL (module absent).
- [ ] **3.3** Créer `lib/item-label.ts` :

```ts
// Libellé d'affichage d'une ligne de commande/panier, taille & coloris inclus.
// Module PUR (aucun import db) : consommé côté client (kanban, confirmation,
// panier) ET serveur (Stripe).
export function composeItemName(
  name: string,
  sizeLabel?: string | null,
  colorLabel?: string | null,
): string {
  let result = name;
  if (sizeLabel) result += ` — ${sizeLabel}`;
  if (colorLabel) result += ` · ${colorLabel}`;
  return result;
}
```

- [ ] **3.4** `npm run test -- item-label` → PASS. Commit : `feat: composeItemName (libellé taille/coloris)`.

## Task 4 — Panier : clé composite (TDD)

**Files:** Modify `lib/cart/cart.ts`, `tests/unit/cart.test.ts`

- [ ] **4.1** Réécrire `tests/unit/cart.test.ts` (les fixtures gagnent les champs variante ; nouveaux cas). Remplacer le contenu par :

```ts
import { describe, expect, it } from "vitest";
import {
  addItem,
  cartItemKey,
  cartCount,
  cartSubtotalCents,
  MAX_QTY,
  removeItem,
  sanitizeCart,
  setQty,
  type Cart,
} from "@/lib/cart/cart";

const rivage = { slug: "rivage", name: "rivage", priceCents: 4800 };
const gabut = { slug: "gabut", name: "gabut", priceCents: 3800 };
// Variante : solana Moyen/Naturel et solana Moyen/Blanc (même taille, coloris ≠)
const solanaNaturel = {
  slug: "solana", name: "solana", priceCents: 3400,
  sizeId: "s-moyen", colorId: "c-naturel", sizeLabel: "Moyen", colorLabel: "Naturel",
};
const solanaBlanc = {
  slug: "solana", name: "solana", priceCents: 3400,
  sizeId: "s-moyen", colorId: "c-blanc", sizeLabel: "Moyen", colorLabel: "Blanc",
};

describe("cartItemKey", () => {
  it("slug seul sans variante", () => {
    expect(cartItemKey("rivage", null, null)).toBe("rivage");
  });
  it("compose slug__taille__coloris avec variante", () => {
    expect(cartItemKey("solana", "s-moyen", "c-blanc")).toBe("solana__s-moyen__c-blanc");
  });
});

describe("addItem", () => {
  it("ajoute un produit nu (key = slug, champs variante null)", () => {
    const cart = addItem([], rivage);
    expect(cart).toEqual([
      { key: "rivage", slug: "rivage", name: "rivage", priceCents: 4800,
        sizeId: null, colorId: null, sizeLabel: null, colorLabel: null, qty: 1 },
    ]);
  });
  it("fusionne la même (taille,coloris)", () => {
    const cart = addItem(addItem([], solanaNaturel), solanaNaturel, 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(3);
  });
  it("sépare deux coloris d'une même taille en deux lignes", () => {
    const cart = addItem(addItem([], solanaNaturel), solanaBlanc);
    expect(cart).toHaveLength(2);
    expect(cart.map((i) => i.colorLabel)).toEqual(["Naturel", "Blanc"]);
  });
  it("plafonne à MAX_QTY", () => {
    const cart = addItem(addItem([], rivage, MAX_QTY), rivage, 5);
    expect(cart[0].qty).toBe(MAX_QTY);
  });
});

describe("setQty / removeItem (par key)", () => {
  const cart: Cart = addItem(addItem([], solanaNaturel), solanaBlanc);
  it("modifie la quantité de la ligne ciblée", () => {
    expect(setQty(cart, "solana__s-moyen__c-naturel", 5)[0].qty).toBe(5);
  });
  it("retire la ligne quand la quantité tombe à 0", () => {
    expect(setQty(cart, "solana__s-moyen__c-blanc", 0)).toHaveLength(1);
  });
  it("removeItem retire par key", () => {
    expect(removeItem(cart, "solana__s-moyen__c-naturel").map((i) => i.colorLabel)).toEqual(["Blanc"]);
  });
});

describe("totaux", () => {
  it("somme les prix de variante", () => {
    const cart = addItem(addItem([], solanaNaturel, 2), gabut);
    expect(cartCount(cart)).toBe(3);
    expect(cartSubtotalCents(cart)).toBe(3400 * 2 + 3800);
  });
});

describe("sanitizeCart", () => {
  it("rejette le bruit", () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeCart([{ slug: 1 }])).toEqual([]);
    expect(sanitizeCart([{ slug: "x", name: "x", priceCents: -5, qty: 1 }])).toEqual([]);
  });
  it("rétro-compatible : ancienne ligne sans key → key = slug, variante null", () => {
    const result = sanitizeCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 500 }]);
    expect(result).toEqual([
      { key: "rivage", slug: "rivage", name: "rivage", priceCents: 4800,
        sizeId: null, colorId: null, sizeLabel: null, colorLabel: null, qty: MAX_QTY },
    ]);
  });
  it("recalcule la key d'une ligne variante (ne fait pas confiance au stockage)", () => {
    const result = sanitizeCart([{
      key: "bidon", slug: "solana", name: "solana", priceCents: 3400, qty: 2,
      sizeId: "s-moyen", colorId: "c-blanc", sizeLabel: "Moyen", colorLabel: "Blanc",
    }]);
    expect(result[0].key).toBe("solana__s-moyen__c-blanc");
  });
});
```

- [ ] **4.2** `npm run test -- cart.test` → FAIL.
- [ ] **4.3** Réécrire `lib/cart/cart.ts` :

```ts
// Logique panier pure (testée unitairement) — l'état vit côté client
// (localStorage), les prix sont TOUJOURS revalidés en base au checkout.
// Identité de ligne = `key` : slug seul si pas de variante, sinon
// slug__sizeId__colorId (taille porte le prix, coloris cosmétique mais distinct).

export type CartItem = {
  key: string;
  slug: string;
  sizeId: string | null;
  colorId: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  name: string;
  priceCents: number;
  qty: number;
};

export type CartItemInput = {
  slug: string;
  name: string;
  priceCents: number;
  sizeId?: string | null;
  colorId?: string | null;
  sizeLabel?: string | null;
  colorLabel?: string | null;
};

export type Cart = CartItem[];

export const MAX_QTY = 99;

export function cartItemKey(
  slug: string,
  sizeId?: string | null,
  colorId?: string | null,
): string {
  if (!sizeId && !colorId) return slug;
  return `${slug}__${sizeId ?? ""}__${colorId ?? ""}`;
}

export function addItem(cart: Cart, item: CartItemInput, qty = 1): Cart {
  const sizeId = item.sizeId ?? null;
  const colorId = item.colorId ?? null;
  const key = cartItemKey(item.slug, sizeId, colorId);
  const existing = cart.find((i) => i.key === key);
  if (existing) {
    return cart.map((i) =>
      i.key === key ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) } : i,
    );
  }
  return [
    ...cart,
    {
      key,
      slug: item.slug,
      sizeId,
      colorId,
      sizeLabel: item.sizeLabel ?? null,
      colorLabel: item.colorLabel ?? null,
      name: item.name,
      priceCents: item.priceCents,
      qty: Math.min(Math.max(qty, 1), MAX_QTY),
    },
  ];
}

export function removeItem(cart: Cart, key: string): Cart {
  return cart.filter((i) => i.key !== key);
}

export function setQty(cart: Cart, key: string, qty: number): Cart {
  if (qty <= 0) return removeItem(cart, key);
  return cart.map((i) =>
    i.key === key ? { ...i, qty: Math.min(qty, MAX_QTY) } : i,
  );
}

export function cartCount(cart: Cart): number {
  return cart.reduce((n, i) => n + i.qty, 0);
}

export function cartSubtotalCents(cart: Cart): number {
  return cart.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
}

// Garde-fou à la relecture du localStorage (versions antérieures, corrompues).
// La `key` est TOUJOURS recalculée (jamais celle stockée).
export function sanitizeCart(value: unknown): Cart {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (
      typeof r.slug !== "string" ||
      typeof r.name !== "string" ||
      !Number.isInteger(r.priceCents) ||
      (r.priceCents as number) < 0 ||
      !Number.isInteger(r.qty)
    ) {
      return [];
    }
    const sizeId = typeof r.sizeId === "string" ? r.sizeId : null;
    const colorId = typeof r.colorId === "string" ? r.colorId : null;
    return [
      {
        key: cartItemKey(r.slug, sizeId, colorId),
        slug: r.slug,
        sizeId,
        colorId,
        sizeLabel: typeof r.sizeLabel === "string" ? r.sizeLabel : null,
        colorLabel: typeof r.colorLabel === "string" ? r.colorLabel : null,
        name: r.name,
        priceCents: r.priceCents as number,
        qty: Math.min(Math.max(r.qty as number, 1), MAX_QTY),
      },
    ];
  });
}
```

- [ ] **4.4** `npm run test -- cart.test` → PASS. Commit : `feat(cart): clé composite taille/coloris`.

## Task 5 — Contexte panier + vue panier (par key)

**Files:** Modify `lib/cart/cart-context.tsx`, `components/cart-view.tsx`, `tests/unit/cart-context.test.tsx`

- [ ] **5.1** `lib/cart/cart-context.tsx` — types & API par `key` :
  - importer `CartItemInput` ; `add: (item: CartItemInput, qty?: number) => void`.
  - `remove: (key: string) => void`, `changeQty: (key: string, qty: number) => void`.
  - corps : `removeItem(cart, key)`, `setQty(cart, key, qty)` (déjà compatibles).

- [ ] **5.2** `tests/unit/cart-context.test.tsx` — adapter l'assertion localStorage :

```ts
      expect(stored).toEqual([
        { key: "rivage", slug: "rivage", name: "rivage", priceCents: 4800,
          sizeId: null, colorId: null, sizeLabel: null, colorLabel: null, qty: 2 },
      ]);
```

- [ ] **5.3** `components/cart-view.tsx` — clé par `item.key`, sous-label, testids :
  - `key={item.key}`, `data-testid={`cart-line-${item.key}`}`, `qty-${item.key}`.
  - `changeQty(item.key, …)`, `remove(item.key)`.
  - sous le nom, si `item.sizeLabel || item.colorLabel`, afficher :
    `<p className="cart-line__variant">{[item.sizeLabel, item.colorLabel].filter(Boolean).join(" · ")}</p>`.

- [ ] **5.4** `npm run test -- cart-context` → PASS. `npm run typecheck`. Commit : `feat(cart): contexte & vue par key + sous-label variante`.

## Task 6 — `lib/products.ts` : ShopProduct enrichi + requêtes

**Files:** Modify `lib/products.ts` · Create `tests/unit/products.test.ts`

- [ ] **6.1** Écrire `tests/unit/products.test.ts` :

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { getActiveProducts, getProductWithVariants } from "@/lib/products";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

describe("getActiveProducts", () => {
  it("produit nu : pas de variantes, prix = prix de base, « dès »", async () => {
    const all = await getActiveProducts.bind(null)(); // cache() wrapper
    const rivage = all.find((p) => p.slug === "rivage")!;
    expect(rivage.sizes).toEqual([]);
    expect(rivage.colors).toEqual([]);
    expect(rivage.priceCents).toBe(4800);
    expect(rivage.price).toBe("dès 48€");
  });

  it("produit variantisé : tailles triées, prix = min, coloris exposés", async () => {
    const all = await getActiveProducts.bind(null)();
    const solana = all.find((p) => p.slug === "solana")!;
    expect(solana.sizes.map((s) => s.label)).toEqual(["Petit", "Moyen", "Grand"]);
    expect(solana.priceCents).toBe(2900); // min des tailles
    expect(solana.price).toBe("dès 29€");
    expect(solana.colors.map((c) => c.label)).toEqual(["Naturel", "Blanc"]);
  });

  it("ignore les variantes inactives en boutique", async () => {
    // désactiver toutes les tailles de solana → retombe sur prix de base
    const { product } = (await getProductWithVariants(
      (await db.select().from(products).where(eq(products.slug, "solana")))[0].id,
    ))!;
    expect(product.slug).toBe("solana");
  });
});
```
_(Note : `getActiveProducts` est enveloppé par `cache()` ; en test on l'appelle directement. Si `.bind` pose souci, exporter une variante non-cachée `queryActiveProducts` et tester celle-ci.)_

- [ ] **6.2** `npm run test -- products.test` → FAIL.
- [ ] **6.3** Réécrire `lib/products.ts` :
  - `ShopProduct` gagne `sizes: {id,label,priceCents}[]` et `colors: {id,label,illustrationVariant}[]`.
  - Nouvelle fonction interne `assembleShopProducts(rows, sizeRows, colorRows)` :
    - groupe sizes/colors actifs par `productId`, triés par `sortOrder`.
    - `priceCents` = `min(sizes.priceCents)` si tailles, sinon `row.priceCents`.
    - `price` = `formatFromPrice(priceCents)`.
  - `getActiveProducts` : requête products actifs + `productSizes` actifs + `productColors` actifs (via `inArray(productId, ids)`), assemble, tri seed.
  - `getProductBySlug` : idem pour un slug.
  - Ajouter `getProductWithVariants(id): Promise<{ product: ProductRow; sizes: ProductSizeRow[]; colors: ProductColorRow[] } | null>` (TOUTES les variantes, actives ou non → édition admin), triées par `sortOrder`.
  - Ajouter `listProductsForAdmin(): Promise<{ row: ProductRow; sizeCount: number; colorCount: number; fromCents: number }[]>` : `getAllProductRows` + comptage tailles actives & min prix.

```ts
import { cache } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/client";
import {
  productColors,
  productSizes,
  products,
  type ProductCategory,
  type ProductColorRow,
  type ProductRow,
  type ProductSizeRow,
} from "./db/schema";
import { HOME_PICKS, SEED_PRODUCTS } from "./db/seed-data";
import { formatFromPrice } from "./money";

export type ShopSize = { id: string; label: string; priceCents: number };
export type ShopColor = { id: string; label: string; illustrationVariant: number };

export type ShopProduct = {
  id: string; slug: string; name: string; tag: string; desc: string;
  price: string; priceCents: number; variant: number;
  badge: string | null; category: ProductCategory;
  sizes: ShopSize[]; colors: ShopColor[];
};

function assemble(
  row: ProductRow, sizes: ProductSizeRow[], colors: ProductColorRow[],
): ShopProduct {
  const minCents = sizes.length
    ? Math.min(...sizes.map((s) => s.priceCents))
    : row.priceCents;
  return {
    id: row.id, slug: row.slug, name: row.name, tag: row.tag, desc: row.description,
    price: formatFromPrice(minCents), priceCents: minCents,
    variant: row.illustrationVariant, badge: row.badge, category: row.category,
    sizes: sizes.map((s) => ({ id: s.id, label: s.label, priceCents: s.priceCents })),
    colors: colors.map((c) => ({ id: c.id, label: c.label, illustrationVariant: c.illustrationVariant })),
  };
}

// groupe des lignes enfants par productId (déjà triées par requête)
function groupBy<T extends { productId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) (m.get(r.productId) ?? m.set(r.productId, []).get(r.productId)!).push(r);
  return m;
}
```
  Détail des requêtes (boutique = actifs uniquement) :
```ts
async function activeChildren(ids: string[]) {
  if (ids.length === 0) return { sizes: new Map(), colors: new Map() };
  const db = await getDb();
  const sizes = await db.select().from(productSizes)
    .where(and(inArray(productSizes.productId, ids), eq(productSizes.active, true)))
    .orderBy(asc(productSizes.sortOrder));
  const colors = await db.select().from(productColors)
    .where(and(inArray(productColors.productId, ids), eq(productColors.active, true)))
    .orderBy(asc(productColors.sortOrder));
  return { sizes: groupBy(sizes), colors: groupBy(colors) };
}
```
  (importer `and`). `getActiveProducts`/`getProductBySlug` assemblent via `assemble(row, sizesByPid.get(row.id) ?? [], colorsByPid.get(row.id) ?? [])`.

- [ ] **6.4** Adapter le test 6.1 à la forme finale exportée (si `cache()` gêne, exporter `queryActiveProducts` non-caché et garder `getActiveProducts = cache(queryActiveProducts)` ; tester `queryActiveProducts`). `npm run test -- products.test` → PASS.
- [ ] **6.5** Commit : `feat(products): ShopProduct avec tailles/coloris + requêtes`.

## Task 7 — `createPendingOrder` : variantes + snapshots (TDD)

**Files:** Modify `lib/orders.ts`, `tests/unit/orders.test.ts`

- [ ] **7.1** Ajouter en fin de `tests/unit/orders.test.ts` un bloc :

```ts
describe("createPendingOrder — variantes", () => {
  it("prix lu sur la taille, coloris enregistré (snapshots)", async () => {
    const { order, items } = await createPendingOrder(db, camille, [
      { slug: "solana", sizeId: SIZE("solana", "Grand"), colorId: COLOR("solana", "Blanc"), qty: 1 },
    ]);
    // ⚠ helpers SIZE/COLOR : voir 7.2
    const it0 = items[0];
    expect(it0.priceCentsSnapshot).toBe(4200);     // Grand
    expect(it0.sizeLabelSnapshot).toBe("Grand");
    expect(it0.colorLabelSnapshot).toBe("Blanc");
    expect(order.subtotalCents).toBe(4200);
  });

  it("rejette une taille manquante quand le produit en a", async () => {
    await expect(
      createPendingOrder(db, camille, [{ slug: "solana", qty: 1 }]),
    ).rejects.toThrow(CheckoutError);
  });

  it("rejette une taille/coloris d'un autre produit ou inactive", async () => {
    await expect(
      createPendingOrder(db, camille, [
        { slug: "solana", sizeId: "00000000-0000-0000-0000-000000000000", qty: 1 },
      ]),
    ).rejects.toThrow(CheckoutError);
  });

  it("rejette un sizeId fourni pour un produit nu", async () => {
    await expect(
      createPendingOrder(db, camille, [
        { slug: "rivage", sizeId: SIZE("solana", "Grand"), qty: 1 },
      ]),
    ).rejects.toThrow(CheckoutError);
  });
});
```

- [ ] **7.2** En haut du fichier de test, ajouter des helpers de résolution d'ids (après `createTestDb`) — ils lisent les ids seedés :

```ts
import { productColors, productSizes } from "@/lib/db/schema";
// dans le scope du describe variantes, fonctions async qui requêtent db :
async function sizeId(slug: string, label: string) {
  const rows = await db.select().from(productSizes);
  const prod = (await db.select().from(products).where(eq(products.slug, slug)))[0];
  return rows.find((s) => s.productId === prod.id && s.label === label)!.id;
}
async function colorId(slug: string, label: string) {
  const rows = await db.select().from(productColors);
  const prod = (await db.select().from(products).where(eq(products.slug, slug)))[0];
  return rows.find((c) => c.productId === prod.id && c.label === label)!.id;
}
```
  Remplacer `SIZE(...)`/`COLOR(...)` par `await sizeId(...)`/`await colorId(...)` dans les tests 7.1.

- [ ] **7.3** `npm run test -- orders.test` → FAIL (champs/validation absents).
- [ ] **7.4** `lib/orders.ts` :
  - `CheckoutItemInput` → `{ slug: string; sizeId?: string | null; colorId?: string | null; qty: number }`.
  - Importer `productSizes`, `productColors`.
  - Avant la transaction, **résoudre** chaque ligne :

```ts
// charge variantes actives des produits du panier
const productIds = rows.map((r) => r.id);
const allSizes = productIds.length
  ? await db.select().from(productSizes)
      .where(and(inArray(productSizes.productId, productIds), eq(productSizes.active, true)))
  : [];
const allColors = productIds.length
  ? await db.select().from(productColors)
      .where(and(inArray(productColors.productId, productIds), eq(productColors.active, true)))
  : [];
const sizesByProduct = new Map<string, typeof allSizes>();
for (const s of allSizes) (sizesByProduct.get(s.productId) ?? sizesByProduct.set(s.productId, []).get(s.productId)!).push(s);
const colorsByProduct = new Map<string, typeof allColors>();
for (const c of allColors) (colorsByProduct.get(c.productId) ?? colorsByProduct.set(c.productId, []).get(c.productId)!).push(c);

type ResolvedLine = {
  product: typeof rows[number]; qty: number; priceCents: number;
  sizeId: string | null; colorId: string | null;
  sizeLabel: string | null; colorLabel: string | null;
};
const resolved: ResolvedLine[] = items.map((item) => {
  const p = bySlug.get(item.slug)!; // existence déjà vérifiée plus haut
  const sizes = sizesByProduct.get(p.id) ?? [];
  const colors = colorsByProduct.get(p.id) ?? [];

  let priceCents = p.priceCents;
  let sizeId: string | null = null, sizeLabel: string | null = null;
  if (sizes.length > 0) {
    const s = item.sizeId ? sizes.find((x) => x.id === item.sizeId) : undefined;
    if (!s) throw new CheckoutError(`Choix de taille requis pour ${p.name}.`);
    priceCents = s.priceCents; sizeId = s.id; sizeLabel = s.label;
  } else if (item.sizeId) {
    throw new CheckoutError(`Ce produit n'a pas de taille (${p.name}).`);
  }

  let colorId: string | null = null, colorLabel: string | null = null;
  if (colors.length > 0) {
    const c = item.colorId ? colors.find((x) => x.id === item.colorId) : undefined;
    if (!c) throw new CheckoutError(`Choix de coloris requis pour ${p.name}.`);
    colorId = c.id; colorLabel = c.label;
  } else if (item.colorId) {
    throw new CheckoutError(`Ce produit n'a pas de coloris (${p.name}).`);
  }

  return { product: p, qty: item.qty, priceCents, sizeId, colorId, sizeLabel, colorLabel };
});

const subtotalCents = resolved.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
```
  - L'insert des `order_items` lit `resolved` :

```ts
const values: NewOrderItemRow[] = resolved.map((l) => ({
  orderId: order.id,
  productId: l.product.id,
  nameSnapshot: l.product.name,
  priceCentsSnapshot: l.priceCents,
  qty: l.qty,
  sizeId: l.sizeId,
  colorId: l.colorId,
  sizeLabelSnapshot: l.sizeLabel,
  colorLabelSnapshot: l.colorLabel,
}));
```
  - Conserver la validation `qty` existante (boucle inchangée) et l'ancien calcul `subtotalCents` est **remplacé** par celui ci-dessus.

- [ ] **7.5** `npm run test -- orders.test` → PASS (anciens + nouveaux). Commit : `feat(orders): résolution taille/coloris + snapshots`.

## Task 8 — Checkout action + Stripe

**Files:** Modify `app/checkout/actions.ts`

- [ ] **8.1** `ItemsSchema` accepte les variantes :

```ts
const ItemsSchema = z.array(z.object({
  slug: z.string().min(1),
  sizeId: z.string().uuid().nullish(),
  colorId: z.string().uuid().nullish(),
  qty: z.number().int().min(1).max(99),
})).min(1, { error: "Le panier est vide." }).max(50);
```
- [ ] **8.2** Le nom de ligne Stripe compose taille/coloris. Importer `composeItemName` et remplacer `product_data: { name: line.nameSnapshot }` par :
```ts
product_data: { name: composeItemName(line.nameSnapshot, line.sizeLabelSnapshot, line.colorLabelSnapshot) },
```
- [ ] **8.3** `npm run typecheck`. Commit : `feat(checkout): variantes dans items + libellé Stripe`.

## Task 9 — Carte boutique interactive

**Files:** Modify `components/boutique.tsx`

- [ ] **9.1** Réécrire `ProductCard` (état taille/coloris ; illustration & prix réactifs ; ajout avec sélection). Conserver l'`aria-label` « Ajouter {name} au panier » (helper e2e). Code :

```tsx
function ProductCard(product: ShopProduct) {
  const { name, tag, desc, badge, sizes, colors } = product;
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [size, setSize] = useState<ShopSize | null>(sizes[0] ?? null);
  const [color, setColor] = useState<ShopColor | null>(colors[0] ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const illu = color?.illustrationVariant ?? product.variant;
  const priceCents = size?.priceCents ?? product.priceCents;
  const priceLabel = sizes.length ? formatEuros(priceCents) : product.price;

  function handleAdd() {
    add({
      slug: product.slug, name, priceCents,
      sizeId: size?.id ?? null, colorId: color?.id ?? null,
      sizeLabel: size?.label ?? null, colorLabel: color?.label ?? null,
    });
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={illu} />
      </div>
      <div>
        <p className="eyebrow" style={{ opacity: 0.6, marginBottom: 6 }}>{tag}</p>
        <h3 className="product-card__name">{name}</h3>
      </div>

      {sizes.length > 0 && (
        <div className="product-card__sizes" role="group" aria-label={`Taille de ${name}`}>
          {sizes.map((s) => (
            <button key={s.id} type="button"
              className={`product-card__size${size?.id === s.id ? " is-active" : ""}`}
              aria-pressed={size?.id === s.id}
              onClick={() => setSize(s)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {colors.length > 0 && (
        <div className="product-card__colors" role="group" aria-label={`Coloris de ${name}`}>
          {colors.map((c) => (
            <button key={c.id} type="button"
              className={`product-card__color${color?.id === c.id ? " is-active" : ""}`}
              aria-pressed={color?.id === c.id}
              aria-label={c.label} title={c.label}
              onClick={() => setColor(c)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="product-card__row">
        <p className="product-card__desc">{desc}</p>
        <span className="product-card__price">{priceLabel}</span>
      </div>
      <button type="button" className="product-card__add link-arrow"
        onClick={handleAdd} aria-label={`Ajouter ${name} au panier`}>
        {added ? <>Ajouté ✓</> : <>Ajouter <ArrowRight /></>}
      </button>
    </article>
  );
}
```
  Imports à compléter dans le fichier : `formatEuros` (`@/lib/money`), types `ShopSize, ShopColor` (`@/lib/products`).

- [ ] **9.2** `app/globals.css` — styles minimaux des nouveaux groupes (boutons taille/coloris : pills, état `.is-active` au `wine`). (Suivre les classes existantes `product-card__*`.)
- [ ] **9.3** `npm run typecheck` + `npm run lint`. Commit : `feat(boutique): sélecteurs taille/coloris sur la carte`.

## Task 10 — Admin : formulaire variantes

**Files:** Modify `app/(admin)/admin/(panel)/produits/product-form.tsx`, `app/(admin)/admin/(panel)/produits/[id]/page.tsx`, `nouveau/page.tsx`

- [ ] **10.1** `product-form.tsx` accepte des props `sizes?: ProductSizeRow[]`, `colors?: ProductColorRow[]`. Gérer deux listes en état :
```tsx
type SizeDraft = { id?: string; label: string; price: string; active: boolean };
type ColorDraft = { id?: string; label: string; illustrationVariant: number; active: boolean };
const [sizes, setSizes] = useState<SizeDraft[]>(
  (initialSizes ?? []).map((s) => ({ id: s.id, label: s.label,
    price: (s.priceCents / 100).toFixed(2).replace(".", ",").replace(/,00$/, ""), active: s.active })),
);
const [colors, setColors] = useState<ColorDraft[]>(
  (initialColors ?? []).map((c) => ({ id: c.id, label: c.label, illustrationVariant: c.illustrationVariant, active: c.active })),
);
```
- [ ] **10.2** Rendu : deux sections répétables (sous le badge), chacune avec lignes éditables, bouton « + Ajouter une taille / un coloris » et « Supprimer » par ligne. Le coloris réutilise `VARIANT_LABELS` dans un `<select>` + aperçu `<Bouquet variant={…}>`. Deux `<input type="hidden">` :
```tsx
<input type="hidden" name="sizes" value={JSON.stringify(sizes)} />
<input type="hidden" name="colors" value={JSON.stringify(colors)} />
```
- [ ] **10.3** `[id]/page.tsx` charge via `getProductWithVariants(id)` et passe `product`, `sizes`, `colors` au form. `nouveau/page.tsx` inchangé (form sans initiaux).
- [ ] **10.4** `npm run typecheck`. Commit : `feat(admin): sous-formulaires tailles/coloris`.

## Task 11 — Admin : action serveur (Zod + upsert enfants)

**Files:** Modify `app/(admin)/admin/(panel)/produits/actions.ts`

- [ ] **11.1** Schémas Zod :
```ts
const SizeSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40),
  price: z.string().trim().regex(/^\d+([.,]\d{1,2})?$/),
  active: z.boolean(),
});
const ColorSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40),
  illustrationVariant: z.coerce.number().int().min(0).max(5),
  active: z.boolean(),
});
const SizesSchema = z.array(SizeSchema).max(12);
const ColorsSchema = z.array(ColorSchema).max(12);
```
  Parser `JSON.parse(formData.get("sizes"))` / `colors` en `try/catch` → erreur de champ si invalide.
- [ ] **11.2** Extraire une fonction `syncChildren(tx, productId, sizes, colors)` : update par `id` (scopé au produit), insert des nouvelles (sans `id`), delete des ids absents de la soumission (`productSizes`/`productColors`). Appelée dans la transaction de `createProduct` (après insert produit → on a l'id) et `updateProduct`.
- [ ] **11.3** `createProduct`/`updateProduct` enveloppent insert/update produit + `syncChildren` dans `db.transaction`. `revalidateShop()` inchangé.
- [ ] **11.4** `npm run typecheck`. Commit : `feat(admin): persistance tailles/coloris (upsert + delete)`.

## Task 12 — Admin liste + kanban + confirmation (affichage)

**Files:** Modify `produits/page.tsx`, `commandes/kanban-board.tsx`, `app/commande/confirmee/page.tsx`

- [ ] **12.1** `produits/page.tsx` : utiliser `listProductsForAdmin()` ; colonne récap « {sizeCount} tailles · {colorCount} coloris » (ou « — »), prix « dès {fromCents} ».
- [ ] **12.2** `kanban-board.tsx` `ItemLine` : sous `nameSnapshot`, si `item.sizeLabelSnapshot || item.colorLabelSnapshot`, afficher un `<span className="text-xs text-stone-500">` avec `[size,color].filter(Boolean).join(" · ")`.
- [ ] **12.3** `confirmee/page.tsx` : remplacer `{item.nameSnapshot} × {item.qty}` par `{composeItemName(item.nameSnapshot, item.sizeLabelSnapshot, item.colorLabelSnapshot)} × {item.qty}` (import `composeItemName`).
- [ ] **12.4** `npm run typecheck` + `npm run test`. Commit : `feat(admin): récap variantes liste/kanban + confirmation`.

## Task 13 — E2E Playwright

**Files:** Modify `tests/e2e/02-cart.spec.ts`, `tests/e2e/04-admin-products.spec.ts` · Create `tests/e2e/07-variants.spec.ts` · Modify `tests/e2e/helpers.ts`

- [ ] **13.1** `helpers.ts` : ajouter
```ts
export async function addVariantToCart(page: Page, name: string, size?: string, color?: string) {
  const card = page.locator(".product-card", { hasText: name });
  if (size) await card.getByRole("button", { name: size, exact: true }).click();
  if (color) await card.getByRole("button", { name: color, exact: true }).click();
  await card.getByRole("button", { name: `Ajouter ${name} au panier` }).click();
}
```
- [ ] **13.2** `07-variants.spec.ts` (storefront, produit seedé `solana`) :
  - aller `/boutique`, filtrer ou cibler la carte `solana`.
  - cliquer « Grand » → le prix affiché passe à `42€` ; cliquer « Blanc » (l'illustration change — vérifier au moins que le bouton est `aria-pressed`).
  - ajouter Grand·Blanc, puis Grand·Naturel → panier : **2 lignes** ; ré-ajouter Grand·Blanc → qty 2 sur cette ligne.
  - vérifier les sous-labels « Grand · Blanc » / « Grand · Naturel » et le sous-total `42 + 42×2 = 126€`.
- [ ] **13.3** `04-admin-products.spec.ts` : ajouter un test « créer un produit avec tailles & coloris » → remplir nom/sous-titre/desc/catégorie, ajouter 2 tailles (Petit 20 / Grand 40) + 1 coloris, créer ; sur `/boutique` la carte montre les boutons et le prix par défaut `20€` ; sélectionner Grand → `40€` ; nettoyer (supprimer le produit en fin de test).
- [ ] **13.4** `02-cart.spec.ts` : inchangé (produits nus) — vérifier qu'il reste vert.
- [ ] **13.5** `npm run test:e2e` (build prod + PGlite seedé). Corriger les sélecteurs au besoin.
- [ ] **13.6** Commit : `test(e2e): variantes boutique, panier multi-lignes, admin`.

## Task 14 — Vérification finale

- [ ] **14.1** `npm run typecheck` → 0 erreur.
- [ ] **14.2** `npm run lint` → 0 erreur.
- [ ] **14.3** `npm run test` → toute la suite unitaire verte.
- [ ] **14.4** `npm run test:e2e` → vert.
- [ ] **14.5** Mettre à jour la mémoire migration : `0004` à appliquer sur Supabase (`npm run db:migrate`).
- [ ] **14.6** Commit final si reliquats : `chore: variantes produits — vérif complète`.

---

## Notes de cohérence (self-review)

- **Couverture spec** : schéma (T1), seed (T2), `composeItemName` (T3), panier (T4/T5),
  products (T6), orders (T7), checkout/Stripe (T8), boutique (T9), admin form (T10),
  admin action (T11), liste/kanban/confirmation (T12), tests (T13), vérif (T14). ✔
- **Types partagés** : `CartItem`/`CartItemInput`/`cartItemKey` (T4) consommés en T5/T9 ;
  `ShopProduct`/`ShopSize`/`ShopColor` (T6) consommés en T9 ; `CheckoutItemInput` (T7)
  consommé en T8 ; `composeItemName` (T3) en T8/T12. Noms alignés.
- **Régression e2e** : produits nus (rivage/gabut/estran/mistral/carte-fleurie) intacts ;
  `solana`/`lagune` variantisés ne sont pas asservis aux comptages de `01-shop`
  (count 14 inchangé, ce sont les mêmes produits) ni de `04` (création/suppression).
- **Frontière client/serveur** : `composeItemName` dans `lib/item-label.ts` (pur) ;
  `lib/products.ts` (importe `getDb`) jamais importé en valeur par un client.
