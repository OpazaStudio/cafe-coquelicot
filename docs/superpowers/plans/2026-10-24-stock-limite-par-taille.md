# Stock limité par taille — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher la survente d'un bouquet produit en quantité limitée, sans toucher au catalogue illimité qui constitue l'essentiel de la boutique.

**Architecture:** Un compteur nullable par taille (`NULL` = illimité) dont la commande `pending` est la réservation : un seul `UPDATE` gardé, dans la transaction qui crée la commande, décrémente et refuse en même temps. Ce qui a été décrémenté est persisté sur la ligne de commande, parce que `order_items.size_id` est en `ON DELETE SET NULL` et ne permet plus de savoir quoi rendre. Chaque chemin d'annulation rejoue ces colonnes dans sa propre transaction, de sorte qu'un crédit raté annule aussi le changement de statut.

**Tech Stack:** Next.js 16.2.9 (Server Actions, Route Handlers, ISR), Drizzle ORM 0.45.2, Postgres/Supabase (pooler, `prepare: false`), PGlite en tests, Stripe 22.2.0, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-stock-limite-bouquets-design.md` — révisé le 2026-10-24 contre le code post-phase-0. Lire aussi sa section « Phase 0 — LIVRÉE », dont ce plan consomme les primitives.

## Global Constraints

- **Aucun commentaire dans le code livré.** Ni en-tête, ni JSDoc, ni note inline. Les commentaires déjà présents dans les fichiers modifiés ne sont pas touchés. Exception : directives fonctionnelles (`eslint-disable`, `ts-expect-error`).
- **Aucun commit sans demande explicite de l'utilisateur.** À répéter dans le brief de chaque implémenteur : le flux par sous-agents suppose normalement un commit par tâche, et un sous-agent ne lit que sa tâche.
- **Aucun appel réseau à Stripe ni à Resend.** `.env.local` porte des clés **live**. Mocker à la frontière de module.
- **Next.js 16.2.9 n'est pas celui des données d'entraînement.** Lire `node_modules/next/dist/docs/` avant d'utiliser une API Next absente du dépôt.
- Textes utilisateurs et messages d'erreur **en français**.
- Suite en série : `npm test -- --no-file-parallelism`. Lint : `rtk lint`, **jamais `npx rtk lint`** (rtk est un binaire local ; npx irait chercher un paquet npm homonyme).
- **Base de référence : 15 échecs / 581 tests**, dont **11 dus au seed incomplet** (`estran`, `galerne`, `carte-fleurie`) et **4 à des tests de contenu**. Liste figée dans `.superpowers/sdd/2026-10-24-phase0-cycle-de-vie-commandes/baseline-failures.txt`. **Ne pas la corriger, ne pas toucher à `lib/db/seed-data.ts`.**
- **PGlite est mono-connexion.** Aucun test ne prouve la concurrence ; un test qui le prétendrait serait vert pour une implémentation qui survend en production. Les `describe` concernés portent la mention « (logique, sans concurrence réelle) ».
- `lib/orders.ts` n'importe pas Stripe et n'appelle jamais `revalidatePath` (ses fonctions tournent pendant le rendu de `app/commande/confirmee/page.tsx`).
- Seuls `*.test.*`, `*.spec.*` et `__tests__` sont ignorés par `next build` : tout helper de test partagé hors de ces noms reste strictement typé.

## Review Focus

Cinq cas que la spec implique et qu'aucune tâche n'exercerait spontanément. Chacun a son test rattaché.

1. **Désactiver la dernière taille active d'un produit épuisé le rend illimité.** L'autorité retombe sur `products.stock_qty`, `NULL` par défaut. Attendu : le formulaire refuse. (Tâche 5, étape 1.)
2. **Deux lignes de panier sur la même taille** (deux coloris) doivent être agrégées, au décrément comme au plafond affiché, sinon on vend deux fois la dernière unité. (Tâches 2 et 7.)
3. **`GREATEST(0, NULL + n)` vaut `NULL`, pas 0.** Le delta admin sur un compteur passé à illimité entre-temps doit être traité explicitement. (Tâche 5, étape 1.)
4. **Le client qui revient par le lien de retour de Stripe** atterrit sur `/panier` et s'y voit refuser son propre bouquet, sans jamais atteindre `startCheckout`. (Tâche 7, étape 1.)
5. **Une libération qui échoue après le changement de statut** doit annuler ce changement et remonter en 500, sinon le bouquet n'est jamais rendu et Stripe ne rejoue pas. (Tâche 3, étape 1.)

---

### Task 1: Schéma, migration 0016 et résolution à deux niveaux

**Files:**
- Modify: `lib/db/schema.ts` (colonnes + types exportés)
- Create: `lib/db/migrations/0016_*.sql` + entrée de journal + instantané, **par `npm run db:generate`**
- Modify: `lib/products.ts` (`ShopSize`, `ShopProduct`, `assemble`)
- Modify: `tests/unit/product-form.test.tsx`, `tests/unit/product-detail.test.tsx`, `tests/unit/vase-suggestions.test.tsx`, `tests/unit/seo.test.ts` (fixtures typées)
- Test: `tests/unit/stock-resolution.test.ts` (créer)

**Interfaces:**
- Consomme : rien.
- Produit :
  ```ts
  // lib/db/schema.ts
  products.stockQty: integer | null
  productSizes.stockQty: integer | null
  orderItems.stockReservedQty: integer      // NOT NULL DEFAULT 0
  orderItems.stockReservedSizeId: string | null     // sans FK
  orderItems.stockReservedProductId: string | null  // sans FK

  // lib/products.ts
  export type ShopSize = { id: string; label: string; priceCents: number; soldOut: boolean };
  export type ShopProduct = { /* … */ soldOut: boolean };
  export function resolveStockKey(
    product: ProductRow, activeSizes: ProductSizeRow[], sizeId: string | null,
  ): { table: "product_sizes" | "products"; id: string; stockQty: number | null };
  ```
  `soldOut` est dérivé, **jamais** le compteur : tout champ de `ShopProduct` part dans le HTML et le flight RSC.

- [ ] **Step 1: Write the failing tests**

```ts
describe("résolution du stock à deux niveaux", () => {
  it("le compteur de la taille fait foi quand le produit a des tailles actives", async () => {
    // produit avec 2 tailles actives, stock 3 sur la première, products.stock_qty = 99
    expect(resolveStockKey(p, sizes, sizes[0].id)).toEqual({ table: "product_sizes", id: sizes[0].id, stockQty: 3 });
  });
  it("retombe sur le compteur produit quand aucune taille n'est active", async () => { /* … */ });
  it("une taille à NULL reste illimitée malgré un compteur produit fini", async () => { /* … */ });
});

describe("soldOut dérivé", () => {
  it("une taille à 0 est soldOut, une taille à NULL ne l'est pas", async () => { /* … */ });
  it("le produit est soldOut quand toutes ses tailles actives sont à 0", async () => { /* … */ });
  it("le prix « dès X » se calcule sur les tailles disponibles", async () => {
    // Petit 30€ épuisé, Grand 50€ dispo -> « dès 50 € »
  });
  it("retombe sur toutes les tailles quand tout est épuisé", async () => { /* … */ });
  it("n'expose jamais le compteur", () => {
    expect(JSON.stringify(shopProduct)).not.toMatch(/stockQty|stock_qty/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stock-resolution.test.ts`
Expected: FAIL — `resolveStockKey is not a function`.

- [ ] **Step 3: Add the columns to `lib/db/schema.ts` and generate the migration**

Les cinq champs du bloc Interfaces, dans le style du fichier. Les deux `stockReserved*Id` sont des `uuid()` **sans `.references()`**. Les deux `CHECK` (`"<table>_stock_qty_nonneg"`, `stock_qty IS NULL OR stock_qty >= 0`) via l'API `check()` de Drizzle, premières contraintes de ce type du dépôt.

Puis `npm run db:generate`. **Avant de lancer**, vérifier que l'horloge de la machine dépasse `1789914243063` : `generate` fixe le `when` du journal à `Date.now()`, et un `when` inférieur serait sauté sans bruit. **Ne jamais écrire le `.sql` ni le journal à la main.**

- [ ] **Step 4: Implement `resolveStockKey` and the `soldOut` derivation**

`resolveStockKey` dans `lib/products.ts`. Dans `assemble`, `soldOut` par taille (`stockQty === 0`) et pour le produit (toutes tailles actives `soldOut`, ou produit nu à 0), et `minCents` calculé sur les tailles non `soldOut` avec repli sur toutes.

- [ ] **Step 5: Fix the typed fixtures**

Cinq erreurs dans quatre fichiers de test (ajout de `soldOut` et `stockQty: null`). `npm run typecheck` doit repasser à 0.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/unit/stock-resolution.test.ts tests/unit/products.test.ts` puis `npm run typecheck`
Expected: PASS, exit 0.

---

### Task 2: Réserver dans `createPendingOrder`, et `expires_at`

**Files:**
- Modify: `lib/orders.ts` (`createPendingOrder`)
- Create: `lib/stock/reserve.ts`
- Modify: `app/checkout/actions.ts` (`expires_at`)
- Test: `tests/unit/stock-reserve.test.ts` (créer), `tests/unit/start-checkout.test.ts`

**Interfaces:**
- Consomme : `resolveStockKey` (tâche 1).
- Produit :
  ```ts
  // lib/stock/reserve.ts
  export type StockReservation = {
    orderItemIndex: number;
    reservedQty: number;
    sizeId: string | null;
    productId: string | null;
  };
  export async function reserveStock(
    tx: Tx,
    lines: Array<{ productId: string; sizeId: string | null; qty: number; productName: string; sizeLabel: string | null }>,
  ): Promise<StockReservation[]>;
  ```
  Lève `CheckoutError` avec un message nommant le produit et la taille dès qu'une clé refuse. Les clés sont **agrégées** puis **triées** (table, puis id).

- [ ] **Step 1: Write the failing tests**

```ts
it("décrémente et laisse passer quand le stock suffit", async () => { /* stock 3, qty 2 -> 1 */ });
it("refuse sans créer ni commande ni ligne quand le stock manque", async () => {
  await expect(createPendingOrder(db, camille, [{ slug: "limite", sizeId, qty: 2 }]))
    .rejects.toThrow(CheckoutError);
  expect(await countOrders(db)).toBe(0);
  expect(await stockOf(db, sizeId)).toBe(1);
});
it("refuse un stock à 0", async () => { /* … */ });
it("accepte une taille illimitée et la laisse à NULL", async () => { /* … */ });
it("agrège deux coloris de la même taille", async () => {
  // stock 1, deux lignes qty 1 -> refus ; stock 2 -> accepté, compteur à 0
});
it("rollback complet si une seule ligne échoue", async () => {
  // ligne A disponible, ligne B épuisée -> A non décrémentée, aucune commande
});
it("n'écrit les colonnes de réservation que si un décrément a eu lieu", async () => {
  // taille illimitée -> stock_reserved_qty = 0 et les deux ids nuls
});
it("refuse une taille désactivée entre la lecture et la transaction", async () => { /* … */ });
```

Et dans `start-checkout.test.ts` : `expires_at` est posé entre 30 et 40 minutes après maintenant.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stock-reserve.test.ts`
Expected: FAIL — aucun décrément, les compteurs ne bougent pas.

- [ ] **Step 3: Implement `reserveStock`**

Un `UPDATE` par clé agrégée, dans l'ordre trié :
`SET stock_qty = stock_qty - $n WHERE id = $id AND product_id = $pid AND active = true AND (stock_qty IS NULL OR stock_qty >= $n) RETURNING stock_qty`.
0 ligne → `CheckoutError` nommant produit et taille. `RETURNING` non `NULL` → une `StockReservation`. La variante `products` n'a pas de `product_id` ni d'`active`.

- [ ] **Step 4: Call it from `createPendingOrder`**

Dans la transaction existante, **avant** l'INSERT des `order_items`, et reporter les `StockReservation` dans le `values` de l'INSERT. **Jamais un UPDATE ultérieur sur `order_items`.**

- [ ] **Step 5: Add `expires_at` to the Stripe session**

`expires_at: Math.floor(Date.now() / 1000) + 35 * 60` dans `sessions.create`. Plage autorisée 30 min – 24 h ; la marge de 5 minutes absorbe la latence, Stripe horodatant à la réception.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/stock-reserve.test.ts tests/unit/orders.test.ts tests/unit/start-checkout.test.ts`
Expected: PASS, sans dépasser les 11 échecs préexistants d'`orders.test.ts`.

---

### Task 3: Libérer sur les quatre chemins, chacun dans sa transaction

**Files:**
- Create: `lib/stock/release.ts`
- Modify: `lib/orders.ts` (`cancelOrderBySession`, `updateOrderStatus`)
- Modify: `lib/checkout/abandon.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Test: `tests/unit/stock-release.test.ts` (créer), `tests/unit/webhook.test.ts`

**Interfaces:**
- Consomme : `StockReservation` (tâche 2).
- Produit :
  ```ts
  // lib/stock/release.ts
  export async function releaseOrderStock(tx: Tx, orderId: string): Promise<void>;
  ```
  Rejoue les colonnes persistées (`UPDATE … SET stock_qty = stock_qty + $n WHERE id = $key AND stock_qty IS NOT NULL`), sans filtre `active`, puis remet `stock_reserved_qty` à 0 en conservant les clés. No-op si la ligne a disparu ou si le compteur est repassé à `NULL`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("libération (logique, sans concurrence réelle)", () => {
  it("rend le stock sur updateOrderStatus pending -> cancelled", async () => { /* … */ });
  it("NE rend PAS le stock sur paid -> cancelled", async () => { /* … */ });
  it("NE rend PAS le stock sur preparing -> cancelled", async () => { /* … */ });
  it("rend le stock sur cancelOrderBySession par session", async () => { /* … */ });
  it("rend le stock sur cancelOrderBySession par metadata.orderId", async () => { /* … */ });
  it("rend le stock sur abandonPendingOrder", async () => { /* … */ });
  it("ne crédite pas deux fois au rejeu", async () => { /* … */ });
  it("ne crédite pas une commande qui n'avait rien réservé", async () => { /* … */ });
  it("ne crédite pas le compteur produit quand la taille a été supprimée", async () => {
    // size_id passe à NULL mais stock_reserved_size_id survit -> no-op, pas de crédit au produit
  });
  it("annule le changement de statut si le crédit échoue", async () => {
    // crédit mocké en échec -> la commande reste pending ET l'exception remonte
  });
  it("aucun verdict de reconcilePaidSession n'écrit le stock", async () => {
    // les quatre verdicts, compteur inchangé dans les quatre cas ;
    // paid_on_cancelled est un cas a resolution humaine, pas un credit automatique
  });
});
```

Et dans `webhook.test.ts` : un échec de libération sur `checkout.session.expired` fait répondre **500**, pas 200.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stock-release.test.ts`
Expected: FAIL — `releaseOrderStock is not a function`.

- [ ] **Step 3: Implement `releaseOrderStock`**

- [ ] **Step 4: Wrap each cancellation path in a transaction**

`cancelOrderBySession` : les deux branches (par session, puis repli par `metadata.orderId`) dans **une seule** `db.transaction`, crédit uniquement si le CAS a renvoyé une ligne. **Garder son `.update(orders)` inline** — l'invariant de source exige qu'elle reste détectée comme écrivain de statut, et ne déclarer aucune `function` nommée avant elle dans le fichier.

`abandonPendingOrder` : l'appel `expireSessionForCancel` reste **hors** de la transaction ; celle-ci ne couvre que le CAS et le crédit.

`updateOrderStatus` : la garde est `order.status === "pending" && to === "cancelled"` sur la **lecture verrouillée**, dans la même transaction. Ce n'est **pas** « l'UPDATE a renvoyé une ligne » : sous `FOR UPDATE` + CAS, toute transition autorisée en renvoie une, `paid → cancelled` compris.

- [ ] **Step 5: Let the webhook surface a release failure**

L'exception de la libération doit sortir en 500 pour que Stripe rejoue. Ne pas l'avaler.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/stock-release.test.ts tests/unit/webhook.test.ts tests/unit/orders.test.ts`
Expected: PASS.

---

### Task 4: Invariants de source 3 et 4, et correction du hook e2e

**Files:**
- Modify: `tests/unit/orders-write-invariants.test.ts`
- Modify: `app/api/e2e/orders/route.ts`
- Modify: `tests/unit/e2e-hooks-guard.test.ts`

**Interfaces:**
- Consomme : `releaseOrderStock` (tâche 3).
- Produit : le `BodySchema` du hook accepte `sizeLabel?: string` et `colorLabel?: string`, résolus côté serveur par produit + libellé (aucun uuid exposé).

- [ ] **Step 1: Write the failing tests**

Invariant 3 : tout `.update(productSizes)` ou `.update(products)` dont le `.set()` touche `stockQty` doit vivre dans une liste blanche de fonctions nommées (`reserveStock`, `releaseOrderStock`, la fonction de delta du formulaire). `.insert(productSizes)` reste libre. **Résolution d'alias : prendre la déclaration la plus proche AVANT l'appel**, à cause des trois `const values` du fichier admin.

Invariant 4 : toute fonction qui contient `.update(orders)` avec `'cancelled'` ou un statut non littéral, ou un appel `setOrderStatusIfUnchanged(` avec `'cancelled'`, doit aussi contenir l'appel de libération.

Chaque invariant a son **test d'ancrage** qui échoue bruyamment si le scanner cesse de détecter quoi que ce soit.

Hook : POST sur un produit à tailles avec `sizeLabel` crée la commande ; `CheckoutError` renvoie **409** avec le message ; les trois gardes d'environnement renvoient toujours 404.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/orders-write-invariants.test.ts tests/unit/e2e-hooks-guard.test.ts`
Expected: FAIL — invariants absents, hook en 500 sur `CheckoutError`.

- [ ] **Step 3: Add invariants 3 and 4**

- [ ] **Step 4: Fix the e2e hook and remove the exemption, in the same step**

`BodySchema` accepte `sizeLabel`/`colorLabel`. `try/catch` limité à `instanceof CheckoutError` → 409 ; tout le reste continue de lever. L'annulation passe par le chemin qui libère ; les statuts non terminaux restent posés par CAS direct depuis `pending`, `canTransition` ne les autorisant pas.

Dans le **même pas**, retirer la constante `E2E_HOOK`, son assertion d'ancrage et le filtre d'exemption : le hook corrigé n'en a plus besoin, et l'exemption laissée en place ferait désormais échouer le test.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/orders-write-invariants.test.ts tests/unit/e2e-hooks-guard.test.ts`
Expected: PASS.

---

### Task 5: Éditer le stock depuis le back-office

**Files:**
- Modify: `app/(admin)/admin/(panel)/produits/actions.ts`
- Modify: `app/(admin)/admin/(panel)/produits/product-form.tsx`
- Modify: `app/(admin)/admin/(panel)/produits/page.tsx` (pastilles)
- Modify: `lib/products.ts` (`getProductWithVariants` : unités retenues)
- Test: `tests/unit/stock-admin.test.ts` (créer), `tests/unit/sync-children.test.ts`, `tests/unit/product-form.test.tsx`

**Interfaces:**
- Consomme : rien des tâches 2-4.
- Produit : `getProductWithVariants` renvoie en plus `pendingBySizeId: Map<string, number>` (unités retenues par des commandes `pending`).

- [ ] **Step 1: Write the failing tests**

```ts
it("payload sans clé de stock laisse le compteur inchangé", async () => { /* … */ });
it("saisie égale à l'initiale après un décrément concurrent conserve le compteur courant", async () => {
  // initiale 5, décrément à 3, saisie 5 -> reste 3
});
it("saisie différente applique le delta", async () => { /* initiale 3, courant 2, saisie 5 -> 4 */ });
it("chaîne vide pose NULL, « 0 » pose 0", async () => { /* … */ });
it("delta sur un compteur passé à NULL pose la valeur absolue", async () => {
  // GREATEST(0, NULL + n) vaut NULL, pas 0 : le cas doit être traité explicitement
});
it("refuse abc, 1.5 et -1 avec un message nommant la taille", async () => { /* … */ });
it("refuse de supprimer une taille qui porte une réservation pending", async () => { /* … */ });
it("refuse de désactiver la dernière taille active d'un produit à compteur fini", async () => {
  // sinon l'autorité retombe sur products.stock_qty = NULL = illimité
});
it("n'écrit jamais stockQty via values ni via ...rest", async () => { /* … */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stock-admin.test.ts`
Expected: FAIL — le compteur est écrasé.

- [ ] **Step 3: Add the dedicated zod schema**

`z.string().trim().regex(/^\d{0,4}$/).optional()` pour la saisie **et** l'initiale. `formData.get("stockQty") ?? undefined`, **jamais `?? ""`**. Ne pas utiliser `z.coerce.number()` (transforme `""` en `0`, donc illimité devient épuisé) ni le `preprocess` existant (transforme une clé absente en `null`). `superRefine` : sur une taille avec `id`, une saisie présente exige l'initiale.

- [ ] **Step 4: Implement the relative write**

Hors de `values` et de `...rest`. Comparaison **après parse numérique**. Écriture relative `GREATEST(0, stock_qty + (saisie - initiale))`, **dans le même ordre trié que la réservation** — le formulaire verrouille sinon les tailles dans l'ordre de soumission. Les deux gardes de refus avant la suppression et la désactivation.

- [ ] **Step 5: Surface the counters in the back-office**

Champ « Disponible à la vente » par taille, en `type="text" inputMode="numeric"`, brouillon en chaîne, placeholder « Illimité ». En lecture seule « dont N en attente de paiement ». Pastille « Épuisé » / « n restants » dans la liste produits : « En ligne » est trompeur pour un produit épuisé. Nommer les champs « Stock taille N » — `getByLabel('Nom')` des specs Playwright est une recherche par sous-chaîne.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/stock-admin.test.ts tests/unit/sync-children.test.ts tests/unit/product-form.test.tsx`
Expected: PASS.

---

### Task 6: Afficher l'état épuisé sur toutes les surfaces

**Files:**
- Modify: `components/product-detail.tsx`, `components/boutique.tsx`, `components/vase-suggestions.tsx`, `components/views/home-view.tsx`
- Modify: `lib/seo.ts` (`productJsonLd`)
- Modify: `app/globals.css` (classe d'état épuisé)
- Test: `tests/unit/product-detail.test.tsx`, `tests/unit/vase-suggestions.test.tsx`, `tests/unit/seo.test.ts`

**Interfaces:**
- Consomme : `ShopSize.soldOut`, `ShopProduct.soldOut` (tâche 1).

- [ ] **Step 1: Write the failing tests**

```ts
it("présélectionne la première taille disponible", async () => { /* … */ });
it("rend les tailles épuisées visibles mais inactives", async () => { /* aria-disabled, pas disabled */ });
it("handleAdd ne fait rien sur une taille épuisée", async () => {
  // aria-disabled ne bloque pas le clic : la garde doit être dans le gestionnaire
  expect(addSpy).not.toHaveBeenCalled();
  expect(trackAddToCart).not.toHaveBeenCalled();
});
it("VaseSuggestions refuse l'ajout rapide d'un vase épuisé", async () => { /* même garde */ });
it("le CTA passe à « Épuisé » quand tout est épuisé", async () => { /* … */ });
it("productJsonLd dérive availability par offre", async () => { /* OutOfStock sur la taille à 0 */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/product-detail.test.tsx tests/unit/vase-suggestions.test.tsx`
Expected: FAIL — l'ajout passe.

- [ ] **Step 3: Guard every purchase surface**

Les gardes vivent dans `handleAdd` et dans le `onClick` de `VaseSuggestions`, **avant** `add()` et `trackAddToCart`. `aria-disabled` plutôt que `disabled` pour rester annoncé. « Épuisé » passe avant le badge admin. Créer la classe CSS d'état épuisé : aucune n'existe dans `app/globals.css`.

- [ ] **Step 4: Derive JSON-LD availability**

Par offre dans `productJsonLd`. Les produits épuisés restent dans le sitemap et indexables ; ne pas toucher à `products.updated_at`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/product-detail.test.tsx tests/unit/vase-suggestions.test.tsx tests/unit/seo.test.ts`
Expected: PASS.

---

### Task 7: Disponibilité du panier et cookie de réservation

**Files:**
- Create: `app/panier/availability.ts` (Server Action)
- Modify: `app/checkout/actions.ts` (pose du cookie, relecture)
- Modify: `app/panier/page.tsx`, `app/checkout/page.tsx` (lecture du cookie)
- Modify: `components/cart-view.tsx`, `components/checkout-form.tsx`
- Test: `tests/unit/cart-availability.test.ts` (créer), `tests/unit/start-checkout.test.ts`

**Interfaces:**
- Consomme : `resolveStockKey` (tâche 1), `abandonPendingOrder` (phase 0).
- Produit :
  ```ts
  // app/panier/availability.ts
  export async function cartAvailability(
    lines: Array<{ slug: string; sizeId: string | null }>,
  ): Promise<Array<{ slug: string; sizeId: string | null; maxQty: number | null }>>;
  ```
  `maxQty: null` = illimité. Répond **uniquement** pour les couples demandés — le serveur ne voit jamais le panier, donc pas de table globale. Le plafond est calculé sur le **total agrégé par taille**, et réintègre les unités retenues par la commande `pending` du visiteur lui-même.

- [ ] **Step 1: Write the failing tests**

```ts
it("plafonne sur le total agrégé de la taille", async () => { /* deux coloris, une seule clé */ });
it("renvoie null pour une taille illimitée", async () => { /* … */ });
it("ne répond que pour les couples demandés", async () => { /* … */ });
it("réintègre les unités retenues par la propre commande pending du visiteur", async () => {
  // sans ça, le client qui revient par cancel_url voit son propre bouquet « Épuisé »
  // et n'atteint jamais startCheckout, seul endroit où tourne l'auto-libération
});
it("startCheckout libère la commande désignée par le cookie avant de réserver", async () => { /* … */ });
it("les pages ISR ne lisent jamais le cookie", () => {
  // cookies() les rendrait dynamiques et annulerait revalidate = 3600
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cart-availability.test.ts`
Expected: FAIL — `cartAvailability is not a function`.

- [ ] **Step 3: Implement `cartAvailability`**

- [ ] **Step 4: Set and read the reservation cookie**

Cookie `httpOnly` posé dans `startCheckout` avec l'id de la commande, durée alignée sur `expires_at`. Au `startCheckout` suivant, si cette commande est encore `pending` : expirer sa session, l'annuler et la libérer **avant** de réserver. Ne pas se fier à l'e-mail pour la retrouver (falsifiable), ni au placeholder `{CHECKOUT_SESSION_ID}` sur `cancel_url` (non documenté dans les types).

`/panier` et `/checkout` sont `force-dynamic` et lisent ce cookie. Les trois pages ISR ne le lisent **jamais**.

- [ ] **Step 5: Cap `qty` to the available stock in `startCheckout`**

**RETIRÉE le 2026-10-25 (ruling du contrôleur, après relecture de la tâche 7).** Le pré-contrôle serveur `stockRefusal` est supprimé ; seul le plafond d'interface du panier est conservé.

Constat établi en lisant le code : `reserveStock` tourne en premier dans la transaction de `createPendingOrder` (`lib/orders.ts:216`), **avant** l'insert dans `orders`, et `generateOrderNumber()` est une fonction pure de la date — aucun numéro de commande n'est consommé sur un refus, aucune ligne n'est écrite, et l'appel Stripe est postérieur au jet. `reserveStock` agrège déjà par clé de stock, trie avec le même `compareStockKeys` et lève le message littéralement partagé. Le pré-contrôle n'évitait donc ni insert, ni numéro, ni appel réseau, ni n'améliorait le message : il dupliquait une quarantaine de lignes de logique à tenir en phase, coûtait deux `SELECT` par checkout, et **introduisait une régression** — lisant hors transaction, il refusait un checkout qu'un stock libéré entretemps aurait rendu acceptable.

Texte d'origine, conservé pour mémoire : signalé HIGH par la revue de sécurité automatique comme déni d'inventaire non authentifié ; `cartAvailability` calcule déjà ce plafond, l'appliquer côté serveur avant `createPendingOrder` bornerait ce qu'un seul appel peut retenir. `ItemsSchema` autorise aujourd'hui `qty` jusqu'à 99 et 50 lignes, soit un compteur vidé en un appel. Test : une demande de 99 sur une taille à 3 est refusée avec le message exact, aucune commande créée, compteur inchangé.

Le limiteur par IP reste écarté, voir « Ce que ce plan ne fait pas ».

- [ ] **Step 6: Wire the cart and checkout views**

Appel une fois le panier `ready`. Lignes marquées « Épuisé » ou « plus que N », `+` plafonné, CTA désactivé, bouton Retirer dans le récap du checkout. La course restante subsiste : le message de `startCheckout` reste l'oracle.

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/unit/cart-availability.test.ts tests/unit/start-checkout.test.ts`
Expected: PASS.

---

### Task 8: Revalidation du cache sur bascule de disponibilité

**Files:**
- Create: `lib/stock/revalidate.ts`
- Modify: `app/checkout/actions.ts`, `app/api/stripe/webhook/route.ts`, `app/(admin)/admin/(panel)/commandes/actions.ts`, `app/api/e2e/orders/route.ts`
- Test: `tests/unit/stock-revalidate.test.ts` (créer)

**Interfaces:**
- Produit :
  ```ts
  // lib/stock/revalidate.ts
  export async function slugsOfOrder(db: Db, orderId: string): Promise<string[]>;
  ```
  `order_items` → `products.slug`, en ignorant `product_id` nul.

- [ ] **Step 1: Write the failing tests**

```ts
it("retrouve les slugs d'une commande en ignorant product_id nul", async () => { /* … */ });
it("revalide des chemins littéraux, jamais le motif [slug]", async () => {
  expect(revalidatePath).toHaveBeenCalledWith("/boutique/limite");
  expect(revalidatePath).not.toHaveBeenCalledWith("/boutique/[slug]", "page");
});
it("revalide aussi après une réservation réussie", async () => { /* la dispo bascule aussi à la baisse */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stock-revalidate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `slugsOfOrder` and wire the callers**

Jamais dans `lib/orders.ts`. Dans `startCheckout` **hors du `try`** (un appel à l'intérieur serait pris par le `catch`, qui annulerait une commande saine), après chaque `abandonPendingOrder`, dans le webhook sur les deux événements d'expiration et **dans son propre `try/catch`** pour garder le 200, dans `changeOrderStatus` quand `to` vaut `cancelled`, et dans le hook e2e — sans quoi aucune spec ne peut asserter l'affichage.

Chemins littéraux `/`, `/boutique`, `/boutique/${slug}`, sans paramètre `type`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/stock-revalidate.test.ts`
Expected: PASS.

---

### Task 9: Case « remettre en vente » sur `paid → cancelled`

> **Décision du contrôleur, pas de l'utilisateur.** La spec recommande de ne jamais
> remettre en stock automatiquement une commande payée, et d'offrir une case
> explicite. Si l'utilisateur préfère « aucune remise en stock sur une commande
> payée », **cette tâche entière disparaît** et rien d'autre ne change.

**Files:**
- Modify: `app/(admin)/admin/(panel)/commandes/actions.ts` (`changeOrderStatus`, `StatusActionState`)
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`
- Modify: `lib/orders.ts` (`updateOrderStatus`)
- Test: `tests/unit/stock-restock-admin.test.ts` (créer)

**Interfaces:**
- Consomme : `releaseOrderStock` (tâche 3).
- Produit :
  ```ts
  export async function changeOrderStatus(
    orderId: string, to: string, restock?: boolean,
  ): Promise<StatusActionState>;
  export type StatusActionState = { error: string } | { ok: string } | undefined;
  ```
  `updateOrderStatus` gagne un cinquième paramètre `restock = false`, honoré **uniquement** sur `paid → cancelled`.

- [ ] **Step 1: Write the failing tests**

```ts
it("ne remet rien en vente par défaut sur paid -> cancelled", async () => { /* … */ });
it("remet en vente quand la case est cochée, sur paid -> cancelled", async () => { /* … */ });
it("ignore la case sur preparing -> cancelled", async () => { /* bouquet déjà composé */ });
it("ignore la case sur pending -> cancelled", async () => { /* déjà libéré d'office */ });
it("annonce le succès à Céline quand l'unité repart en vente", async () => { /* { ok: ... } */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stock-restock-admin.test.ts`
Expected: FAIL — la signature ne porte pas le drapeau.

- [ ] **Step 3: Widen the chain**

Les trois maillons : `updateOrderStatus`, `changeOrderStatus`, et le formulaire. `StatusActionState` gagne une variante de succès, qu'il ne sait pas exprimer aujourd'hui. La case n'apparaît que sur la transition `paid → cancelled`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/stock-restock-admin.test.ts tests/unit/admin-order-cancel.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite against the frozen baseline**

Run: `npm test -- --no-file-parallelism`, puis `npm run typecheck`, puis `rtk lint`
Expected: aucun échec au-delà des 15 figés ; exit 0 pour les deux derniers.

---

---

### Task 10: Spécification e2e du stock

**Files:**
- Create: `tests/e2e/16-stock.spec.ts`
- Modify: `tests/e2e/helpers.ts` si un helper manque

**Interfaces:**
- Consomme : le hook e2e corrigé (tâche 4), le formulaire BO (tâche 5), l'affichage (tâche 6).

C'est le seul test qui exerce le formulaire d'administration et le checkout ensemble, donc le seul qui prouve l'intégration réelle. Ses contraintes sont fortes et doivent être respectées à la lettre.

- [ ] **Step 1: Write the spec**

Le scénario : créer **via le formulaire BO** un produit à deux tailles, l'une à stock 1, l'autre illimitée — c'est ce passage par le formulaire qui teste l'intégration. Créer une commande `pending` par le hook e2e en passant `sizeLabel`. Vérifier que le checkout du même article est refusé **avant tout appel à Stripe**. Annuler la commande depuis le BO, puis vérifier que l'achat redevient possible. Vérifier qu'une sauvegarde de fiche ne touche pas le compteur.

**Ne pas poser de stock sur les produits du seed partagé** (`solana`, `lagune`, `rivage`) : les specs sont séquentielles sur une base commune et se contamineraient. Chaque spec crée son produit, avec un slug unique.

Les e2e tournent sur `build` + `start` : sans l'appel de revalidation de la tâche 8 dans le hook, aucune assertion d'affichage ne peut passer.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/16-stock.spec.ts`
Expected: PASS, et les 4 échecs e2e préexistants inchangés.

Lancer `npm run typecheck` **avant** tout run e2e : `next build` ignore les diagnostics des fichiers `*.spec.*`, mais pas ceux des helpers partagés.

## Ce que ce plan ne fait pas

- **Pas de limiteur par IP sur `startCheckout`, et finalement pas de pré-contrôle serveur non plus.** La revue de sécurité automatique a classé le déni d'inventaire non authentifié en HIGH, ce qui m'a fait ramener un plafond de `qty` dans le périmètre (tâche 7, étape 5). Les deux affirmations que j'ai écrites alors étaient fausses et sont corrigées ci-dessous et au retrait de l'étape 5, plus haut : le plafond ne réduit pas ce risque, et le pré-contrôle serveur n'achetait rien. Seul le plafond d'interface du panier est conservé, pour une raison d'usage.

  Le **limiteur** reste écarté, et c'est un arbitrage assumé, pas un oubli. `lib/rate-limit.ts` ne sait faire que du comptage **en mémoire, par instance serverless** : sur Vercel, un attaquant tombe mécaniquement sur plusieurs instances et le compteur ne converge jamais. Le cookie de réservation (tâche 7) s'ignore depuis un script. Une protection qui tienne demande un store partagé, donc une table, donc une migration — hors de cette phase. **Risque résiduel accepté et à remonter à l'utilisateur** : un script peut maintenir le catalogue limité à « épuisé » en réarmant toutes les 35 minutes, sans une seule vente. **Correction du 2026-10-25, établie à l'implémentation : le plafond de `qty` ne réduit PAS ce risque.** `reserveStock` refusait déjà un sur-achat avec le même message, transaction annulée et compteur intact ; le plafond ne fait qu'avancer ce refus avant l'ouverture de la transaction. Or l'attaque ne consiste pas à sur-acheter mais à multiplier des réservations **valides**, chacune demandant exactement ce qui est disponible — ce que le plafond autorise par construction. Le plafond d'interface reste utile pour une raison d'usage, pas de sécurité : le bouton `+` s'arrête et le visiteur voit la limite avant de soumettre. Le pré-contrôle serveur, lui, n'apportait rien du tout — voir le retrait de l'étape 5, plus haut. Les seules atténuations réelles restent `expires_at` à 35 minutes, qui borne la durée d'une retenue, et le cookie, contournable par un script.
- **Pas de balayage paresseux — mais ma justification initiale était fausse**, et l'implémenteur de la tâche 3 l'a démontée. J'avais écrit que le webhook `expired` rattrape les commandes fantômes. Il ne le fait pas sur un chemin : `abandonPendingOrder` appelé avec le verdict `no_session` agit sur une commande à laquelle **aucune session Stripe n'a jamais été attachée**, donc aucun `checkout.session.expired` ne viendra jamais. Si le crédit échoue dans cette transaction, elle revient à `pending` avec le stock retenu, et **rien ne réessaiera**. Même état final si Stripe épuise ses tentatives après un 500.

  La fenêtre est étroite — il faut une erreur de base pendant la libération — mais l'état est permanent et silencieux, ce qui est exactement l'anti-objectif n°2. **Mitigation retenue plutôt que le balayage** : sur ce chemin, journaliser bruyamment avec l'id de commande et les clés retenues, pour qu'un humain puisse recréditer à la main. Le balayage reste hors périmètre parce qu'il ouvre le piège « annuler une commande dont la session est encore payable », que la phase 0 a fermé au prix fort.
- **Pas de surface `/admin` pour `paid_on_cancelled`.** Aucun verdict de `reconcilePaidSession` n'écrit le stock ; ce cas reste à résolution humaine par l'alerte e-mail.
- **Pas de remboursement Stripe.** Non-objectif de la spec, inchangé.
- **Pas de correction de l'inversion d'ordre de verrous** `updateOrderStatus` / `setItemPreparedQty` (40P01), préexistante et désormais observée : à reprendre si elle se manifeste.
