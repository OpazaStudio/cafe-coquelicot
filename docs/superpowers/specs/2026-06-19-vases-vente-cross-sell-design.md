# Vases à la vente + suggestion au panier — Design

_Date : 2026-06-19 · Projet : cafe-coquelicot_

## Objectif

Vendre des **vases** comme produits à part entière (achetables seuls), et **proposer
des vases dans le panier** quand celui-ci contient des fleurs/bouquets mais aucun vase.

Décisions produit validées avec le commanditaire :

1. **Cross-sell simple** — le vase est un produit normal, ajouté à son prix plein.
   Pas de bundle, pas de remise, aucun impact sur Stripe.
2. **Suggestion au panier uniquement** — une section dédiée sur `/panier`
   (pas sur la fiche produit, pas de drawer).
3. **3 vases créés en seed** — `galet` (24 €), `carène` (38 €), `écume` (19 €),
   éditables ensuite via le back-office.
4. **Visuel dédié** — un composant d'illustration `Vase` (3 silhouettes au trait),
   cohérent avec le style hand-drawn existant.

## Contexte technique (état actuel)

- Le **panier** est du React Context + `localStorage` (`lib/cart/`), affiché sur la
  page `/panier` via `<CartView>`. `CartItem` ne stocke **pas** la catégorie.
- Les **line items Stripe** sont reconstruits côté serveur depuis la commande
  (`createPendingOrder` revalide tous les prix en base) → un vase est traité comme
  n'importe quel produit, **aucune adaptation paiement**.
- L'**admin** génère la liste des catégories depuis `CATEGORY_LABELS` → ajouter
  « vase » au mapping le rend automatiquement créable/éditable.
- Les **migrations d'enum** ont un précédent direct : `0005_bright_nightcrawler.sql`
  fait `ALTER TYPE "public"."fulfillment" ADD VALUE 'mondial_relay';` — pattern
  validé sur Supabase **et** PGlite (le harness e2e l'exécute).
- Les **tests** : unitaires sous vitest (`tests/unit/`), e2e sous Playwright
  (`tests/e2e/`). Le harness e2e (`tests/helpers/db.ts`) recrée une base PGlite,
  applique les migrations puis **re-seed depuis `SEED_PRODUCTS`** → les vases seront
  présents partout automatiquement.

## Architecture

### 1. Schéma — nouvelle catégorie `vase`

- `lib/db/schema.ts` : ajouter `"vase"` à `productCategory`. Le type dérivé
  `ProductCategory` l'inclut alors automatiquement.
- Migration générée via `npm run db:generate` → `0006_*.sql` contenant
  `ALTER TYPE "public"."product_category" ADD VALUE 'vase';` (+ mise à jour du
  `meta/_journal.json` par drizzle-kit). À appliquer en prod avec `npm run db:migrate`.
- `lib/categories.ts` : `vase: "Vases"` dans `CATEGORY_LABELS`.

**Effet de bord automatique** (aucun code supplémentaire) : le `<select>` catégorie
de l'admin (`product-form.tsx`) et la validation `z.enum(productCategory.enumValues)`
(`produits/actions.ts`) prennent en charge `vase`.

### 2. Détection « bouquets sans vase » — *choix d'architecture clé*

**Approche retenue : détection par slugs, sans modifier `CartItem`.**

La page `/panier` charge la liste des vases actifs (de toute façon nécessaire pour les
afficher). On en dérive `vaseSlugs = new Set(vases.map(v => v.slug))`, puis :

```ts
// lib/cart/vase-upsell.ts (fonction pure, testée unitairement)
export function shouldSuggestVases(items: Cart, vaseSlugs: Set<string>): boolean {
  const hasVase = items.some((i) => vaseSlugs.has(i.slug));
  const hasFlowers = items.some((i) => !vaseSlugs.has(i.slug));
  return hasFlowers && !hasVase;
}
```

**Pourquoi cette approche** : aucune modification de `CartItem` / `CartItemInput` /
`sanitizeCart` / `ProductDetail` (donc pas de migration `localStorage`, blast radius
minimal), et on réutilise la liste de vases déjà chargée pour l'affichage.

**Alternative écartée** — stocker `category` dans `CartItem` : plus invasif (champ
requis persisté → valeur de repli arbitraire pour les paniers existants), sans
bénéfice réel ici puisque les prix sont de toute façon revalidés en base au checkout.

**Limites assumées (v1)** :
- Un panier contenant **uniquement** la carte cadeau (`carte-fleurie`, catégorie
  `mini`) déclenche quand même la suggestion. Cas rare et inoffensif ; le distinguer
  proprement imposerait un flag « est-un-bouquet » par produit, hors périmètre.
- Un vase **désactivé** présent dans un panier serait compté comme « fleur » (il n'est
  pas dans `vaseSlugs` qui ne liste que les vases actifs). Cas marginal, inoffensif.

### 3. UI — suggestion sur `/panier`

- **`lib/products.ts`** : nouveau sélecteur
  ```ts
  export const getActiveVases = cache(async (): Promise<ShopProduct[]> =>
    (await getActiveProducts()).filter((p) => p.category === "vase"));
  ```
  Réutilise la requête `getActiveProducts` déjà mise en cache (React `cache`) — pas de
  nouvelle requête DB.
- **`app/panier/page.tsx`** (Server Component) : `await getActiveVases()` et passe le
  résultat à `<VaseSuggestions vases={vases} />`, rendu dans le `.container` sous
  `<CartView />`. La lecture DB rend la page dynamique (cohérent avec `/boutique`).
- **`components/vase-suggestions.tsx`** (nouveau, client) :
  - props : `{ vases: ShopProduct[] }`
  - lit `useCart()` → `{ items, ready, add }`
  - rend `null` si `!ready`, `vases.length === 0`, ou
    `!shouldSuggestVases(items, vaseSlugs)`
  - sinon : section **« Et pourquoi pas un vase ? »** listant les vases (illustration
    `Vase`, nom, prix) avec un bouton **« Ajouter »** par vase →
    `add({ slug, name, priceCents })` (quick-add « nu », sans variante).
  - `data-testid="vase-suggestions"` sur le conteneur (e2e).
- **`app/globals.css`** : styles de la section (réutilise le langage visuel des
  `product-card` / `cart-*` existants ; pas de nouveau système).

### 4. Visuel — composant `Vase`

- **`components/illustrations.tsx`** : nouveau `Vase({ variant, className })` sur le
  modèle de `Bouquet` — 3 variantes au trait (`stroke = currentColor`) :
  `0` vase rond/galet, `1` vase haut élancé, `2` soliflore. `viewBox` aligné sur
  `Bouquet` (`0 0 200 240`) pour un rendu homogène dans les grilles.
- **Sélection de l'illustration** : petit helper présentationnel
  ```tsx
  function ProductFigure({ category, variant, className }) {
    return category === "vase"
      ? <Vase variant={variant} className={className} />
      : <Bouquet variant={variant} className={className} />;
  }
  ```
  utilisé dans `components/boutique.tsx` (`ProductCard`), `components/product-detail.tsx`
  et `components/vase-suggestions.tsx`. Emplacement du helper : à côté des composants
  qui le consomment (p. ex. exporté depuis `illustrations.tsx`).
- *Note* : les libellés de variantes côté admin (`VARIANT_LABELS`) restent orientés
  bouquet — écart cosmétique mineur, hors périmètre v1.

### 5. Seed — les 3 vases

Ajout dans `SEED_PRODUCTS` (`lib/db/seed-data.ts`), produits « nus » (sans
taille/coloris) en v1 :

| slug | name | tag | description | priceCents | illustrationVariant |
|------|------|-----|-------------|-----------:|--------------------:|
| `galet` | galet | Vase en grès | Grès émaillé tourné, pour un bouquet rond. | 2400 | 0 |
| `carene` | carène | Vase haut | Lignes hautes et épurées, pour de longues tiges. | 3800 | 1 |
| `ecume` | écume | Soliflore | Le petit vase d'une fleur, sur un rebord de fenêtre. | 1900 | 2 |

`category: "vase"`, `badge: null`. **Non ajoutés à `HOME_PICKS`** (la home reste
inchangée). Ils apparaîtront en fin de grille boutique (ordre `bySeedOrder`) et sous
le filtre « Vases ».

### 6. Boutique — filtre « Vases »

- `components/boutique.tsx` : ajouter `{ key: "vase", label: "Vases" }` au tableau
  `FILTERS`. Le filtrage client (`p.category === active`) fonctionne tel quel.

## Flux de données

```
app/panier/page.tsx (server)
  └─ getActiveVases() ── filtre getActiveProducts() (caché)
        └─ <VaseSuggestions vases> (client)
              ├─ useCart() → items
              ├─ shouldSuggestVases(items, vaseSlugs)  // pur, testé
              └─ bouton « Ajouter » → cart.add({slug,name,priceCents})
                    └─ localStorage → checkout revalide le prix en base
```

## Plan de test

### Unitaires (vitest)

- **`tests/unit/vase-upsell.test.ts`** : `shouldSuggestVases`
  - fleurs seules → `true`
  - fleurs + vase → `false`
  - vase seul → `false`
  - panier vide → `false`
- **`tests/unit/products.test.ts`** (existant) : ajouter un cas `getActiveVases`
  ne renvoie que les produits `category === "vase"` actifs.

### E2E (Playwright) — `tests/e2e/09-vase-upsell.spec.ts`

- **Vase vendu solo** : `/boutique` → filtre « Vases » affiche les 3 vases ; ouvrir
  `galet`, ajouter au panier, vérifier la ligne dans `/panier`.
- **Suggestion visible** : ajouter `rivage` (bouquet) → `/panier` →
  `[data-testid="vase-suggestions"]` visible.
- **Suggestion masquée** : avec un vase au panier (ou après quick-add depuis la
  suggestion), la section disparaît. Panier vide → pas de section.
- **Quick-add** : cliquer « Ajouter » sur un vase de la suggestion l'ajoute au panier
  et masque la section.

### Non-régression

- `01-shop.spec.ts` : vérifier que l'ajout des vases (nouvelle catégorie) ne casse pas
  les compteurs par catégorie existants (les vases n'affectent que « Tout » et
  « Vases »). Ajuster une éventuelle assertion sur le total « Tout » si nécessaire.
- `04-admin-products.spec.ts` : la nouvelle option « Vases » du `<select>` ne doit pas
  casser le CRUD existant.

## Fichiers touchés

**Nouveaux**
- `lib/cart/vase-upsell.ts` — `shouldSuggestVases` (pur)
- `components/vase-suggestions.tsx` — section panier (client)
- `lib/db/migrations/0006_*.sql` — `ALTER TYPE … ADD VALUE 'vase'` (généré)
- `tests/unit/vase-upsell.test.ts`
- `tests/e2e/09-vase-upsell.spec.ts`

**Modifiés**
- `lib/db/schema.ts` — `"vase"` dans l'enum
- `lib/categories.ts` — `vase: "Vases"`
- `lib/db/seed-data.ts` — 3 vases dans `SEED_PRODUCTS`
- `lib/products.ts` — `getActiveVases`
- `components/illustrations.tsx` — composant `Vase` + helper `ProductFigure`
- `components/boutique.tsx` — filtre « Vases » + `ProductFigure`
- `components/product-detail.tsx` — `ProductFigure`
- `app/panier/page.tsx` — chargement vases + `<VaseSuggestions>`
- `app/globals.css` — styles de la section suggestion

## Hors périmètre (v1)

- Bundle / remise vase + bouquet.
- Suggestion sur la fiche produit ou ailleurs que `/panier`.
- Variantes (taille/coloris) sur les vases.
- Libellés d'illustration spécifiques aux vases dans l'admin.
- Flag « est-un-bouquet » par produit pour exclure la carte cadeau du déclencheur.
