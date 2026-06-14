# Variantes produits — taille & coloris

_Spec de conception · 2026-06-14 · branche `feat/produits-variantes`_

## Contexte

Aujourd'hui un produit (`products`) est un article plat : un prix unique, une
illustration au trait, une catégorie. Le métier a évolué : un bouquet principal
se décline désormais en **plusieurs tailles** et **plusieurs coloris**.

Surface actuelle (rappel) :
- **Panier** : ligne identifiée par `slug` (localStorage), `{slug, name, priceCents, qty}`.
- **Ajout au panier** : uniquement depuis `/boutique` (la carte de la home est décorative).
- **Checkout** (`createPendingOrder`) : relit le produit par `slug`, revalide le
  prix en base, fige `nameSnapshot` + `priceCentsSnapshot` dans `order_items`.
- **Kanban admin** : affiche `order_items` par `nameSnapshot`, une case par unité (`preparedQty`).
- **Tests** : Vitest (PGlite mémoire, seedé via `SEED_PRODUCTS`) + Playwright
  (PGlite, `addToCart(page, name)` clique « Ajouter {name} au panier »).

## Décisions (validées)

1. **Modèle prix** : la **taille porte le prix** (chaque taille = un prix) ; le
   **coloris est cosmétique** (même prix) mais **doit être enregistré** sur la commande.
2. **Portée** : variantes **optionnelles par produit** — un produit peut n'avoir
   aucune taille ni coloris (vendu tel quel). Les 14 produits actuels restent
   vendables sans migration de données.
3. **UX boutique** : sélection **sur la carte produit** (pas de page produit dédiée).
4. **Coloris** : **illustration par coloris** — chaque coloris pointe vers une
   variante d'illustration (`illustration_variant`).

Unité achetable = `(produit, taille, coloris)`. Le prix ne dépend que de la
taille ; le coloris ne change que l'illustration affichée.

## 1. Schéma — migration `0004`

Deux tables enfants + colonnes de snapshot sur `order_items`. `products` est
**inchangé**.

```
product_sizes                       -- la taille porte le prix
  id            uuid pk default random
  product_id    uuid not null → products.id (on delete cascade)
  label         text not null        -- "Petit" / "Moyen" / "Grand"
  price_cents   integer not null
  sort_order    integer not null default 0
  active        boolean not null default true
  created_at    timestamptz not null default now

product_colors                      -- cosmétique
  id            uuid pk default random
  product_id    uuid not null → products.id (on delete cascade)
  label         text not null        -- "Pastel" / "Vif" / "Blanc"
  illustration_variant integer not null default 0   -- 0..5
  sort_order    integer not null default 0
  active        boolean not null default true
  created_at    timestamptz not null default now

order_items (colonnes ajoutées)
  size_id              uuid → product_sizes.id  (on delete set null)
  color_id             uuid → product_colors.id (on delete set null)
  size_label_snapshot  text null
  color_label_snapshot text null
```

Règles :
- `products.priceCents` = prix de repli quand le produit n'a **aucune** taille,
  et base du « dès X€ ».
- `products.illustrationVariant` = illustration par défaut (aucun coloris choisi).
- Snapshots (`size_label_snapshot`, `color_label_snapshot`) figent l'affichage
  comme `name_snapshot`/`price_cents_snapshot` : l'historique survit à la
  suppression d'une variante (FK `set null`). Les `*_id` ne servent qu'à
  l'analytique.

Types Drizzle ajoutés : `ProductSizeRow`/`NewProductSizeRow`,
`ProductColorRow`/`NewProductColorRow`. `OrderItemRow` gagne les 4 colonnes.

## 2. Couche serveur

### `lib/products.ts`
`ShopProduct` enrichi :
```ts
type ShopProduct = {
  id, slug, name, tag, desc, category, badge,
  variant: number,            // illustration par défaut (product.illustrationVariant)
  priceCents: number,         // min des tailles, ou prix de base si aucune
  price: string,              // "dès {min}€"
  sizes:  { id: string; label: string; priceCents: number }[];   // [] si aucune
  colors: { id: string; label: string; illustrationVariant: number }[]; // [] si aucun
};
```
Les requêtes (`getActiveProducts`, `getProductBySlug`, back-office) joignent
`product_sizes` et `product_colors` (actifs uniquement côté boutique, tri
`sort_order`), regroupent en mémoire. `priceCents`/`price` = `min(sizes.priceCents)`
ou `product.priceCents`.

### `lib/orders.ts` — `createPendingOrder`
Entrée généralisée :
```ts
type CheckoutItemInput = { slug: string; sizeId?: string | null; colorId?: string | null; qty: number };
```
Revalidation serveur (dans la transaction) :
- Produit actif par `slug`.
- Si le produit a ≥ 1 **taille active** → `sizeId` **requis** et doit appartenir
  au produit + actif ; prix = `size.priceCents`. Sinon `sizeId` doit être absent ;
  prix = `product.priceCents`.
- Si le produit a ≥ 1 **coloris actif** → `colorId` **requis** et doit appartenir
  au produit + actif. Sinon `colorId` absent.
- Snapshots : `nameSnapshot = product.name`, `priceCentsSnapshot = prix résolu`,
  `sizeLabelSnapshot`/`colorLabelSnapshot` = labels, `sizeId`/`colorId` figés.
- `CheckoutError` explicite à chaque rejet.

`subtotalCents` recalculé à partir des prix résolus côté serveur (jamais le client).

### `lib/item-label.ts` — helper d'affichage (module pur, nouveau)
```ts
function composeItemName(name: string, sizeLabel?: string|null, colorLabel?: string|null): string
// "rivage — Moyen · Vif" ; "rivage — Moyen" ; "rivage · Vif" ; "rivage"
```
Pur, **sans import db** (consommé par des composants client : kanban, confirmation)
et par le serveur (Stripe). Surtout **pas** dans `lib/products.ts`, qui importe
`getDb` (les clients ne l'importent qu'en `import type`). Testé unitairement.

### `app/checkout/actions.ts` + Stripe
`ItemsSchema` accepte `sizeId`/`colorId` optionnels (uuid). Le
`product_data.name` Stripe = `composeItemName(nameSnapshot, sizeLabelSnapshot, colorLabelSnapshot)`.

## 3. Panier

### `lib/cart/cart.ts`
- **Clé de ligne** `key` : `slug` seul si pas de variante, sinon `${slug}__${sizeId}__${colorId}`.
  Deux coloris d'un même bouquet = deux lignes ; même `(taille,coloris)` ré-ajouté = `qty+1`.
- `CartItem` enrichi :
  ```ts
  type CartItem = {
    key: string; slug: string;
    sizeId: string | null; colorId: string | null;
    sizeLabel: string | null; colorLabel: string | null;
    name: string; priceCents: number; qty: number;
  };
  ```
- `addItem` fusionne par `key` ; `removeItem`/`setQty` prennent `key`.
- `sanitizeCart` rétro-compatible : une ancienne ligne `{slug,name,priceCents,qty}`
  sans `key` → `key = slug`, `sizeId/colorId/sizeLabel/colorLabel = null`. Lignes
  invalides ignorées comme aujourd'hui. Bump éventuel de `STORAGE_KEY` non requis
  grâce à cette tolérance.

### `lib/cart/cart-context.tsx` + `components/cart-view.tsx`
- Contexte : `add(item)` (où `item` porte déjà sa `key`), `remove(key)`, `changeQty(key, qty)`.
- `cart-view` : sous-label « Moyen · Vif » sous le nom ; `data-testid="cart-line-${key}"`,
  `qty-${key}`. Les produits nus gardent `key = slug` → tests existants inchangés.

## 4. UX boutique — `components/boutique.tsx`

`ProductCard` devient interactive (état local) :
- `selectedSize` = 1ʳᵉ taille (ou `null` si aucune) ; `selectedColor` = 1ᵉʳ coloris (ou `null`).
- Rendu : groupe de **boutons taille** (radiogroup) ; **pastilles coloris** (boutons),
  `aria-pressed`. L'illustration utilise `selectedColor?.illustrationVariant ?? product.variant`.
  Le prix affiché = `selectedSize?.priceCents ?? product.priceCents` (formaté plein, pas « dès »).
- « Ajouter » construit la `CartItem` (key, ids, labels, prix, nom) et appelle `add`.
- Produit nu (ni taille ni coloris) = comportement et rendu **actuels** (un seul prix « dès »,
  une illustration, ajout direct).
- Accessibilité : `aria-label` des boutons incluent produit + valeur. Aria-label d'ajout
  conservé `Ajouter {name} au panier` (le helper de test e2e en dépend).

Carte **home** (`components/sections.tsx`, `Shop`/`ProductCard` décoratif) : aucun
changement de comportement ; le « dès X€ » reflète juste le min des tailles.

## 5. Admin — `product-form.tsx` + `produits/actions.ts`

### Formulaire
Deux sous-formulaires répétables, en état React :
- **Tailles** : lignes `{id?, label, price, active}` + « Ajouter une taille » / supprimer.
- **Coloris** : lignes `{id?, label, illustrationVariant, active}` (select réutilisant
  `VARIANT_LABELS`) + ajouter/supprimer ; aperçu `<Bouquet variant=…>` par ligne.
- Soumission : deux champs cachés **JSON** (`sizes`, `colors`) sérialisant l'état.

### Action serveur (`createProduct` / `updateProduct`)
- Zod : `SizesSchema` (label requis ≤ 40, prix `parsePriceToCents`, active bool),
  `ColorsSchema` (label requis ≤ 40, illustrationVariant 0..5, active bool). Bornes
  raisonnables (ex. ≤ 12 tailles, ≤ 12 coloris).
- Transaction : upsert produit, puis **réconciliation par `id`** des enfants —
  lignes avec `id` existant → update (scopé au produit), sans `id` → insert, ids
  absents de la soumission → delete (l'`order_items.*_id` passe à NULL via FK).
- `revalidateShop()` inchangé.

### Liste `/admin/produits`
Colonne/badge récap « 3 tailles · 2 coloris » (ou « — »). Prix affiché = « dès {min} ».

### Kanban `commandes/kanban-board.tsx`
`ItemLine` affiche le sous-label `size_label · color_label` (snapshots) sous
`nameSnapshot`. Les cases `preparedQty` restent par unité, inchangées.

## 6. Seed & migration

- `npm run db:generate` → `0004_*.sql` (2 tables + 4 colonnes `order_items`).
- `SEED_PRODUCTS` inchangé pour les colonnes produit ; **nouveau** seed enfant
  pour **2-3 produits phares**. ⚠️ **Choisir des produits NON référencés par les
  e2e existants** (`01-shop`, `02-cart` utilisent `rivage`, `gabut`, `mistral` en
  lignes nues — les laisser nus). Cibles candidates : `solana` (Petit/Moyen/Grand +
  Pastel/Vif/Blanc), `lagune` (2 tailles) — à confirmer à l'implémentation en
  vérifiant les sélecteurs des specs existantes. Mécanisme : `seedIfEmpty` insère
  aussi sizes/colors ; `tests/helpers/db.ts` reflète le même seed.
- ⚠️ **Migrations en retard** : `0003` est encore en attente sur Supabase. Avant
  déploiement : `npm run db:migrate` applique `0003` puis `0004`. e2e/unitaires sur
  PGlite migrent automatiquement.

## 7. Tests (après dev)

### Unitaires (Vitest)
- `cart` : clé composite ; fusion `(taille,coloris)` identique → `qty+1` ; coloris
  différent → 2 lignes ; `setQty`/`removeItem` par `key` ; sous-total avec prix de taille ;
  `sanitizeCart` rétro-compatible (ancienne ligne sans `key`).
- `orders.createPendingOrder` : prix de taille revalidé ; coloris enregistré
  (snapshots) ; rejets — `sizeId` manquant alors que tailles existent, `sizeId`/`colorId`
  d'un autre produit, variante inactive, `sizeId` fourni sur produit nu ; chemin produit nu.
- `products` : `min` pour « dès » ; mapping `sizes`/`colors`.
- `composeItemName` : 4 combinaisons.

### E2E (Playwright)
- Admin crée un produit **2 tailles × 2 coloris** → carte boutique : boutons taille,
  pastilles coloris, **illustration et prix changent** selon la sélection ; ajout panier
  avec sélection → ligne + sous-label + prix corrects ; **2 coloris ⇒ 2 lignes** ;
  même `(taille,coloris)` ⇒ `qty 2` ; checkout fige les snapshots (vérif via récap /
  page confirmation).
- Régression : produits nus du seed (`rivage`, `gabut`, `mistral`) laissés sans
  variante → `01-shop`, `02-cart` et le comptage boutique de `04` restent verts sans
  modification.
- Helper e2e : ajouter `selectSizeColor(page, …)` si besoin ; conserver `addToCart`.

## 8. Hors périmètre (YAGNI)

- Pas de **stock** / disponibilité par variante.
- Pas de **matrice de prix** (combo taille×coloris à prix libre).
- Pas de **page produit** dédiée ni d'**images photo** (illustration au trait conservée).
- Pas de variante sur la carte **home** (reste décorative).

## Fichiers touchés (vue d'ensemble)

| Fichier | Nature |
|---|---|
| `lib/db/schema.ts` | + tables `product_sizes`, `product_colors` ; + colonnes `order_items` ; types |
| `lib/db/migrations/0004_*.sql` | généré |
| `lib/db/seed-data.ts` | + seed enfant (sizes/colors) produits phares |
| `lib/db/client.ts` (`seedIfEmpty`) | insère aussi enfants |
| `tests/helpers/db.ts` | seed enfants pour unitaires |
| `lib/products.ts` | `ShopProduct` enrichi + jointures (taille/coloris) |
| `lib/item-label.ts` | **nouveau** module pur : `composeItemName` |
| `lib/orders.ts` | `createPendingOrder` taille/coloris + snapshots |
| `app/checkout/actions.ts` | `ItemsSchema` + nom Stripe composé |
| `lib/cart/cart.ts` | clé composite, `CartItem` enrichi, `sanitizeCart` |
| `lib/cart/cart-context.tsx` | API par `key` |
| `components/cart-view.tsx` | sous-label, testids par `key` |
| `components/boutique.tsx` | carte interactive (taille/coloris/illu/prix) |
| `components/sections.tsx` | « dès » min (sinon inchangé) |
| `app/(admin)/.../produits/product-form.tsx` | sous-formulaires variantes |
| `app/(admin)/.../produits/actions.ts` | Zod + upsert enfants |
| `app/(admin)/.../produits/page.tsx` | récap variantes |
| `app/(admin)/.../commandes/kanban-board.tsx` | sous-label taille·coloris |
| `tests/unit/*`, `tests/e2e/*` | nouveaux cas |

## Questions ouvertes

Aucune — design validé. Reste à dérouler en plan d'implémentation (TDD : unitaires
d'abord sur `cart`/`orders`, puis e2e).
