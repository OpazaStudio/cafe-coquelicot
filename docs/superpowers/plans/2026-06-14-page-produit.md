# Page produit & variantes front — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Déplacer la sélection des variantes de la carte vers une page produit
dédiée `/boutique/[slug]` (deux colonnes) ; la carte de la grille devient un lien.

**Architecture:** Route serveur `app/boutique/[slug]/page.tsx` (data + 404 + SEO)
déléguant l'interactif à `components/product-detail.tsx` (client). La carte
boutique/home redevient présentationnelle (lien). Panier inchangé. Spec :
`docs/superpowers/specs/2026-06-14-page-produit-design.md`.

**Tech Stack:** Next 16 (app, typed routes), React 19, Drizzle/PGlite, Vitest, Playwright.

---

## Task 1 — `getProductBySlug` actifs uniquement (TDD)

**Files:** Modify `lib/products.ts`, `tests/unit/products.test.ts`

- [ ] **1.1** Ajouter à `tests/unit/products.test.ts` :
```ts
import { queryProductBySlug } from "@/lib/products";
// ...
describe("queryProductBySlug", () => {
  it("renvoie le produit actif avec ses variantes", async () => {
    const p = await queryProductBySlug(db, "solana");
    expect(p?.sizes.map((s) => s.label)).toEqual(["Petit", "Moyen", "Grand"]);
    expect(p?.colors.map((c) => c.label)).toEqual(["Naturel", "Blanc"]);
  });
  it("renvoie null pour un produit masqué", async () => {
    await db.update(products).set({ active: false }).where(eq(products.slug, "solana"));
    expect(await queryProductBySlug(db, "solana")).toBeNull();
  });
  it("renvoie null pour un slug inconnu", async () => {
    expect(await queryProductBySlug(db, "inexistant")).toBeNull();
  });
});
```
- [ ] **1.2** `npm run test -- products.test` → FAIL (masqué renvoie un produit).
- [ ] **1.3** Dans `lib/products.ts`, `queryProductBySlug` ajoute le filtre actif :
```ts
const [row] = await db
  .select()
  .from(products)
  .where(and(eq(products.slug, slug), eq(products.active, true)))
  .limit(1);
```
- [ ] **1.4** `npm run test -- products.test` → PASS. Commit : `feat(products): page produit ne sert que les produits actifs`.

## Task 2 — `components/product-detail.tsx` (TDD)

**Files:** Create `components/product-detail.tsx`, `tests/unit/product-detail.test.tsx`

- [ ] **2.1** Écrire `tests/unit/product-detail.test.tsx` :
```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider } from "@/lib/cart/cart-context";
import { ProductDetail } from "@/components/product-detail";
import type { ShopProduct } from "@/lib/products";

const solana: ShopProduct = {
  id: "p1", slug: "solana", name: "solana", tag: "Bouquet séché",
  desc: "Immortelles, statice.", price: "dès 29€", priceCents: 2900,
  variant: 2, badge: null, category: "seche",
  sizes: [
    { id: "s-p", label: "Petit", priceCents: 2900 },
    { id: "s-g", label: "Grand", priceCents: 4200 },
  ],
  colors: [
    { id: "c-n", label: "Naturel", illustrationVariant: 2 },
    { id: "c-b", label: "Blanc", illustrationVariant: 4 },
  ],
};

function renderDetail(p: ShopProduct) {
  return render(
    <CartProvider>
      <ProductDetail product={p} />
    </CartProvider>,
  );
}

beforeEach(() => window.localStorage.clear());

describe("ProductDetail", () => {
  it("prix par défaut = 1ʳᵉ taille, réactif au changement de taille", () => {
    renderDetail(solana);
    expect(screen.getByTestId("product-price").textContent).toBe("29€");
    fireEvent.click(screen.getByRole("button", { name: "Grand" }));
    expect(screen.getByTestId("product-price").textContent).toBe("42€");
  });

  it("le stepper borne la quantité à 1 minimum", () => {
    renderDetail(solana);
    fireEvent.click(screen.getByRole("button", { name: "Réduire la quantité" }));
    expect(screen.getByTestId("product-qty").textContent).toBe("1");
  });

  it("ajoute la variante sélectionnée avec la quantité au panier", async () => {
    renderDetail(solana);
    fireEvent.click(screen.getByRole("button", { name: "Grand" }));
    fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter solana au panier" }));
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("coquelicot.cart.v1") ?? "[]");
      expect(stored).toEqual([
        {
          key: "solana__s-g__c-b", slug: "solana", name: "solana",
          priceCents: 4200, sizeId: "s-g", colorId: "c-b",
          sizeLabel: "Grand", colorLabel: "Blanc", qty: 2,
        },
      ]);
    });
  });
});
```
- [ ] **2.2** `npm run test -- product-detail` → FAIL (composant absent).
- [ ] **2.3** Créer `components/product-detail.tsx` :
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ShopColor, ShopProduct, ShopSize } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { MAX_QTY } from "@/lib/cart/cart";
import { formatEuros } from "@/lib/money";
import { Bouquet, ArrowRight } from "./illustrations";

export function ProductDetail({ product }: { product: ShopProduct }) {
  const { name, tag, desc, badge, sizes, colors } = product;
  const { add } = useCart();
  const [size, setSize] = useState<ShopSize | null>(sizes[0] ?? null);
  const [color, setColor] = useState<ShopColor | null>(colors[0] ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const illustration = color?.illustrationVariant ?? product.variant;
  const priceCents = size?.priceCents ?? product.priceCents;

  function handleAdd() {
    add(
      {
        slug: product.slug, name, priceCents,
        sizeId: size?.id ?? null, colorId: color?.id ?? null,
        sizeLabel: size?.label ?? null, colorLabel: color?.label ?? null,
      },
      qty,
    );
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="product-page">
      <div className="product-page__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={illustration} />
      </div>
      <div className="product-page__info">
        <p className="eyebrow">{tag}</p>
        <h1 className="display product-page__name">{name}</h1>
        <p className="body product-page__desc">{desc}</p>

        {sizes.length > 0 && (
          <div className="variant-field">
            <span className="variant-label">Taille</span>
            <div className="variant-group" role="group" aria-label={`Taille de ${name}`}>
              {sizes.map((s) => (
                <button key={s.id} type="button"
                  className={`variant-option${size?.id === s.id ? " is-active" : ""}`}
                  aria-pressed={size?.id === s.id} onClick={() => setSize(s)}>
                  {s.label} · {formatEuros(s.priceCents)}
                </button>
              ))}
            </div>
          </div>
        )}
        {colors.length > 0 && (
          <div className="variant-field">
            <span className="variant-label">Coloris</span>
            <div className="variant-group" role="group" aria-label={`Coloris de ${name}`}>
              {colors.map((c) => (
                <button key={c.id} type="button"
                  className={`variant-option${color?.id === c.id ? " is-active" : ""}`}
                  aria-pressed={color?.id === c.id} onClick={() => setColor(c)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="variant-field">
          <span className="variant-label">Quantité</span>
          <div className="product-qty">
            <button type="button" aria-label="Réduire la quantité"
              onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span data-testid="product-qty">{qty}</span>
            <button type="button" aria-label="Augmenter la quantité"
              onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}>+</button>
          </div>
        </div>

        <div className="product-page__buy">
          <span className="product-page__price" data-testid="product-price">
            {formatEuros(priceCents)}
          </span>
          <button type="button" className="btn btn--filled"
            onClick={handleAdd} aria-label={`Ajouter ${name} au panier`}>
            {added ? <>Ajouté ✓</> : <>Ajouter au panier <ArrowRight /></>}
          </button>
        </div>
        {added && (
          <Link href="/panier" className="link-arrow product-page__cart-link">
            Voir le panier <ArrowRight />
          </Link>
        )}
      </div>
    </div>
  );
}
```
- [ ] **2.4** `npm run test -- product-detail` → PASS. Commit : `feat: ProductDetail (page produit interactive)`.

## Task 3 — Route `app/boutique/[slug]/page.tsx`

**Files:** Create `app/boutique/[slug]/page.tsx`

- [ ] **3.1** Créer la route :
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { ProductDetail } from "@/components/product-detail";
import { getProductBySlug } from "@/lib/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/boutique/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Produit introuvable — Coquelicot" };
  return {
    title: `${product.name} — Coquelicot · Fleuriste La Rochelle`,
    description: product.desc,
  };
}

export default async function ProduitPage({
  params,
}: PageProps<"/boutique/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <section data-section data-bg="linen" className="product-detail-section">
          <div className="container">
            <nav className="boutique-crumb" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <Link href="/boutique">boutique</Link>
              <span aria-hidden>/</span>
              <span>{product.name}</span>
            </nav>
            <ProductDetail product={product} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```
- [ ] **3.2** `npm run typecheck`. Commit : `feat(boutique): route page produit /boutique/[slug]`.

## Task 4 — Carte boutique → lien présentationnel

**Files:** Modify `components/boutique.tsx`

- [ ] **4.1** Remplacer la fonction `ProductCard` par une version sans état ni ajout :
```tsx
function ProductCard(product: ShopProduct) {
  const { slug, name, tag, desc, badge, price, variant } = product;
  return (
    <Link href={`/boutique/${slug}`} className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={variant} />
      </div>
      <div>
        <p className="eyebrow" style={{ opacity: 0.6, marginBottom: 6 }}>{tag}</p>
        <h3 className="product-card__name">{name}</h3>
      </div>
      <div className="product-card__row">
        <p className="product-card__desc">{desc}</p>
        <span className="product-card__price">{price}</span>
      </div>
    </Link>
  );
}
```
- [ ] **4.2** Nettoyer les imports en tête de fichier : retirer `useEffect, useRef`,
  `useCart`, `formatEuros`, `ArrowRight`, types `ShopColor/ShopSize` ; ajouter
  `import Link from "next/link";`. Garder `useState` (filtre) et `Bouquet`.
- [ ] **4.3** `npm run typecheck` + `npm run lint`. Commit : `feat(boutique): carte = lien vers la page produit`.

## Task 5 — Carte home → lien

**Files:** Modify `components/sections.tsx`

- [ ] **5.1** Dans le `ProductCard` de la section Shop (≈ l.112), remplacer
  `<article className="product-card">…</article>` par
  `<Link href={`/boutique/${slug}`} className="product-card">…</Link>` (déstructurer
  `slug` depuis `ShopProduct`). `Link` est déjà importé.
- [ ] **5.2** `npm run typecheck`. Commit : `feat(home): cartes vitrine cliquables vers la page produit`.

## Task 6 — Styles page produit

**Files:** Modify `app/globals.css`

- [ ] **6.1** Renommer/factoriser : remplacer le bloc `.product-card__options` /
  `.product-card__option` (ajouté précédemment, désormais inutile sur la carte) par
  `.variant-group` / `.variant-option` (mêmes pills) ; ajouter `.variant-field`,
  `.variant-label`.
- [ ] **6.2** Ajouter le bloc page produit :
```css
.product-detail-section { padding-block: 64px 96px; }
.product-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 48px;
  margin-top: 32px;
  align-items: start;
}
.product-page__media {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border-radius: 20px;
  background: color-mix(in srgb, var(--fg) 5%, transparent);
}
.product-page__media svg { width: 70%; height: 70%; }
.product-page__name { font-size: 56px; margin: 4px 0 12px; }
.product-page__desc { max-width: 48ch; }
.variant-field { margin-top: 22px; }
.variant-label {
  display: block; font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted); margin-bottom: 8px;
}
.variant-group { display: flex; flex-wrap: wrap; gap: 8px; }
.variant-option {
  font-size: 13px; padding: 7px 14px; border: 1px solid var(--line);
  border-radius: 999px; background: transparent; color: var(--fg);
  cursor: pointer; transition: background .15s, color .15s, border-color .15s;
}
.variant-option:hover { border-color: var(--burgundy); }
.variant-option.is-active {
  background: var(--burgundy); border-color: var(--burgundy); color: var(--linen);
}
.product-qty {
  display: inline-flex; align-items: center; gap: 10px;
  border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px;
}
.product-qty button { font-size: 18px; line-height: 1; width: 22px; cursor: pointer; background: none; }
.product-page__buy { display: flex; align-items: center; gap: 24px; margin-top: 32px; }
.product-page__price { font-size: 28px; font-weight: 500; }
.product-page__cart-link { display: inline-block; margin-top: 16px; }
@media (max-width: 760px) {
  .product-page { grid-template-columns: 1fr; gap: 28px; }
  .product-page__name { font-size: 40px; }
}
```
- [ ] **6.3** `npm run lint`. Commit : `feat(styles): page produit + pills de variante partagées`.

## Task 7 — Helpers e2e (via page produit)

**Files:** Modify `tests/e2e/helpers.ts`

- [ ] **7.1** Réécrire les deux helpers :
```ts
export async function addToCart(page: Page, name: string): Promise<void> {
  await page.goto("/boutique");
  await page.locator(".product-card", { hasText: name }).first().click();
  await page.getByRole("button", { name: `Ajouter ${name} au panier` }).click();
}

export async function addVariantToCart(
  page: Page,
  name: string,
  opts: { size?: string; color?: string } = {},
): Promise<void> {
  await page.goto("/boutique");
  await page.locator(".product-card", { hasText: name }).first().click();
  if (opts.size) {
    await page.getByRole("button", { name: new RegExp(`^${opts.size}`) }).click();
  }
  if (opts.color) {
    await page.getByRole("button", { name: opts.color, exact: true }).click();
  }
  await page.getByRole("button", { name: `Ajouter ${name} au panier` }).click();
}
```
_(Le bouton taille affiche « Grand · 42€ » → match par préfixe `^Grand`.)_

## Task 8 — E2E (réécriture 07, MAJ 04, nouveau 08)

**Files:** Modify `tests/e2e/07-variants.spec.ts`, `tests/e2e/04-admin-products.spec.ts` · Create `tests/e2e/08-product-page.spec.ts`

- [ ] **8.1** `07-variants.spec.ts` — tester la **page produit** `solana` :
```ts
import { expect, test } from "@playwright/test";
import { addVariantToCart } from "./helpers";

test.describe("variantes — page produit & panier", () => {
  test("sélection taille/coloris : prix réactif et lignes distinctes", async ({ page }) => {
    await page.goto("/boutique");
    await page.locator(".product-card", { hasText: "solana" }).first().click();
    await page.waitForURL("**/boutique/solana");

    await expect(page.getByTestId("product-price")).toHaveText("29€"); // Petit
    await page.getByRole("button", { name: /^Grand/ }).click();
    await expect(page.getByTestId("product-price")).toHaveText("42€");

    const blanc = page.getByRole("button", { name: "Blanc", exact: true });
    await blanc.click();
    await expect(blanc).toHaveAttribute("aria-pressed", "true");

    await addVariantToCart(page, "solana", { size: "Grand", color: "Blanc" });
    await addVariantToCart(page, "solana", { size: "Grand", color: "Naturel" });
    await addVariantToCart(page, "solana", { size: "Grand", color: "Blanc" });
    await expect(page.getByRole("link", { name: "Panier (3)" })).toBeVisible();

    await page.goto("/panier");
    const lines = page.locator('[data-testid^="cart-line-solana"]');
    await expect(lines).toHaveCount(2);
    await expect(lines.filter({ hasText: "Grand · Blanc" })).toContainText("84€");
    await expect(lines.filter({ hasText: "Grand · Naturel" })).toContainText("42€");
    await expect(page.getByTestId("cart-subtotal")).toHaveText("126€");
  });
});
```
- [ ] **8.2** `04-admin-products.spec.ts` — le bloc « voir en boutique » du test variantes
  remplace l'assertion carte par la page produit :
```ts
    await page.goto("/boutique");
    await page.locator(".product-card", { hasText: "bouquet variantes test" }).first().click();
    await expect(page.getByTestId("product-price")).toHaveText("20€");
    await page.getByRole("button", { name: /^Grand/ }).click();
    await expect(page.getByTestId("product-price")).toHaveText("40€");
```
  (Le reste du test — création, récap liste, nettoyage — inchangé. Pour le nettoyage,
  re-`goto("/admin/produits")` avant de supprimer.)
- [ ] **8.3** Créer `tests/e2e/08-product-page.spec.ts` :
```ts
import { expect, test } from "@playwright/test";
import { addToCart } from "./helpers";

test.describe("page produit", () => {
  test("slug inconnu → 404", async ({ page }) => {
    const res = await page.goto("/boutique/inexistant-xyz");
    expect(res?.status()).toBe(404);
  });

  test("produit nu : fil d'Ariane, prix, ajout sans sélecteurs", async ({ page }) => {
    await page.goto("/boutique");
    await page.locator(".product-card", { hasText: "carte fleurie" }).first().click();
    await page.waitForURL("**/boutique/carte-fleurie");
    await expect(page.getByRole("navigation", { name: "Fil d'Ariane" })).toContainText("boutique");
    await expect(page.getByTestId("product-price")).toHaveText("25€");
    await expect(page.getByRole("button", { name: /^Grand/ })).toHaveCount(0);
    await addToCart(page, "carte fleurie");
    await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
  });
});
```
- [ ] **8.4** `npm run test:e2e -- 01-shop 02-cart 04-admin-products 07-variants 08-product-page` → vert.
- [ ] **8.5** Commit : `test(e2e): page produit (variantes, 404, produit nu) + helpers`.

## Task 9 — Vérification finale

- [ ] **9.1** `npm run typecheck` · `npm run lint` · `npm run test` (unit) → vert.
- [ ] **9.2** `npm run test:e2e` (suite complète, Stripe inclus) → vert.
- [ ] **9.3** Commit final si reliquats.

---

## Self-review

- **Couverture spec** : route+404+SEO (T3), ProductDetail (T2), carte→lien (T4),
  home→lien (T5), getProductBySlug actif (T1), styles (T6), helpers (T7), e2e (T8). ✔
- **Types** : `ProductDetail({product})` (T2) consommé en T3 ; `ShopProduct` inchangé.
- **Régression** : `addToCart`/`addVariantToCart` (T7) absorbent le nouveau parcours →
  `02-cart`/`05-checkout` inchangés ; comptages `.product-card` (T4/T5) conservés
  (la classe reste, l'élément devient `<Link>`).
- **Bouton taille** affiche « Label · prix » → sélecteurs e2e par préfixe `^Grand`.
