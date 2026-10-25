# Phase 0 — Cycle de vie des commandes : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer les quatre défauts du cycle de vie des commandes qui peuvent aujourd'hui écraser un paiement, encaisser sans livrer, ou laisser une commande fantôme — sans introduire de stock.

**Architecture:** Une primitive de compare-and-set (`setOrderStatusIfUnchanged`, filtrée par `orderId`) couvre les chemins qui connaissent la commande, de sorte qu'aucun ne peut écraser une transition concurrente. Les chemins indexés par session Stripe (`markOrderPaidBySession`, `cancelOrderBySession`) gardent leurs `UPDATE` en ligne avec leur propre prédicat `status = 'pending'` : la règle commune est qu'aucune écriture de `orders.status` ne se fait sans prédicat sur le statut attendu, pas qu'elles passent toutes par la même fonction. Un garde Stripe (`expireSessionForCancel`) impose la règle « expirer avant d'annuler » et classe les cas où l'annulation doit être refusée. Une fonction de réconciliation (`reconcilePaidSession`) distingue un simple rejeu de webhook d'un paiement encaissé sur une commande annulée, et fait remonter ce dernier au lieu de l'avaler.

**Tech Stack:** Next.js 16.2.9 (Server Actions, Route Handlers), Drizzle ORM 0.45.2, Postgres (pooler Supabase, `prepare: false`) et PGlite en tests, Stripe 22.2.0, Vitest 4, Playwright, Resend.

**Spec:** `docs/superpowers/specs/2026-10-24-stock-limite-bouquets-design.md` (section « Phase 0 »)

## Global Constraints

- **Aucun commentaire dans le code livré.** Ni en-tête de fichier, ni JSDoc, ni note inline. Les commentaires déjà présents dans les fichiers modifiés ne sont pas touchés. Exception : directives fonctionnelles (`eslint-disable`, `ts-expect-error`).
- **Aucun commit.** Ce plan ne contient volontairement aucune étape de commit : seul l'utilisateur décide quand committer. Ne pas committer sans demande explicite de sa part, même en fin de tâche. **Cette contrainte doit être répétée dans le brief de chaque implémenteur** : le flux par sous-agents suppose normalement un commit par tâche, et un sous-agent qui ne lit que sa tâche ne verra pas cette ligne.
- **Next.js 16.2.9 n'est pas celui des données d'entraînement.** Lire `node_modules/next/dist/docs/` avant d'utiliser une API Next non déjà présente dans le dépôt.
- Textes destinés aux utilisateurs et à Céline : **en français**.
- Lancer les tests avec `npx vitest run <fichier>` pour une tâche, `npm test` pour l'ensemble.
- **Base de référence à figer avant de commencer :** environ 11 tests unitaires et 3 e2e échouent déjà sur `HEAD` (`SEED_PRODUCTS` incomplet). Lancer `npm test -- --no-file-parallelism` et enregistrer la liste exacte des échecs avant la première modification. **Utiliser cette même commande pour la comparaison finale** : en parallèle, les tests partagent une PGlite mémoire et les compteurs d'échecs ne se correspondent pas d'une exécution à l'autre. **Ne pas toucher à `lib/db/seed-data.ts`** pour les faire passer.
- **PGlite est mono-connexion.** Aucun test ne doit prétendre prouver un comportement sous concurrence réelle. Les tests prouvent la *logique* du garde (le prédicat refuse quand la valeur attendue ne correspond plus), pas le verrouillage.
- `lib/orders.ts` n'importe pas Stripe et ne doit pas commencer à le faire : le garde Stripe vit dans son propre module.
- `revalidatePath` n'est appelable que depuis une Server Action ou un Route Handler, jamais depuis le rendu d'une page — donc jamais depuis `lib/orders.ts`, qui est appelé pendant le rendu de `app/commande/confirmee/page.tsx`.

## Review Focus

Cinq cas que la spec implique et qu'aucune tâche n'exercerait spontanément. Chacun a son test rattaché à la tâche qui possède le code.

1. **`sessions.expire()` échoue parce que la session n'est plus `open`.** Attendu : un `retrieve` décide — payée → ne pas annuler, paiement asynchrone en cours → ne pas annuler. (Tâche 2, étape 1.)
2. **Stripe est injoignable au moment d'annuler depuis le BO.** Attendu : l'annulation est refusée avec un message, jamais appliquée « dans le doute ». (Tâche 2, étape 1 et Tâche 5, étape 1.)
3. **`metadata.orderId` absent ou malformé dans l'événement `expired`.** Attendu : aucune requête cassée, aucune commande annulée au hasard. (Tâche 3, étape 1.)
4. **Rejeu du même événement webhook sur une commande déjà annulée-mais-payée.** Attendu : le verdict est stable et aucune écriture supplémentaire n'a lieu. L'alerte e-mail, elle, est assumée « au moins une fois » : un doublon d'alerte vers la boutique est préférable à un silence. (Tâche 4, étape 1.)
5. **La compensation de `startCheckout` échoue à son tour** (Stripe KO *et* base KO). Attendu : l'acheteur voit un message d'erreur exploitable, pas une exception non capturée. (Tâche 6, étape 1.)

---

### Task 1: Primitive de compare-and-set sur `orders.status` (P0-1)

**Files:**
- Modify: `lib/orders.ts` (ajout de `OrderStatusConflictError` et `setOrderStatusIfUnchanged` ; réécriture de `updateOrderStatus:413-453`)
- Test: `tests/unit/orders.test.ts`

**Interfaces:**
- Consomme : rien.
- Produit :
  ```ts
  export class OrderStatusConflictError extends Error {}

  export async function setOrderStatusIfUnchanged(
    db: Db | Tx,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    extra?: Partial<Pick<OrderRow, "prepStatus" | "prepDoneAt" | "stripePaymentIntent" | "stripeSessionId">>,
  ): Promise<OrderRow | null>;
  ```
  Renvoie la ligne mise à jour, ou `null` si le statut ne valait plus `from`. `updateOrderStatus` garde sa signature actuelle et lève `OrderStatusConflictError` quand la primitive renvoie `null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("setOrderStatusIfUnchanged", () => {
  it("pose le statut quand la valeur attendue correspond encore", async () => {
    const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
    const updated = await setOrderStatusIfUnchanged(db, order.id, "pending", "paid");
    expect(updated?.status).toBe("paid");
  });

  it("renvoie null et n'écrit rien quand le statut a changé entre-temps", async () => {
    const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
    await setOrderStatusIfUnchanged(db, order.id, "pending", "paid");
    const second = await setOrderStatusIfUnchanged(db, order.id, "pending", "cancelled");
    expect(second).toBeNull();
    const after = await getOrderWithItems(db, order.id);
    expect(after?.order.status).toBe("paid");
  });
});

describe("updateOrderStatus (conflit de statut)", () => {
  it("lève OrderStatusConflictError si la commande a changé de statut sous la transition", async () => {
    const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
    await setOrderStatusIfUnchanged(db, order.id, "pending", "paid");
    await expect(updateOrderStatus(staleStatusDb(db, order.id, "pending"), order.id, "cancelled"))
      .rejects.toThrow(OrderStatusConflictError);
  });
});
```

Helpers locaux au fichier de test, à écrire dans la tâche : `staleStatusDb` (ci-dessous). Les tests de `tests/unit/orders.test.ts` réutilisent la fixture `camille:29-33` et le `db` posé par le `beforeEach:36-38` — ne pas rappeler `createTestDb()` dans chaque test.

`staleStatusDb` est un helper local au fichier de test : un `Proxy` sur `Db` qui intercepte `transaction` et fournit un `tx` dont le `select(...).for("update")` renvoie une ligne dont `status` est forcé à la valeur passée, et qui délègue tout le reste au vrai `tx`. C'est le seul moyen de prouver le prédicat sur une base mono-connexion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/orders.test.ts -t "setOrderStatusIfUnchanged"`
Expected: FAIL — `setOrderStatusIfUnchanged is not a function`.

- [ ] **Step 3: Implement `setOrderStatusIfUnchanged` in `lib/orders.ts`**

Un seul `UPDATE` : `.set({ status: to, ...extra })`, `.where(and(eq(orders.id, orderId), eq(orders.status, from)))`, `.returning()`, puis `rows[0] ?? null`.

- [ ] **Step 4: Rewrite `updateOrderStatus` to read inside the transaction**

Tout le corps passe dans `db.transaction`. La lecture devient
`tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1)`
(`for` est supporté : `node_modules/drizzle-orm/pg-core/query-builders/select.d.ts:586`). `canTransition` reste évalué sur cette lecture. L'écriture passe par `setOrderStatusIfUnchanged(tx, orderId, order.status, to, extra)` où `extra` porte `prepStatus`/`prepDoneAt` dans le cas `finishesPrep` existant. `null` → `throw new OrderStatusConflictError("La commande a changé de statut, rechargez la page.")`. La mise à jour de `orderItems.preparedQty` reste dans la même transaction, après l'écriture.

- [ ] **Step 5: Run the full orders suite**

Run: `npx vitest run tests/unit/orders.test.ts`
Expected: PASS — y compris les tests de machine d'états existants (`216-350`), inchangés.

---

### Task 2: Garde Stripe « expirer avant d'annuler » (P0-2)

**Files:**
- Create: `lib/stripe-session.ts`
- Test: `tests/unit/stripe-session.test.ts`

**Interfaces:**
- Consomme : `getStripe()` de `lib/stripe.ts`.
- Produit :
  ```ts
  export type SessionGuard =
    | { outcome: "no_session" }
    | { outcome: "expired" }
    | { outcome: "already_paid"; paymentIntent: string | null }
    | { outcome: "awaiting_async" }
    | { outcome: "unreachable" };

  export async function expireSessionForCancel(
    stripeSessionId: string | null,
  ): Promise<SessionGuard>;
  ```
  Seuls `no_session` et `expired` autorisent une annulation. `already_paid`, `awaiting_async` et `unreachable` l'interdisent.

- [ ] **Step 1: Write the failing tests**

```ts
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripeMock }));

it("renvoie no_session quand la commande n'a pas de session", async () => {
  expect(await expireSessionForCancel(null)).toEqual({ outcome: "no_session" });
});

it("renvoie expired quand expire() réussit", async () => {
  stripeMock.checkout.sessions.expire.mockResolvedValue({ status: "expired" });
  expect(await expireSessionForCancel("cs_1")).toEqual({ outcome: "expired" });
});

it("renvoie already_paid quand expire() échoue et que la session est payée", async () => {
  stripeMock.checkout.sessions.expire.mockRejectedValue(new Error("not open"));
  stripeMock.checkout.sessions.retrieve.mockResolvedValue({
    status: "complete", payment_status: "paid", payment_intent: "pi_9",
  });
  expect(await expireSessionForCancel("cs_2")).toEqual({
    outcome: "already_paid", paymentIntent: "pi_9",
  });
});

it("renvoie awaiting_async pour une session complete mais unpaid", async () => { /* ... */ });

it("renvoie expired quand expire() échoue mais que la session est déjà expirée", async () => { /* retrieve -> status: "expired" */ });

it("renvoie unreachable quand expire() échoue et que la session est encore open", async () => {
  stripeMock.checkout.sessions.expire.mockRejectedValue(new Error("permission"));
  stripeMock.checkout.sessions.retrieve.mockResolvedValue({ status: "open", payment_status: "unpaid" });
  expect(await expireSessionForCancel("cs_4")).toEqual({ outcome: "unreachable" });
});

it("renvoie unreachable quand expire() et retrieve() échouent tous les deux", async () => {
  stripeMock.checkout.sessions.expire.mockRejectedValue(new Error("network"));
  stripeMock.checkout.sessions.retrieve.mockRejectedValue(new Error("network"));
  expect(await expireSessionForCancel("cs_3")).toEqual({ outcome: "unreachable" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stripe-session.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implement `expireSessionForCancel` in `lib/stripe-session.ts`**

`null` → `no_session`. Sinon `expire()` ; succès → `expired`. En cas d'échec, `retrieve()` et classer : `status === "expired"` → `expired` ; `complete` + `payment_status === "paid"` → `already_paid` avec le `payment_intent` normalisé en `string | null` ; `complete` + autre → `awaiting_async` ; `retrieve` qui lève → `unreachable`.

**`open` après un `expire()` échoué vaut `unreachable`, pas `awaiting_async`.** Si la session était réellement encore ouverte, `expire()` aurait réussi : la retrouver `open` veut dire que l'appel lui-même a échoué (réseau, ou permission manquante). Classer ce cas en « paiement en cours » ferait lire à Céline une information fausse. **À vérifier avant de livrer :** la clé restreinte `rk_` utilisée par `getStripe()` (`lib/stripe.ts:9-10`) doit avoir le droit d'écriture sur les Checkout Sessions, sinon `expire()` échouera toujours et toute annulation d'une commande `pending` serait refusée indéfiniment.

Aucun `console.error` ici : l'appelant décide quoi journaliser.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/stripe-session.test.ts`
Expected: PASS

---

### Task 3: `cancelOrderBySession` retrouve la commande par `metadata.orderId`

**Files:**
- Modify: `lib/orders.ts:311-325` (`cancelOrderBySession`)
- Modify: `app/api/stripe/webhook/route.ts` (branche `checkout.session.expired`)
- Test: `tests/unit/orders.test.ts`, `tests/unit/webhook.test.ts`

**Interfaces:**
- Consomme : rien de la tâche 1 — `setOrderStatusIfUnchanged` filtre par `orderId` et ne peut donc exprimer ni la recherche par session, ni la réparation `isNull(stripeSessionId)`.
- Produit :
  ```ts
  export async function cancelOrderBySession(
    db: Db,
    stripeSessionId: string,
    fallbackOrderId?: string | null,
  ): Promise<OrderRow | null>;
  ```
  Renvoie la ligne annulée, ou `null` si aucune commande `pending` ne correspond. Symétrique de `markOrderPaidBySession`.

- [ ] **Step 1: Write the failing tests**

```ts
it("annule par metadata.orderId quand attachStripeSession a raté", async () => {
  const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
  const cancelled = await cancelOrderBySession(db, "cs_never_attached", order.id);
  expect(cancelled?.id).toBe(order.id);
  expect(cancelled?.stripeSessionId).toBe("cs_never_attached");
});

it("ignore un fallbackOrderId malformé sans casser la requête", async () => {
  await expect(cancelOrderBySession(db, "cs_x", "pas-un-uuid")).resolves.toBeNull();
});

it("n'annule pas par fallback une commande qui a déjà une autre session", async () => {
  const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
  await attachStripeSession(db, order.id, "cs_real");
  await expect(cancelOrderBySession(db, "cs_autre", order.id)).resolves.toBeNull();
});
```

Et dans `tests/unit/webhook.test.ts`, à côté du test existant (`141-160`) : un événement `checkout.session.expired` dont `data.object.metadata.orderId` porte l'id, sur une commande à laquelle aucune session n'a été attachée, doit la faire passer en `cancelled`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/orders.test.ts -t "metadata.orderId"`
Expected: FAIL — la commande reste `pending`.

- [ ] **Step 3: Implement the fallback in `cancelOrderBySession`**

Deux `UPDATE` en ligne, calqués sur `markOrderPaidBySession:272-309`, pas la primitive de la tâche 1. D'abord `and(eq(orders.stripeSessionId, stripeSessionId), eq(orders.status, "pending"))` avec `.returning()` ; si rien ne revient, garde `isUuid(fallbackOrderId)`, puis réparation avec `and(eq(orders.id, fallbackOrderId), eq(orders.status, "pending"), isNull(orders.stripeSessionId))` en posant `stripeSessionId` au passage. Les deux portent leur prédicat de statut, ce qui suffit à l'idempotence.

- [ ] **Step 4: Pass `metadata.orderId` from the webhook**

Dans `app/api/stripe/webhook/route.ts`, la branche `checkout.session.expired` / `async_payment_failed` transmet `event.data.object.metadata?.orderId` en troisième argument.

- [ ] **Step 5: Run both suites**

Run: `npx vitest run tests/unit/orders.test.ts tests/unit/webhook.test.ts`
Expected: PASS

---

### Task 4: Un paiement sur commande annulée ne doit plus être avalé (P0-3)

**Files:**
- Modify: `lib/orders.ts` (ajout de `reconcilePaidSession`)
- Modify: `lib/email/notify-order.ts` (ajout de `alertPaidOnCancelledOrder`)
- Create: `lib/orders/paid-side-effects.ts` (`applyPaidSideEffects`)
- Modify: `app/api/stripe/webhook/route.ts:47-66`
- Modify: `app/commande/confirmee/page.tsx:40-70` et `83-106`
- Modify: `components/views/confirmation-view.tsx:26-38` (type `ConfirmationState`)
- Modify: `lib/content/pages/confirmation.ts` (nouvelle section)
- Test: `tests/unit/orders.test.ts`, `tests/unit/webhook.test.ts`, `tests/unit/content-confirmation.test.tsx`

**Interfaces:**
- Consomme : `markOrderPaidBySession` (existant).
- Produit :
  ```ts
  export type PaidReconciliation =
    | { outcome: "paid"; order: OrderRow }
    | { outcome: "replay"; order: OrderRow }
    | { outcome: "paid_on_cancelled"; order: OrderRow }
    | { outcome: "unknown" };

  export async function reconcilePaidSession(
    db: Db,
    stripeSessionId: string,
    stripePaymentIntent?: string | null,
    fallbackOrderId?: string | null,
  ): Promise<PaidReconciliation>;

  export async function alertPaidOnCancelledOrder(order: OrderRow): Promise<void>;

  // lib/orders/paid-side-effects.ts
  export async function applyPaidSideEffects(db: Db, orderId: string): Promise<void>;
  ```
  `ConfirmationState` gagne `| { kind: "needsReview"; number: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("distingue un rejeu d'un paiement encaissé sur commande annulée", async () => {
  const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
  await attachStripeSession(db, order.id, "cs_r1");

  const first = await reconcilePaidSession(db, "cs_r1", "pi_1");
  expect(first.outcome).toBe("paid");
  const replay = await reconcilePaidSession(db, "cs_r1", "pi_1");
  expect(replay.outcome).toBe("replay");
});

it("signale paid_on_cancelled et laisse la commande annulée intacte", async () => {
  const { order } = await createPendingOrder(db, camille, [{ slug: "rivage", qty: 1 }]);
  await attachStripeSession(db, order.id, "cs_r2");
  await cancelOrderBySession(db, "cs_r2");

  const verdict = await reconcilePaidSession(db, "cs_r2", "pi_2");
  expect(verdict.outcome).toBe("paid_on_cancelled");

  const again = await reconcilePaidSession(db, "cs_r2", "pi_2");
  expect(again.outcome).toBe("paid_on_cancelled");
  const after = await getOrderWithItems(db, order.id);
  expect(after?.order.status).toBe("cancelled");
  expect(after?.order.stripePaymentIntent).toBeNull();
});

it("renvoie unknown pour une session inconnue", async () => { /* ... */ });
```

Et dans `tests/unit/webhook.test.ts` : un `checkout.session.completed` sur une commande déjà `cancelled` répond 200, laisse le statut à `cancelled`, et journalise (espionner `console.error`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/orders.test.ts -t "paid_on_cancelled"`
Expected: FAIL — `reconcilePaidSession is not a function`.

- [ ] **Step 3: Implement `reconcilePaidSession` in `lib/orders.ts`**

Appeler `markOrderPaidBySession` ; une ligne renvoyée → `{ outcome: "paid" }`. Sinon relire la commande par session, puis par `fallbackOrderId` si `isUuid`. Statut dans `["paid", "preparing", "shipped", "picked_up"]` → `replay` ; `cancelled` → `paid_on_cancelled` ; rien trouvé → `unknown`. **Aucune écriture dans la branche `paid_on_cancelled`** : la décision revient à un humain.

- [ ] **Step 4: Implement `alertPaidOnCancelledOrder` in `lib/email/notify-order.ts`**

Sur le modèle de `notifyOrderPaid:22`, via `getMailer()` : destinataire la boutique (`CONTACT_TO`, copie `CONTACT_BCC` comme les autres envois), objet `Commande annulée mais payée — <numéro>`, corps en texte brut donnant le numéro, l'e-mail du client, le total et la consigne de vérifier dans Stripe. `getMailer()` nul → ne rien faire. Alerte « au moins une fois » assumée : aucun garde-fou d'unicité (voir Review Focus 4).

- [ ] **Step 5: Wire the webhook and the confirmation page**

D'abord extraire les effets de bord du paiement, aujourd'hui dupliqués dans `app/api/stripe/webhook/route.ts:54-66` et `app/commande/confirmee/page.tsx:51-64`, dans `applyPaidSideEffects(db, orderId)` : `ensureRelayShipment` puis `notifyOrderPaid`, chacun dans son `try/catch` avec les messages de journal existants.

Dans le webhook, remplacer `markOrderPaidBySession` par `reconcilePaidSession` : `paid` → `applyPaidSideEffects` ; `replay` → rien ; `paid_on_cancelled` → `console.error` puis `alertPaidOnCancelledOrder` dans un `try/catch` ; `unknown` → `console.error`. La réponse reste 200 dans tous les cas.

Dans `app/commande/confirmee/page.tsx`, même remplacement et même appel à `applyPaidSideEffects` sur `paid`. Le calcul de `state:83-106` gagne une branche : `paid_on_cancelled` → `{ kind: "needsReview", number }`, placée **avant** le repli `pending` pour qu'un client débité ne lise plus « en attente de paiement ».

**La page de confirmation n'envoie jamais `alertPaidOnCancelledOrder`.** Elle est rendue à chaque rafraîchissement du navigateur : l'alerte y partirait en boucle. Seul le webhook alerte.

- [ ] **Step 6: Add the `needsReview` section to the confirmation content**

Dans `lib/content/pages/confirmation.ts`, ajouter une section `needsReview` calquée sur `pending:21-25` (`title`, `script`, plus un `body`), avec pour défauts : titre « Votre paiement nous est bien parvenu », et un corps disant que la commande demande une vérification manuelle, que l'atelier revient vers le client sous 24 h, et rappelant le numéro de commande. Rendre la section dans `confirmation-view.tsx` sur le modèle du cas `pending`.

- [ ] **Step 7: Run the suites**

Run: `npx vitest run tests/unit/orders.test.ts tests/unit/webhook.test.ts tests/unit/content-confirmation.test.tsx`
Expected: PASS

---

### Task 5: L'annulation depuis le back-office expire la session d'abord (P0-2, câblage)

**Files:**
- Modify: `app/(admin)/admin/(panel)/commandes/actions.ts:24-43` (`changeOrderStatus`)
- Test: `tests/unit/admin-order-cancel.test.ts` (créer)

**Interfaces:**
- Consomme : `expireSessionForCancel` (Tâche 2), `updateOrderStatus` et `OrderStatusConflictError` (Tâche 1), `reconcilePaidSession` **et `applyPaidSideEffects`** (Tâche 4), `getOrderWithItems` (existant).
- Produit : `changeOrderStatus` garde sa signature `(orderId: string, to: string) => Promise<StatusActionState>`.

- [ ] **Step 1: Write the failing tests**

**`changeOrderStatus` appelle `getDb()` en interne.** Le test doit donc travailler sur la *même* base : en-tête `// @vitest-environment node`, `expect(process.env.PGLITE_DATA_DIR).toBe(":memory:")` et `getDb()` partagé, comme `tests/unit/webhook.test.ts:1-2,56-59`. Un `createTestDb()` séparé rendrait les assertions vraies sans rien prouver. Chaque test crée sa commande avec une adresse e-mail unique et vérifie **cette** commande par son id, jamais un comptage global. `revalidatePath` lève hors du runtime Next : mocker `next/cache` comme `tests/unit/sync-children.test.ts:12`.

```ts
// @vitest-environment node
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ verifySession: vi.fn() }));
vi.mock("@/lib/stripe-session", () => ({ expireSessionForCancel: vi.fn() }));

it("refuse l'annulation et marque payé quand la session est déjà payée", async () => {
  // commande pending avec session ; expireSessionForCancel -> already_paid
  const res = await changeOrderStatus(order.id, "cancelled");
  expect(res?.error).toMatch(/déjà été payée/);
  const after = await getOrderWithItems(await getDb(), order.id);
  expect(after?.order.status).toBe("paid");
});

it("envoie les effets de bord du paiement quand la session était déjà payée", async () => {
  // already_paid -> reconcile renvoie paid -> applyPaidSideEffects appelé une fois
  await changeOrderStatus(order.id, "cancelled");
  expect(applyPaidSideEffectsMock).toHaveBeenCalledWith(expect.anything(), order.id);
});

it("refuse l'annulation quand Stripe est injoignable", async () => {
  const res = await changeOrderStatus(order.id, "cancelled");
  expect(res?.error).toMatch(/Stripe/);
  expect((await getOrderWithItems(await getDb(), order.id))?.order.status).toBe("pending");
});

it("refuse l'annulation pendant un paiement asynchrone", async () => { /* awaiting_async */ });

it("annule quand la session a bien été expirée", async () => { /* expired -> cancelled */ });

it("n'appelle pas Stripe pour annuler depuis paid ou preparing", async () => {
  // le garde ne concerne que les commandes pending
  expect(expireSessionForCancel).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/admin-order-cancel.test.ts`
Expected: FAIL — aucun appel à `expireSessionForCancel`.

- [ ] **Step 3: Add the guard to `changeOrderStatus`**

Après la validation zod et avant `updateOrderStatus` : si `to === "cancelled"`, charger la commande ; si son statut est `pending`, appeler `expireSessionForCancel(order.stripeSessionId)`. Correspondances : `expired` et `no_session` → continuer ; `already_paid` → appeler `reconcilePaidSession` et, **si son verdict est `paid`, appeler `applyPaidSideEffects`** avant de renvoyer `{ error: "Cette commande a déjà été payée chez Stripe ; elle a été passée en « Payée » au lieu d'être annulée." }`. Sans cet appel, le webhook arrivant ensuite ne verrait qu'un `replay` et le client ne recevrait jamais son e-mail de confirmation — c'est la troisième et dernière voie qui marque une commande payée ; `awaiting_async` → `{ error: "Un paiement est en cours sur cette commande. Réessayez plus tard." }` ; `unreachable` → `{ error: "Stripe est injoignable : l'annulation n'a pas été appliquée." }`. Les commandes `paid` et `preparing` ne passent pas par le garde. Attraper `OrderStatusConflictError` dans le `catch:36-38` existant, qui renvoie déjà `err.message`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/admin-order-cancel.test.ts`
Expected: PASS

---

### Task 6: `startCheckout` compense sur ses trois sorties (P0-4)

**Files:**
- Create: `lib/checkout/abandon.ts`
- Modify: `app/checkout/actions.ts:49-120`
- Test: `tests/unit/start-checkout.test.ts` (créer)

**Interfaces:**
- Consomme : `expireSessionForCancel` (Tâche 2), `setOrderStatusIfUnchanged` (Tâche 1).
- Produit :
  ```ts
  export async function abandonPendingOrder(db: Db, orderId: string): Promise<void>;
  ```
  Idempotente et silencieuse. N'échoue jamais vers l'appelant — toute erreur est journalisée. **N'annule que si le garde Stripe le permet** : `no_session` ou `expired` → annulation ; `unreachable`, `already_paid` et `awaiting_async` → la commande reste `pending` et sera reprise plus tard par le webhook `expired` via le repli de la tâche 3. Annuler sans cette condition recréerait exactement le défaut P0-3 que cette phase supprime.

- [ ] **Step 1: Write the failing tests**

Helpers locaux au fichier de test : `formDataFor(email)` construit le `FormData` attendu par `startCheckout` (champs de `app/checkout/schema.ts` plus `items` en JSON) avec l'adresse donnée ; `statusOfOrderFor(email)` retrouve l'unique commande de cette adresse via `getDb()` et renvoie son `status`, ou `undefined` si aucune.

**Même contrainte que la tâche 5** : `startCheckout` appelle `getDb()` en interne, donc en-tête `// @vitest-environment node` et `getDb()` partagé. Les assertions portent sur la commande créée par le test, retrouvée par son id, avec une adresse e-mail unique par test.

```ts
// @vitest-environment node
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripeMock, getSiteUrl: () => "http://x" }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

it("annule la commande quand sessions.create lève", async () => {
  stripeMock.checkout.sessions.create.mockRejectedValue(new Error("stripe down"));
  const res = await startCheckout(undefined, formDataFor("a@exemple.fr"));
  expect(res?.error).toBeTruthy();
  expect(await statusOfOrderFor("a@exemple.fr")).toBe("cancelled");
});

it("annule la commande quand Stripe ne renvoie pas d'URL", async () => {
  stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: null });
  const res = await startCheckout(undefined, formDataFor("b@exemple.fr"));
  expect(res?.error).toMatch(/URL de paiement/);
  expect(await statusOfOrderFor("b@exemple.fr")).toBe("cancelled");
});

it("annule la commande quand attachStripeSession lève", async () => { /* même forme, e-mail unique */ });

it("renvoie une erreur exploitable même si la compensation échoue", async () => {
  // sessions.create lève ET expireSessionForCancel lève
  const res = await startCheckout(undefined, formDataFor("e@exemple.fr"));
  expect(res?.error).toBeTruthy();
});

it("ne compense pas quand le panier est refusé avant toute commande", async () => {
  // CheckoutError de createPendingOrder : aucune commande n'existe pour cet e-mail
  expect(await statusOfOrderFor("c@exemple.fr")).toBeUndefined();
});

it("laisse la commande pending quand Stripe est injoignable à la compensation", async () => {
  // sessions.create lève, puis expireSessionForCancel -> unreachable
  const res = await startCheckout(undefined, formDataFor("d@exemple.fr"));
  expect(res?.error).toBeTruthy();
  expect(await statusOfOrderFor("d@exemple.fr")).toBe("pending");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/start-checkout.test.ts`
Expected: FAIL — les commandes restent `pending`.

- [ ] **Step 3: Implement `abandonPendingOrder` in `lib/checkout/abandon.ts`**

Relire la commande ; statut différent de `pending` → sortir. Sinon `expireSessionForCancel(order.stripeSessionId)` : sur `no_session` ou `expired`, `setOrderStatusIfUnchanged(db, orderId, "pending", "cancelled")` ; sur les trois autres verdicts, journaliser et laisser la commande `pending`. Le tout dans un `try/catch` qui journalise avec `console.error("[checkout] compensation impossible", err)` et ne relance pas.

- [ ] **Step 4: Compensate on all three exits of `startCheckout`**

Garder l'`order` créé dans une variable visible du `catch`. Appeler `abandonPendingOrder` sur les trois sorties : `!session.url` (qui `return` sans passer par le `catch` — c'est le défaut à corriger), échec d'`attachStripeSession`, et le `catch` final **à condition que l'ordre existe** (une `CheckoutError` est levée avant toute insertion, donc rien à compenser).

**Ne pas toucher à `expires_at`** : voir « Ce que ce plan ne fait pas ».

**Laisser `redirect(checkoutUrl)` en dehors du `try`** : `redirect()` lève une erreur de contrôle de flux que le `catch` prendrait pour un échec et compenserait une commande légitime.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/start-checkout.test.ts`
Expected: PASS

- [ ] **Step 6: Run the whole suite against the frozen baseline**

Run: `npm test -- --no-file-parallelism`
Expected: aucun échec au-delà de la liste figée au départ, avec la même commande.

Run: `npm run typecheck` puis `rtk lint`
Expected: PASS. Écrire `rtk lint`, **jamais `npx rtk lint`** : rtk est un binaire local, et `npx` irait télécharger le paquet npm qui porte ce nom.

---

## Ce que ce plan ne fait pas

- Aucune migration, aucune colonne, aucun stock.
- **Pas d'`expires_at` sur la session Stripe.** C'est le correctif (c) de la spec, qui
  n'existe qu'à cause du stock : il borne la durée pendant laquelle un panier abandonné
  retient un bouquet. Sans stock, réduire la fenêtre de 24 h à 35 min ne protège rien et
  constitue une régression — un client lent sur son 3-D Secure perdrait sa session. Part
  avec la phase stock.
- **Pas de balayage paresseux.** Même raison : il sert à récupérer un stock retenu par une
  commande fantôme. Sans stock, une commande `pending` oubliée est une ligne inerte. La
  tâche 6 la compense quand elle peut, le webhook `expired` la rattrape sinon.
- **Pas de limiteur sur `startCheckout`.** La spec le mentionne en fin de section phase 0,
  mais la menace qu'elle décrit est l'accaparement d'inventaire, qui n'existe pas sans
  stock. Sans compteur, l'abus se réduit à créer des commandes `pending` et des sessions
  Stripe en volume : nuisance, pas perte. Le limiteur, le plafond de `qty` et le cookie de
  réservation unique partent avec la phase stock, où ils protègent quelque chose.
- Le hook e2e (`app/api/e2e/orders/route.ts`) continue d'écrire `status` directement : sans stock, il ne contourne aucune libération. À reprendre avec la phase stock.
- Les deux vérifications hors code restent à faire par l'utilisatrice : abonnement du webhook de prod à `checkout.session.expired` et `checkout.session.async_payment_failed`, et présence de moyens de paiement asynchrones dans le Dashboard.
