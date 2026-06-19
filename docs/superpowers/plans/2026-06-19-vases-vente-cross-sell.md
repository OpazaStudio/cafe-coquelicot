# Vases à la vente + suggestion au panier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendre des vases comme produits normaux (achetables seuls) et proposer des vases sur la page `/panier` quand le panier contient des fleurs mais aucun vase.

**Architecture:** Nouvelle valeur d'enum `product_category = 'vase'` (le seul vecteur de typage produit). La page `/panier` charge les vases actifs et un composant client `VaseSuggestions` les propose si une fonction pure `shouldSuggestVases(items, vaseSlugs)` est vraie (panier = fleurs sans vase). Cross-sell simple, prix plein, aucun impact Stripe (les line items sont revalidés côté serveur au checkout).

**Tech Stack:** Next 16 (App Router), Drizzle ORM + Postgres (Supabase) / PGlite (tests), React 19, vitest (unit/jsdom), Playwright (e2e).

## Global Constraints

- **Catégorie ajoutée** : `vase`, libellé exact `Vases`.
- **3 vases (seed)** : `galet` (Vase en grès, 2400), `carene` (Vase haut, 3800), `ecume` (Soliflore, 1900) — catégorie `vase`, sans taille/coloris, `badge: null`. **Non** ajoutés à `HOME_PICKS`.
- **Migration enum** : suivre le précédent `0005` → `ALTER TYPE "public"."product_category" ADD VALUE 'vase';`. Générée via `npm run db:generate` (jamais écrite à la main).
- **Déclencheur** : suggestion ssi `hasFlowers && !hasVase` (fleur = tout item dont le slug n'est pas un vase actif).
- **Tests** : vitest jsdom par défaut, `globals: true`, **pas** de `@testing-library/jest-dom` → assertions via `.textContent` et `queryBy*().toBeNull()` / `.not.toBeNull()`. Tests DB → `// @vitest-environment node` + `createTestDb()`.
- **Branche** : `feat/vases-cross-sell` (déjà créée). Ne jamais stager `app/boutique/page.tsx` ni `components/sections.tsx` (WIP utilisateur non lié). `app/globals.css` contient une ligne WIP utilisateur (grille prestations) qui restera dans le working tree.

---

### Task 1 : Catégorie `vase` (enum + libellé + migration)

**Files:**
- Modify: `lib/db/schema.ts:12-18` (enum `productCategory`)
- Modify: `lib/categories.ts:3-9` (`CATEGORY_LABELS`)
- Create: `tests/unit/categories.test.ts`
- Generated: `lib/db/migrations/0006_*.sql` + `lib/db/migrations/meta/_journal.json` (par drizzle-kit)

**Interfaces:**
- Produces: la valeur d'enum `"vase"` (donc `ProductCategory` inclut `"vase"`) et `CATEGORY_LABELS.vase === "Vases"`. La migration `0006` est exécutée par `createTestDb` (PGlite) et `npm run db:migrate` (Supabase).

- [ ] **Step 1 : Écrire le test qui échoue**

Create `tests/unit/categories.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { productCategory } from "@/lib/db/schema";
import { CATEGORY_LABELS } from "@/lib/categories";

describe("catégorie vase", () => {
  it("la valeur d'enum 'vase' existe", () => {
    expect(productCategory.enumValues).toContain("vase");
  });
  it("le libellé de 'vase' est « Vases »", () => {
    expect(CATEGORY_LABELS.vase).toBe("Vases");
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npx vitest run tests/unit/categories.test.ts`
Expected: FAIL (`'vase'` absent de l'enum ; `CATEGORY_LABELS.vase` undefined / erreur de type).

- [ ] **Step 3 : Ajouter la valeur d'enum**

`lib/db/schema.ts`, modifier `productCategory` :
```ts
export const productCategory = pgEnum("product_category", [
  "frais",
  "seche",
  "compo",
  "branches",
  "mini",
  "vase",
]);
```

- [ ] **Step 4 : Ajouter le libellé**

`lib/categories.ts`, dans `CATEGORY_LABELS`, ajouter la dernière entrée :
```ts
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  frais: "Bouquets frais",
  seche: "Fleurs séchées",
  compo: "Compositions",
  branches: "Branches & feuillages",
  mini: "Petits formats",
  vase: "Vases",
};
```

- [ ] **Step 5 : Générer la migration**

Run: `npm run db:generate`
Expected: création de `lib/db/migrations/0006_*.sql` contenant `ALTER TYPE "public"."product_category" ADD VALUE 'vase';` et une nouvelle entrée `idx: 6` dans `meta/_journal.json`. Vérifier le contenu du `.sql` généré.

- [ ] **Step 6 : Lancer test + typecheck → succès**

Run: `npx vitest run tests/unit/categories.test.ts && npm run typecheck`
Expected: PASS (2 tests) ; typecheck OK (`ProductCategory` inclut `"vase"`, `Record<ProductCategory,string>` complet).

- [ ] **Step 7 : Commit**

```bash
git add lib/db/schema.ts lib/categories.ts tests/unit/categories.test.ts lib/db/migrations/
git commit -m "feat(vases): ajoute la catégorie produit 'vase' (enum + libellé + migration)"
```

---

### Task 2 : Seed des 3 vases + sélecteur `getActiveVases` + compteurs e2e

**Files:**
- Modify: `lib/db/seed-data.ts:6-21` (`SEED_PRODUCTS`)
- Modify: `lib/products.ts` (ajout `queryActiveVases` + `getActiveVases`)
- Modify: `tests/unit/products.test.ts` (nouveau describe)
- Modify: `tests/e2e/01-shop.spec.ts:13-35` (14 → 17)

**Interfaces:**
- Consumes: enum `"vase"` + migration `0006` (Task 1) — `createTestDb` migre puis insère `SEED_PRODUCTS`.
- Produces: `queryActiveVases(db: Db): Promise<ShopProduct[]>` et `getActiveVases(): Promise<ShopProduct[]>` (vases actifs uniquement). Slugs vases en seed : `galet`, `carene`, `ecume`.

- [ ] **Step 1 : Écrire le test qui échoue**

`tests/unit/products.test.ts`, ajouter l'import et un describe :
```ts
// dans l'import existant depuis "@/lib/products", ajouter queryActiveVases :
import {
  getProductWithVariants,
  listProductsForAdmin,
  queryActiveProducts,
  queryActiveVases,
  queryProductBySlug,
} from "@/lib/products";

describe("queryActiveVases", () => {
  it("ne renvoie que les produits de catégorie vase, actifs", async () => {
    const vases = await queryActiveVases(db);
    expect(vases.map((v) => v.slug).sort()).toEqual(["carene", "ecume", "galet"]);
    expect(vases.every((v) => v.category === "vase")).toBe(true);
    expect(vases.find((v) => v.slug === "galet")!.priceCents).toBe(2400);
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npx vitest run tests/unit/products.test.ts`
Expected: FAIL (`queryActiveVases` non exporté ; aucun produit vase seedé).

- [ ] **Step 3 : Ajouter les 3 vases au seed**

`lib/db/seed-data.ts`, à la fin du tableau `SEED_PRODUCTS` (après `carte-fleurie`, ligne 20), ajouter :
```ts
  { slug: "galet", name: "galet", tag: "Vase en grès", description: "Grès émaillé tourné, pour un bouquet rond.", priceCents: 2400, category: "vase", badge: null, illustrationVariant: 0 },
  { slug: "carene", name: "carène", tag: "Vase haut", description: "Lignes hautes et épurées, pour de longues tiges.", priceCents: 3800, category: "vase", badge: null, illustrationVariant: 1 },
  { slug: "ecume", name: "écume", tag: "Soliflore", description: "Le petit vase d'une fleur, sur un rebord de fenêtre.", priceCents: 1900, category: "vase", badge: null, illustrationVariant: 2 },
```

- [ ] **Step 4 : Ajouter le sélecteur `getActiveVases`**

`lib/products.ts`, après `getActiveProducts` (ligne 121), ajouter :
```ts
// Vases actifs (cross-sell panier). Filtre la requête déjà mise en cache.
export async function queryActiveVases(db: Db): Promise<ShopProduct[]> {
  return (await queryActiveProducts(db)).filter((p) => p.category === "vase");
}

export const getActiveVases = cache(
  async (): Promise<ShopProduct[]> =>
    (await getActiveProducts()).filter((p) => p.category === "vase"),
);
```

- [ ] **Step 5 : Lancer le test unit → succès**

Run: `npx vitest run tests/unit/products.test.ts`
Expected: PASS (le nouveau describe + les existants).

- [ ] **Step 6 : Corriger les compteurs de la vitrine e2e**

`tests/e2e/01-shop.spec.ts` — la boutique passe de 14 à 17 produits. Remplacer dans le test « la boutique affiche les 14 produits » :
```ts
  test("la boutique affiche les 17 produits avec leurs prix", async ({
    page,
  }) => {
    await page.goto("/boutique");
    await expect(page.locator(".boutique-grid .product-card")).toHaveCount(17);
    await expect(page.getByText("17 compositions")).toBeVisible();
    await expect(
      page.locator(".product-card", { hasText: "carte fleurie" }),
    ).toContainText("dès 25€");
  });
```
Et dans « le filtre par catégorie fonctionne », la dernière assertion `Tout` :
```ts
    await page.getByRole("button", { name: "Tout", exact: true }).click();
    await expect(cards).toHaveCount(17);
```
*(Le test « Fleurs séchées » → 3 et le test home → 8 restent inchangés : les vases n'affectent que « Tout » et « Vases ».)*

- [ ] **Step 7 : Lancer la spec e2e vitrine → succès**

Run: `npx playwright test tests/e2e/01-shop.spec.ts`
Expected: PASS (3 tests). *(Les vases s'affichent en fin de grille ; leur illustration sera corrigée en Task 6 — ici elles rendent encore un bouquet, sans incidence sur les compteurs.)*

- [ ] **Step 8 : Commit**

```bash
git add lib/db/seed-data.ts lib/products.ts tests/unit/products.test.ts tests/e2e/01-shop.spec.ts
git commit -m "feat(vases): seed des 3 vases + getActiveVases + maj compteurs vitrine"
```

---

### Task 3 : Fonction pure `shouldSuggestVases`

**Files:**
- Create: `lib/cart/vase-upsell.ts`
- Create: `tests/unit/vase-upsell.test.ts`

**Interfaces:**
- Consumes: type `Cart` depuis `@/lib/cart/cart`.
- Produces: `shouldSuggestVases(items: Cart, vaseSlugs: Set<string>): boolean`.

- [ ] **Step 1 : Écrire le test qui échoue**

Create `tests/unit/vase-upsell.test.ts` :
```ts
import { describe, expect, it } from "vitest";
import { addItem, type Cart } from "@/lib/cart/cart";
import { shouldSuggestVases } from "@/lib/cart/vase-upsell";

const vaseSlugs = new Set(["galet", "carene", "ecume"]);
const flower = { slug: "rivage", name: "rivage", priceCents: 4800 };
const vase = { slug: "galet", name: "galet", priceCents: 2400 };

describe("shouldSuggestVases", () => {
  it("propose quand il y a des fleurs sans vase", () => {
    const cart: Cart = addItem([], flower);
    expect(shouldSuggestVases(cart, vaseSlugs)).toBe(true);
  });
  it("ne propose pas quand un vase est déjà là", () => {
    const cart: Cart = addItem(addItem([], flower), vase);
    expect(shouldSuggestVases(cart, vaseSlugs)).toBe(false);
  });
  it("ne propose pas pour un vase seul", () => {
    const cart: Cart = addItem([], vase);
    expect(shouldSuggestVases(cart, vaseSlugs)).toBe(false);
  });
  it("ne propose pas pour un panier vide", () => {
    expect(shouldSuggestVases([], vaseSlugs)).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npx vitest run tests/unit/vase-upsell.test.ts`
Expected: FAIL (`shouldSuggestVases` introuvable).

- [ ] **Step 3 : Implémenter la fonction**

Create `lib/cart/vase-upsell.ts` :
```ts
// Déclencheur du cross-sell vase (page /panier) — logique pure, testée.
// "fleur" = tout item dont le slug n'est pas un vase actif. On propose un
// vase dès qu'il y a des fleurs et aucun vase dans le panier.
import type { Cart } from "./cart";

export function shouldSuggestVases(items: Cart, vaseSlugs: Set<string>): boolean {
  const hasVase = items.some((i) => vaseSlugs.has(i.slug));
  const hasFlowers = items.some((i) => !vaseSlugs.has(i.slug));
  return hasFlowers && !hasVase;
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npx vitest run tests/unit/vase-upsell.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add lib/cart/vase-upsell.ts tests/unit/vase-upsell.test.ts
git commit -m "feat(vases): fonction pure shouldSuggestVases (déclencheur cross-sell)"
```

---

### Task 4 : Illustration `Vase` + helper `ProductFigure`

**Files:**
- Modify: `components/illustrations.tsx` (ajout `Vase` + `ProductFigure`, après `Bouquet` ligne 236)
- Create: `tests/unit/product-figure.test.tsx`

**Interfaces:**
- Produces: `Vase({ variant?: number, className?: string })` (3 silhouettes) et `ProductFigure({ category: string, variant?: number, className?: string })` qui rend `<Vase>` si `category === "vase"`, sinon `<Bouquet>`.

- [ ] **Step 1 : Écrire le test qui échoue**

Create `tests/unit/product-figure.test.tsx` :
```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ProductFigure } from "@/components/illustrations";

describe("ProductFigure", () => {
  it("rend un <svg> pour un vase et pour un bouquet", () => {
    const vase = render(<ProductFigure category="vase" variant={0} />);
    const bouquet = render(<ProductFigure category="frais" variant={0} />);
    expect(vase.container.querySelector("svg")).not.toBeNull();
    expect(bouquet.container.querySelector("svg")).not.toBeNull();
  });
  it("le visuel d'un vase diffère de celui d'un bouquet", () => {
    const vase = render(<ProductFigure category="vase" variant={0} />).container.innerHTML;
    const bouquet = render(<ProductFigure category="frais" variant={0} />).container.innerHTML;
    expect(vase).not.toBe(bouquet);
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npx vitest run tests/unit/product-figure.test.tsx`
Expected: FAIL (`ProductFigure` non exporté).

- [ ] **Step 3 : Ajouter `Vase` et `ProductFigure`**

`components/illustrations.tsx`, juste après la fonction `Bouquet` (après la ligne 236), ajouter :
```tsx
// ─── Vase (produits "vase" : cartes, fiche, suggestion panier) ───
export function Vase({ variant = 0, className }: IllustrationProps & { variant?: number }) {
  const variants = [
    // Variant 0 — vase rond / galet
    <g key="0" {...stroke}>
      <path d="M 80 120 Q 64 132 64 162 Q 64 200 100 210 Q 136 200 136 162 Q 136 132 120 120 Z" />
      <path d="M 80 120 L 78 110 L 122 110 L 120 120" />
      <ellipse cx="100" cy="110" rx="22" ry="5" />
    </g>,
    // Variant 1 — vase haut élancé
    <g key="1" {...stroke}>
      <path d="M 86 96 L 82 200 Q 100 210 118 200 L 114 96" />
      <path d="M 86 96 Q 100 88 114 96" />
      <ellipse cx="100" cy="96" rx="14" ry="4" />
      <path d="M 90 150 Q 100 154 110 150" opacity="0.5" />
    </g>,
    // Variant 2 — soliflore (col étroit)
    <g key="2" {...stroke}>
      <path d="M 94 96 L 92 132 Q 78 150 80 184 Q 86 206 100 206 Q 114 206 120 184 Q 122 150 108 132 L 106 96" />
      <path d="M 94 96 Q 100 92 106 96" />
      <ellipse cx="100" cy="96" rx="7" ry="3" />
    </g>,
  ];
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      {variants[variant % variants.length]}
    </svg>
  );
}

// Choisit l'illustration selon la catégorie produit (vase vs bouquet/fleur).
export function ProductFigure({
  category,
  variant,
  className,
}: {
  category: string;
  variant?: number;
  className?: string;
}) {
  return category === "vase" ? (
    <Vase variant={variant} className={className} />
  ) : (
    <Bouquet variant={variant} className={className} />
  );
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npx vitest run tests/unit/product-figure.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add components/illustrations.tsx tests/unit/product-figure.test.tsx
git commit -m "feat(vases): illustration Vase + helper ProductFigure"
```

---

### Task 5 : Composant `VaseSuggestions`

**Files:**
- Create: `components/vase-suggestions.tsx`
- Create: `tests/unit/vase-suggestions.test.tsx`

**Interfaces:**
- Consumes: `shouldSuggestVases` (Task 3), `ProductFigure` (Task 4), `useCart` (`@/lib/cart/cart-context`), `ShopProduct` (`@/lib/products`), `formatEuros` (`@/lib/money`), `ArrowRight` (`./illustrations`).
- Produces: `VaseSuggestions({ vases: ShopProduct[] })`. Conteneur `data-testid="vase-suggestions"`. Boutons `aria-label="Ajouter <nom> au panier"` (quick-add `{slug,name,priceCents}`).

- [ ] **Step 1 : Écrire le test qui échoue**

Create `tests/unit/vase-suggestions.test.tsx` :
```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "@/lib/cart/cart-context";
import { VaseSuggestions } from "@/components/vase-suggestions";
import type { ShopProduct } from "@/lib/products";

const vases: ShopProduct[] = [
  { id: "v1", slug: "galet", name: "galet", tag: "Vase en grès", desc: "x", price: "24€", priceCents: 2400, variant: 0, badge: null, category: "vase", sizes: [], colors: [] },
];

// Sonde déterministe : expose l'état d'hydratation du panier (ready) pour
// attendre la relecture du localStorage avant d'asserter l'absence de section.
function ReadyProbe() {
  const { ready, count } = useCart();
  return <span data-testid="probe">{ready ? `ready:${count}` : "loading"}</span>;
}

function seedCart(items: unknown[]) {
  window.localStorage.setItem("coquelicot.cart.v1", JSON.stringify(items));
}
function renderWith() {
  return render(
    <CartProvider>
      <ReadyProbe />
      <VaseSuggestions vases={vases} />
    </CartProvider>,
  );
}
async function waitReady() {
  await waitFor(() =>
    expect(screen.getByTestId("probe").textContent).toMatch(/^ready:/),
  );
}

beforeEach(() => window.localStorage.clear());

describe("VaseSuggestions", () => {
  it("propose un vase quand le panier a des fleurs sans vase", async () => {
    seedCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
    expect(screen.getByText("galet")).toBeTruthy();
  });

  it("ne propose rien si un vase est déjà au panier", async () => {
    seedCart([{ slug: "galet", name: "galet", priceCents: 2400, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).toBeNull();
  });

  it("ne propose rien pour un panier vide", async () => {
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).toBeNull();
  });

  it("quick-add : ajoute le vase puis masque la suggestion", async () => {
    seedCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter galet au panier" }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("vase-suggestions")).toBeNull(),
    );
    const stored = JSON.parse(
      window.localStorage.getItem("coquelicot.cart.v1") ?? "[]",
    );
    expect(stored.some((i: { slug: string }) => i.slug === "galet")).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npx vitest run tests/unit/vase-suggestions.test.tsx`
Expected: FAIL (`VaseSuggestions` introuvable).

- [ ] **Step 3 : Implémenter le composant**

Create `components/vase-suggestions.tsx` :
```tsx
"use client";

// Cross-sell vase sur /panier : proposé uniquement quand le panier contient
// des fleurs et aucun vase. Quick-add du vase "nu" (le prix est revalidé en
// base au checkout, comme tout produit).
import type { ShopProduct } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { shouldSuggestVases } from "@/lib/cart/vase-upsell";
import { formatEuros } from "@/lib/money";
import { ProductFigure, ArrowRight } from "./illustrations";

export function VaseSuggestions({ vases }: { vases: ShopProduct[] }) {
  const { items, ready, add } = useCart();
  if (!ready || vases.length === 0) return null;
  const vaseSlugs = new Set(vases.map((v) => v.slug));
  if (!shouldSuggestVases(items, vaseSlugs)) return null;

  return (
    <section
      className="vase-suggest reveal is-visible"
      data-testid="vase-suggestions"
      aria-label="Suggestion de vases"
    >
      <h2 className="vase-suggest__title">Et pourquoi pas un vase&nbsp;?</h2>
      <p className="vase-suggest__lead">Vos fleurs méritent un bel écrin.</p>
      <ul className="vase-suggest__grid">
        {vases.map((v) => (
          <li key={v.slug} className="vase-suggest__card">
            <div className="vase-suggest__media">
              <ProductFigure category={v.category} variant={v.variant} />
            </div>
            <div className="vase-suggest__info">
              <h3 className="vase-suggest__name">{v.name}</h3>
              <span className="vase-suggest__price">{formatEuros(v.priceCents)}</span>
            </div>
            <button
              type="button"
              className="btn btn--filled vase-suggest__add"
              onClick={() =>
                add({ slug: v.slug, name: v.name, priceCents: v.priceCents })
              }
              aria-label={`Ajouter ${v.name} au panier`}
            >
              Ajouter <ArrowRight />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4 : Lancer le test → succès**

Run: `npx vitest run tests/unit/vase-suggestions.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add components/vase-suggestions.tsx tests/unit/vase-suggestions.test.tsx
git commit -m "feat(vases): composant VaseSuggestions (section cross-sell panier)"
```

---

### Task 6 : Boutique — filtre « Vases » + illustration vase (carte & fiche)

**Files:**
- Modify: `components/boutique.tsx:15-22` (FILTERS) + `:64-81` (ProductCard → ProductFigure)
- Modify: `components/product-detail.tsx:12` (import) + `:50` (rendu illustration)
- Modify: `tests/e2e/01-shop.spec.ts` (assertion filtre « Vases »)

**Interfaces:**
- Consumes: `ProductFigure` (Task 4), vases seedés (Task 2).

- [ ] **Step 1 : Étendre la spec e2e du filtre**

`tests/e2e/01-shop.spec.ts`, dans `test("le filtre par catégorie fonctionne", …)`, après la vérification « Fleurs séchées » et avant le retour à « Tout », ajouter :
```ts
    await page.getByRole("button", { name: "Vases" }).click();
    await expect(cards).toHaveCount(3);
    for (const name of ["galet", "carène", "écume"]) {
      await expect(cards.filter({ hasText: name })).toHaveCount(1);
    }
```

- [ ] **Step 2 : Lancer la spec → échec**

Run: `npx playwright test tests/e2e/01-shop.spec.ts -g "filtre par catégorie"`
Expected: FAIL (bouton « Vases » absent).

- [ ] **Step 3 : Ajouter le filtre « Vases »**

`components/boutique.tsx`, dans `FILTERS`, ajouter la dernière entrée :
```ts
const FILTERS: { key: ProductCategory | "tout"; label: string }[] = [
  { key: "tout", label: "Tout" },
  { key: "frais", label: "Bouquets frais" },
  { key: "seche", label: "Fleurs séchées" },
  { key: "compo", label: "Compositions" },
  { key: "branches", label: "Branches & feuillages" },
  { key: "mini", label: "Petits formats" },
  { key: "vase", label: "Vases" },
];
```

- [ ] **Step 4 : Utiliser `ProductFigure` dans la carte**

`components/boutique.tsx` :
- Remplacer l'import `import { Bouquet } from "./illustrations";` par `import { ProductFigure } from "./illustrations";`
- Dans `ProductCard`, étendre la déstructuration et le rendu :
```tsx
function ProductCard(product: ShopProduct) {
  const { slug, name, tag, desc, badge, price, variant, category } = product;
  return (
    <Link href={`/boutique/${slug}`} className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <ProductFigure category={category} variant={variant} />
      </div>
```
*(le reste de `ProductCard` inchangé.)*

- [ ] **Step 5 : Utiliser `ProductFigure` dans la fiche produit**

`components/product-detail.tsx` :
- Remplacer l'import ligne 12 `import { Bouquet, ArrowRight } from "./illustrations";` par `import { ProductFigure, ArrowRight } from "./illustrations";`
- Remplacer le rendu de l'illustration (ligne ~50) `<Bouquet variant={illustration} />` par :
```tsx
        <ProductFigure category={product.category} variant={illustration} />
```

- [ ] **Step 6 : Lancer typecheck + spec e2e → succès**

Run: `npm run typecheck && npx playwright test tests/e2e/01-shop.spec.ts`
Expected: PASS (typecheck OK ; 3 tests vitrine, dont le filtre « Vases » → 3 vases avec illustration de vase).

- [ ] **Step 7 : Commit**

```bash
git add components/boutique.tsx components/product-detail.tsx tests/e2e/01-shop.spec.ts
git commit -m "feat(vases): filtre boutique « Vases » + illustration vase (carte & fiche)"
```

---

### Task 7 : Branchement panier + styles + e2e bout-en-bout

**Files:**
- Modify: `app/panier/page.tsx` (chargement vases + `<VaseSuggestions>`)
- Modify: `app/globals.css` (styles `.vase-suggest*`, ajout en fin de fichier)
- Create: `tests/e2e/09-vase-upsell.spec.ts`

**Interfaces:**
- Consumes: `getActiveVases` (Task 2), `VaseSuggestions` (Task 5), helper e2e `addToCart` (`./helpers`).

- [ ] **Step 1 : Écrire la spec e2e qui échoue**

Create `tests/e2e/09-vase-upsell.spec.ts` :
```ts
import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test.describe("vases — vente solo + suggestion panier", () => {
  test("un vase se vend seul (boutique → fiche → panier)", async ({ page }) => {
    await addToCart(page, "galet");
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
    await page.goto("/panier");
    await expect(page.getByTestId("cart-line-galet")).toBeVisible();
    // un vase seul ne déclenche pas la suggestion
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });

  test("la suggestion apparaît avec un bouquet sans vase", async ({ page }) => {
    await addToCart(page, "rivage");
    await page.goto("/panier");
    await expect(page.getByTestId("vase-suggestions")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ajouter galet au panier" }),
    ).toBeVisible();
  });

  test("quick-add depuis la suggestion ajoute le vase et masque la section", async ({
    page,
  }) => {
    await addToCart(page, "rivage");
    await page.goto("/panier");
    await page
      .getByRole("button", { name: "Ajouter galet au panier" })
      .click();
    await expect(page.getByTestId("cart-line-galet")).toBeVisible();
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });

  test("pas de suggestion sur un panier vide", async ({ page }) => {
    await page.goto("/panier");
    await expect(page.getByText("Votre panier est vide")).toBeVisible();
    await expect(page.getByTestId("vase-suggestions")).toHaveCount(0);
  });
});
```

- [ ] **Step 2 : Lancer la spec → échec**

Run: `npx playwright test tests/e2e/09-vase-upsell.spec.ts`
Expected: FAIL (la suggestion n'est pas rendue sur `/panier`).

- [ ] **Step 3 : Brancher la suggestion dans la page panier**

`app/panier/page.tsx` :
- Ajouter les imports :
```tsx
import { getActiveVases } from "@/lib/products";
import { VaseSuggestions } from "@/components/vase-suggestions";
```
- Rendre la page asynchrone et charger les vases, puis insérer le composant sous `<CartView />` :
```tsx
export default async function PanierPage() {
  const vases = await getActiveVases();
  return (
    <>
      <SiteHeader />
      <main>
        <section data-section data-bg="linen" className="cart-page">
          <div className="container">
            <nav className="boutique-crumb reveal is-visible" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <Link href="/boutique">boutique</Link>
              <span aria-hidden>/</span>
              <span>panier</span>
            </nav>
            <h1 className="display cart-page__title">
              votre panier
              <span className="script">prêt à fleurir ?</span>
            </h1>
            <CartView />
            <VaseSuggestions vases={vases} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 4 : Ajouter les styles**

`app/globals.css`, à la fin du fichier, ajouter :
```css
/* ── Suggestion de vases (cross-sell panier) ─────────────────── */
.vase-suggest {
  margin-top: 56px;
  padding-top: 40px;
  border-top: 1px solid color-mix(in srgb, var(--fg) 15%, transparent);
}
.vase-suggest__title {
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 3vw, 2rem);
  margin: 0 0 6px;
}
.vase-suggest__lead {
  opacity: 0.7;
  margin: 0 0 24px;
}
.vase-suggest__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}
.vase-suggest__card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--fg) 14%, transparent);
  border-radius: 14px;
}
.vase-suggest__media {
  aspect-ratio: 5 / 6;
  display: grid;
  place-items: center;
}
.vase-suggest__media svg {
  width: 64%;
  height: 64%;
}
.vase-suggest__info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.vase-suggest__name {
  margin: 0;
  font-size: 1.05rem;
}
.vase-suggest__price {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.vase-suggest__add {
  align-self: start;
}
```

- [ ] **Step 5 : Lancer la spec e2e → succès**

Run: `npx playwright test tests/e2e/09-vase-upsell.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6 : Commit (ne stager que les fichiers de la feature)**

```bash
git add app/panier/page.tsx app/globals.css tests/e2e/09-vase-upsell.spec.ts
git commit -m "feat(vases): suggestion de vases au panier + styles + e2e bout-en-bout"
```
*(`git add` ciblé : ne PAS stager `app/boutique/page.tsx` ni `components/sections.tsx`. `app/globals.css` embarquera la ligne WIP « prestation grid » de l'utilisateur — visible en revue.)*

---

### Task 8 : Vérification globale

**Files:** aucun (gate de non-régression).

- [ ] **Step 1 : Suite unitaire complète**

Run: `npm test`
Expected: PASS (tous les tests vitest, dont les 5 nouveaux fichiers).

- [ ] **Step 2 : Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 3 : Suite e2e complète**

Run: `npm run test:e2e`
Expected: PASS (08 specs existantes + `09-vase-upsell`). Vérifier en particulier `04-admin-products` (l'option « Vases » du select ne casse pas le CRUD) et `05-checkout` (un vase au panier checkoute comme un produit normal).

- [ ] **Step 4 : Revue manuelle rapide (optionnel)**

Run: `npm run dev` → `/boutique` (filtre « Vases », 3 vases avec illustration vase) ; ajouter `rivage` → `/panier` (section « Et pourquoi pas un vase ? ») ; cliquer « Ajouter galet » → la section disparaît, `galet` est au panier.

---

## Notes opérationnelles (hors code)

- **Prod** : appliquer la migration `0006` (`npm run db:migrate`) **avant** de seeder/créer des vases — l'enum doit contenir `vase`. Rappel mémoire : migrations 0003/0004/0005 aussi en attente d'application sur Supabase.
- **Admin** : aucun code requis — l'option « Vases » apparaît automatiquement dans le `<select>` catégorie (`product-form.tsx`) et la validation (`produits/actions.ts`).
- **WIP utilisateur** : `app/boutique/page.tsx` et `components/sections.tsx` ne sont jamais stagés par cette feature.
