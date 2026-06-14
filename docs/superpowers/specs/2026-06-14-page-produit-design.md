# Page produit & variantes sur le front

_Spec de conception · 2026-06-14 · branche `feat/produits-variantes`_

## Contexte

Les variantes (tailles = prix, coloris = cosmétique) existent en base et la carte
boutique porte aujourd'hui des **sélecteurs inline** + un bouton « Ajouter ». On veut
une vraie représentation : une **page produit dédiée** où se fait toute la sélection,
la carte de la grille devenant un simple lien.

## Décisions (validées)

1. **Parcours** : **toutes** les fiches passent par la page produit. La carte de la
   grille devient un **lien** (plus de sélecteurs ni d'ajout direct) ; l'ajout au
   panier vit sur la page produit, qu'il y ait des variantes ou non.
2. **Mise en page** : **deux colonnes** — illustration à gauche (change avec le
   coloris), détails + sélection à droite ; empilé en mobile.
3. **Route** : **`/boutique/[slug]`**, fil d'Ariane « accueil / boutique / {nom} ».

## 1. Route & données — `app/boutique/[slug]/page.tsx` (Server Component)

- `getProductBySlug(slug)` rendu **actifs uniquement** : un produit masqué ou
  inconnu → `notFound()` (cohérent avec son absence de la grille).
- `generateMetadata({ params })` : titre `« {nom} — Coquelicot · Fleuriste La
  Rochelle »`, description = `product.desc`.
- `export const dynamic = "force-dynamic"` (catalogue en base, comme `/boutique`).
- Rend `SiteHeader` + fil d'Ariane + `<ProductDetail product={…} />` + `SiteFooter`.

`getProductBySlug` / `queryProductBySlug` (lib/products.ts) gagnent un filtre
`eq(products.active, true)`. Aucun autre appelant (vérifié) ne dépend du
comportement inactif.

## 2. `components/product-detail.tsx` (nouveau, Client Component)

Props : `{ product: ShopProduct }`. État : `selectedSize` (1ʳᵉ taille ou null),
`selectedColor` (1ᵉʳ coloris ou null), `qty` (défaut 1), `added` (confirmation).

Layout deux colonnes (`.product-page`) :
- **Gauche** `.product-page__media` : grande illustration
  `<Bouquet variant={selectedColor?.illustrationVariant ?? product.variant} />`,
  badge éventuel.
- **Droite** `.product-page__info` :
  - sous-titre (`tag`), nom (`name`), description (`desc`).
  - **Tailles** (si `sizes.length`) : groupe de boutons `.variant-option` (label +
    prix), `aria-pressed`, `role="group"` aria-label « Taille de {nom} ».
  - **Coloris** (si `colors.length`) : groupe de boutons `.variant-option` (label),
    `aria-pressed`, aria-label « Coloris de {nom} ».
  - **Quantité** : stepper − / valeur / + (borné 1…`MAX_QTY`), aria-labels
    « Réduire/Augmenter la quantité ».
  - **Prix** : `formatEuros(selectedSize?.priceCents ?? product.priceCents)`
    (prix plein, jamais « dès » sur la page).
  - **Bouton** « Ajouter au panier » — `aria-label="Ajouter {name} au panier"`
    (le helper e2e en dépend) → `add({ slug, name, priceCents, sizeId, colorId,
    sizeLabel, colorLabel }, qty)`. Après ajout : « Ajouté ✓ » (timeout 1,6 s) +
    lien « Voir le panier » → `/panier`.

Produit nu : pas de groupes taille/coloris, juste quantité + ajout.

## 3. `components/boutique.tsx` — la carte devient un lien

`ProductCard` redevient **présentationnel** :
`<Link href={`/boutique/${slug}`} className="product-card">` contenant illustration
par défaut (`product.variant`), badge, `tag`, `name`, `desc`, prix (`product.price`
= « dès X€ » si variantes, prix plein sinon — déjà calculé par `lib/products.ts`).
**Retirés** : sélecteurs inline, bouton « Ajouter », `useCart`, `useState/useEffect/
useRef`, imports `formatEuros`. `BoutiqueShop` (filtre catégorie) inchangé. La grille
(`.product-card`, `.boutique-grid .product-card`, comptages) reste identique.

## 4. `components/sections.tsx` — cartes home cliquables

La carte décorative `ProductCard` de la section Shop est enveloppée d'un
`<Link href={`/boutique/${slug}`} className="product-card">` (sinon inchangée :
illustration, tag, nom, desc, prix). Le sélecteur `#shop .product-card` (comptage
home) reste valide.

## 5. Styles (`app/globals.css`)

- Nouveau bloc `.product-page` (grille 2 colonnes desktop → 1 colonne mobile),
  `.product-page__media`, `.product-page__info`, `.product-page__price`,
  `.product-qty` (stepper, réutilise le style de `.cart-line__qty`).
- Factoriser les pills de variante : classes partagées `.variant-group` /
  `.variant-option` (+ `.is-active`), reprises du style `.product-card__option`
  ajouté précédemment. **Retirer** `.product-card__options` / `.product-card__option`
  (la carte n'a plus de sélecteurs).

## 6. Panier — inchangé

Clé composite, snapshots, checkout, kanban : aucune modification. Seul le **point
d'ajout** se déplace de la carte vers `ProductDetail`.

## 7. Tests

### Helpers e2e (`tests/e2e/helpers.ts`)
- `addToCart(page, name)` : `goto("/boutique")` → clic carte (`.product-card`
  hasText name) → clic « Ajouter {name} au panier » sur la page produit.
- `addVariantToCart(page, name, {size, color})` : idem, en sélectionnant taille/
  coloris sur la page produit avant l'ajout.

### E2E
- **`07-variants`** (réécrit) : page produit `solana` — prix par défaut `29€`,
  clic « Grand » → `42€`, clic « Blanc » → `aria-pressed` ; quantité ; ajouter
  Grand·Blanc, Grand·Naturel, Grand·Blanc → panier 2 lignes (Blanc qty 2 = 84€,
  Naturel = 42€), sous-total 126€.
- **`04-admin-products`** : le test « créer un produit avec tailles et coloris »
  vérifie la réactivité prix **sur la page produit** (`/boutique/{slug}`) au lieu de
  la carte.
- **`08-product-page`** (nouveau) : `/boutique/inconnu` → 404 ; fil d'Ariane présent ;
  un produit nu (`carte-fleurie`) affiche son prix et s'ajoute sans sélecteurs.
- **`02-cart` / `05-checkout`** : inchangés (passent par le helper) — restent verts.

### Unitaire
- **`tests/unit/products.test.ts`** : `queryProductBySlug` renvoie le produit actif
  avec ses variantes ; renvoie `null` pour un produit **masqué** (filtre `active`).
- **`tests/unit/product-detail.test.tsx`** (jsdom) : rendu sous `CartProvider` —
  sélection « Grand » met le prix à `42€` ; le stepper borne 1…99 ; « Ajouter » avec
  qty 2 persiste une ligne `solana__{sizeId}__{colorId}` qty 2 dans le localStorage.
  (Fixtures `ShopProduct` construites en dur.)

## 8. Hors périmètre (YAGNI)

Pas de galerie multi-images, pas de bloc « même catégorie », pas de partage social,
pas de page produit côté admin (l'éditeur admin reste tel quel), pas de sélecteur de
variante au survol de la carte.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `app/boutique/[slug]/page.tsx` | **nouveau** — route serveur + metadata + 404 |
| `components/product-detail.tsx` | **nouveau** — page produit interactive (client) |
| `components/boutique.tsx` | carte → lien présentationnel |
| `components/sections.tsx` | carte home → lien |
| `lib/products.ts` | `queryProductBySlug`/`getProductBySlug` actifs uniquement |
| `app/globals.css` | styles page produit + `.variant-*` partagés |
| `tests/e2e/helpers.ts` | helpers via page produit |
| `tests/e2e/07-variants.spec.ts` | réécrit (page produit) |
| `tests/e2e/04-admin-products.spec.ts` | réactivité sur page produit |
| `tests/e2e/08-product-page.spec.ts` | **nouveau** — 404, fil, produit nu |
| `tests/unit/product-detail.test.tsx` | **nouveau** — sélection/stepper/ajout |

## Questions ouvertes

Aucune — design validé. Implémentation en TDD (unitaire `product-detail` d'abord,
puis route + carte, puis e2e).
