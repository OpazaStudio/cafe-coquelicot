# Kanban de préparation des commandes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kanban d'organisation de la préparation dans l'admin (`/admin/commandes`), dimension séparée des statuts commande/paiement, avec retrait des cartes « Terminée » après 48h (filtre à la lecture).

**Architecture:** Nouvelle colonne `prep_status` (`todo`/`in_progress`/`done`) + `prep_done_at` sur `orders` ; module pur `lib/prep-status.ts` (libellés, fenêtre 48h) ; fonctions `setPrepStatus`/`listBoardOrders` dans `lib/orders.ts` ; board client (DnD HTML5 natif + boutons) branché sur une server action ; bascule kanban/table via `?vue=tableau`. Spec : `docs/superpowers/specs/2026-06-11-kanban-commandes-design.md`.

**Tech Stack:** Next.js 16 (App Router, server actions, `PageProps` typés, `searchParams` est une **Promise**), Drizzle ORM + PGlite, Zod v4 (`z.uuid()`, `z.iso.datetime()`), vitest + PGlite en mémoire, Playwright (e2e séquentiels contre un build de prod, base `.data/pglite-e2e`).

**Conventions du repo (à respecter) :**
- Tout texte UI et tous les commentaires en **français**.
- Les écritures commandes passent par `lib/orders.ts` ; les server actions suivent le gabarit de `app/(admin)/admin/(panel)/commandes/actions.ts` (Zod → `verifySession` → `getDb` → lib → `revalidatePath`).
- Tests unitaires : `// @vitest-environment node` + `createTestDb()` (PGlite mémoire, migrations réelles, produits seedés — slugs `rivage` 4800c, `estran` 2200c, `gabut` 3800c).
- PGlite est mono-processus : les e2e ne peuvent PAS écrire la base pendant que le serveur tourne → seed via une route API de test gardée par env var.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `lib/db/schema.ts` (modif) | enum `prep_status`, colonnes `prepStatus`/`prepDoneAt`, type `PrepStatus` |
| `lib/db/migrations/0002_prep_status.sql` (généré + édité) | DDL + backfill des commandes terminées existantes |
| `lib/prep-status.ts` (créé) | domaine pur : libellés, ordre colonnes, fenêtre 48h, `isOnBoard` |
| `lib/orders.ts` (modif) | `setPrepStatus`, `listBoardOrders`, couplage dans `updateOrderStatus` |
| `app/(admin)/admin/(panel)/commandes/actions.ts` (modif) | action `changePrepStatus` |
| `app/(admin)/admin/(panel)/commandes/orders-table.tsx` (créé) | table extraite de `page.tsx`, inchangée fonctionnellement |
| `app/(admin)/admin/(panel)/commandes/kanban-board.tsx` (créé) | board client : colonnes, cartes, DnD, boutons |
| `app/(admin)/admin/(panel)/commandes/page.tsx` (réécrit) | switch `?vue=tableau` ↔ kanban (défaut) |
| `app/api/e2e/orders/route.ts` (créé) | hooks de seed e2e, 404 sauf si `E2E_TEST_HOOKS=1` |
| `playwright.config.ts` (modif) | `E2E_TEST_HOOKS: "1"` dans `webServer.env` |
| `tests/unit/prep-status.test.ts` (créé) | tests du module pur |
| `tests/unit/orders.test.ts` (modif) | tests DB : setPrepStatus, listBoardOrders, couplage |
| `tests/e2e/05-checkout.spec.ts` (modif) | `goto("/admin/commandes?vue=tableau")` (le kanban devient la vue par défaut) |
| `tests/e2e/06-admin-kanban.spec.ts` (créé) | parcours kanban complet |

---

### Task 0: État de départ propre + branche

La branche courante `feat/envoi-postal` porte des modifications non committées qui appartiennent au chantier postal (`playwright.config.ts`, `tests/e2e/05-checkout.spec.ts`) et de l'outillage (`CLAUDE.md`). On les committe séparément AVANT le kanban pour ne jamais les mélanger aux commits de cette feature.

- [ ] **Step 1: Committer les reliquats du chantier postal**

```bash
git add playwright.config.ts tests/e2e/05-checkout.spec.ts
git commit -m "test(e2e): fiabilisation checkout Stripe + env webServer"
```

- [ ] **Step 2: Committer le CLAUDE.md généré (codesight)**

```bash
git add CLAUDE.md
git commit -m "docs: contexte codesight dans CLAUDE.md"
```

- [ ] **Step 3: Créer la branche de la feature**

```bash
git checkout -b feat/kanban-preparation
git status
```

Expected: `nothing to commit, working tree clean` (hors `.codesight/` non suivi, à laisser tel quel).

---

### Task 1: Schéma + migration `prep_status`

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0002_prep_status.sql` (via drizzle-kit puis édition)
- Test: `tests/unit/orders.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Dans `tests/unit/orders.test.ts`, ajouter en fin de fichier :

```ts
describe("statut de préparation (schéma)", () => {
  it("toute nouvelle commande démarre en attente, sans date de fin", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    expect(order.prepStatus).toBe("todo");
    expect(order.prepDoneAt).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/orders.test.ts -t "statut de préparation"`
Expected: FAIL — `expected undefined to be 'todo'` (la colonne n'existe pas encore).

- [ ] **Step 3: Modifier le schéma**

Dans `lib/db/schema.ts`, après la déclaration de `fulfillmentEnum` :

```ts
export const prepStatusEnum = pgEnum("prep_status", [
  "todo",
  "in_progress",
  "done",
]);
```

Dans la table `orders`, après `trackingNumber` :

```ts
  // Kanban de préparation (admin) — dimension séparée du statut commande.
  prepStatus: prepStatusEnum("prep_status").notNull().default("todo"),
  prepDoneAt: timestamp("prep_done_at", { withTimezone: true }),
```

En bas du fichier, avec les autres types dérivés :

```ts
export type PrepStatus = (typeof prepStatusEnum.enumValues)[number];
```

- [ ] **Step 4: Générer la migration**

Run: `npx drizzle-kit generate --name prep_status`
Expected: crée `lib/db/migrations/0002_prep_status.sql` + snapshot + entrée journal. Vérifier le contenu généré :

```sql
CREATE TYPE "public"."prep_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prep_status" "prep_status" DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prep_done_at" timestamp with time zone;
```

- [ ] **Step 5: Ajouter le backfill à la fin du fichier SQL généré**

Les commandes déjà expédiées/retirées ont une préparation finie ; on les date de leur création pour qu'elles soient masquées du board d'emblée (si > 48h). Ce backfill ne s'exerce que sur les bases existantes (dev/prod) — non testable avec `createTestDb` (migrations sur base vide) ; relire le SQL suffit.

```sql
--> statement-breakpoint
UPDATE "orders" SET "prep_status" = 'done', "prep_done_at" = "created_at"
WHERE "status" IN ('shipped', 'picked_up');
```

- [ ] **Step 6: Vérifier que le test passe**

Run: `npx vitest run tests/unit/orders.test.ts`
Expected: PASS (tous les tests, y compris « statut de préparation »).

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations tests/unit/orders.test.ts
git commit -m "feat(db): statut de préparation kanban sur les commandes"
```

---

### Task 2: Module pur `lib/prep-status.ts`

**Files:**
- Create: `lib/prep-status.ts`
- Test: `tests/unit/prep-status.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/unit/prep-status.test.ts` :

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DONE_RETENTION_MS,
  isOnBoard,
  isPrepStatus,
  PREP_LABELS,
  PREP_ORDER,
} from "@/lib/prep-status";

const now = new Date("2026-06-11T12:00:00Z");
const hours = (n: number) => n * 60 * 60 * 1000;

function order(over: Partial<Parameters<typeof isOnBoard>[0]> = {}) {
  return {
    status: "paid" as const,
    prepStatus: "todo" as const,
    prepDoneAt: null,
    ...over,
  };
}

describe("isOnBoard", () => {
  it("affiche les commandes payées en attente ou en cours", () => {
    expect(isOnBoard(order(), now)).toBe(true);
    expect(
      isOnBoard(order({ status: "preparing", prepStatus: "in_progress" }), now),
    ).toBe(true);
  });

  it("masque les commandes non payées ou annulées", () => {
    expect(isOnBoard(order({ status: "pending" }), now)).toBe(false);
    expect(isOnBoard(order({ status: "cancelled" }), now)).toBe(false);
  });

  it("fenêtre 48h pour les terminées", () => {
    const done = (ageMs: number) =>
      order({
        status: "picked_up",
        prepStatus: "done",
        prepDoneAt: new Date(now.getTime() - ageMs),
      });
    expect(isOnBoard(done(hours(47)), now)).toBe(true);
    expect(isOnBoard(done(DONE_RETENTION_MS - 1), now)).toBe(true);
    expect(isOnBoard(done(DONE_RETENTION_MS), now)).toBe(false); // pile 48h
    expect(isOnBoard(done(hours(49)), now)).toBe(false);
  });

  it("une terminée sans date reste visible (cas défensif)", () => {
    expect(isOnBoard(order({ prepStatus: "done" }), now)).toBe(true);
  });
});

describe("constantes du board", () => {
  it("colonnes ordonnées et libellées en français", () => {
    expect(PREP_ORDER).toEqual(["todo", "in_progress", "done"]);
    expect(PREP_LABELS.todo).toBe("En attente");
    expect(PREP_LABELS.in_progress).toBe("En cours de traitement");
    expect(PREP_LABELS.done).toBe("Terminée");
  });

  it("isPrepStatus garde les valeurs inconnues", () => {
    expect(isPrepStatus("done")).toBe(true);
    expect(isPrepStatus("shipped")).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/prep-status.test.ts`
Expected: FAIL — `Cannot find module '@/lib/prep-status'` (ou équivalent).

- [ ] **Step 3: Implémenter le module**

Créer `lib/prep-status.ts` :

```ts
// Domaine kanban de préparation : dimension séparée du statut commande.
// Module pur (aucun import runtime serveur), importable depuis les
// composants client comme depuis le serveur.
import type { OrderStatus, PrepStatus } from "./db/schema";

export type { PrepStatus };

// Ordre des colonnes du board, partagé entre UI et tests.
export const PREP_ORDER = [
  "todo",
  "in_progress",
  "done",
] as const satisfies readonly PrepStatus[];

export const PREP_LABELS: Record<PrepStatus, string> = {
  todo: "En attente",
  in_progress: "En cours de traitement",
  done: "Terminée",
};

// Une carte « Terminée » disparaît du board après 48h (filtre à la lecture,
// aucune donnée supprimée — la commande reste dans la table et son détail).
export const DONE_RETENTION_MS = 48 * 60 * 60 * 1000;

// Statuts commande éligibles au board : payées, non annulées.
export const BOARD_ORDER_STATUSES: readonly OrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "picked_up",
];

export function isPrepStatus(value: string): value is PrepStatus {
  return (PREP_ORDER as readonly string[]).includes(value);
}

export function isOnBoard(
  order: {
    status: OrderStatus;
    prepStatus: PrepStatus;
    prepDoneAt: Date | null;
  },
  now: Date,
): boolean {
  if (!BOARD_ORDER_STATUSES.includes(order.status)) return false;
  if (order.prepStatus !== "done") return true;
  // `done` sans horodatage : ne doit pas arriver, on garde la carte visible.
  if (!order.prepDoneAt) return true;
  return now.getTime() - order.prepDoneAt.getTime() < DONE_RETENTION_MS;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/unit/prep-status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prep-status.ts tests/unit/prep-status.test.ts
git commit -m "feat: domaine pur du kanban de préparation (fenêtre 48h)"
```

---

### Task 3: `setPrepStatus` dans `lib/orders.ts`

**Files:**
- Modify: `lib/orders.ts`
- Test: `tests/unit/orders.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/unit/orders.test.ts` : ajouter `setPrepStatus` à l'import depuis `@/lib/orders`, puis en fin de fichier :

```ts
describe("setPrepStatus (kanban de préparation)", () => {
  async function paidOrder() {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    return updateOrderStatus(db, order.id, "paid");
  }

  it("déplace une commande payée et pose la date d'entrée en done", async () => {
    const order = await paidOrder();
    const now = new Date("2026-06-11T10:00:00Z");
    const moved = await setPrepStatus(db, order.id, "in_progress", now);
    expect(moved.prepStatus).toBe("in_progress");
    expect(moved.prepDoneAt).toBeNull();
    const done = await setPrepStatus(db, order.id, "done", now);
    expect(done.prepStatus).toBe("done");
    expect(done.prepDoneAt).toEqual(now);
  });

  it("efface la date en sortant de done (la carte redevient permanente)", async () => {
    const order = await paidOrder();
    await setPrepStatus(db, order.id, "done");
    const back = await setPrepStatus(db, order.id, "in_progress");
    expect(back.prepStatus).toBe("in_progress");
    expect(back.prepDoneAt).toBeNull();
  });

  it("no-op sur la colonne courante (date conservée)", async () => {
    const order = await paidOrder();
    const t0 = new Date("2026-06-11T10:00:00Z");
    await setPrepStatus(db, order.id, "done", t0);
    const again = await setPrepStatus(
      db,
      order.id,
      "done",
      new Date("2026-06-11T11:00:00Z"),
    );
    expect(again.prepDoneAt).toEqual(t0);
  });

  it("refuse les commandes hors board (pending, cancelled, inconnue)", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(setPrepStatus(db, order.id, "in_progress")).rejects.toThrow(
      /hors du kanban/,
    );
    await updateOrderStatus(db, order.id, "cancelled");
    await expect(setPrepStatus(db, order.id, "in_progress")).rejects.toThrow(
      /hors du kanban/,
    );
    await expect(
      setPrepStatus(db, "00000000-0000-0000-0000-000000000000", "done"),
    ).rejects.toThrow(/introuvable/);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/orders.test.ts -t "setPrepStatus"`
Expected: FAIL — `setPrepStatus is not a function` (export inexistant).

- [ ] **Step 3: Implémenter**

Dans `lib/orders.ts` :

1. Étendre l'import du domaine :

```ts
import {
  canTransition,
  SHIPPING_FEE_CENTS,
  type Fulfillment,
  type ShippingCountryCode,
} from "./order-status";
import { BOARD_ORDER_STATUSES, type PrepStatus } from "./prep-status";
```

2. Ajouter en fin de fichier :

```ts
/**
 * Statut de préparation (kanban admin). Navigation libre entre colonnes,
 * réservée aux commandes payées non annulées. Entrer dans `done` pose la
 * date (base de la fenêtre 48h du board), en sortir l'efface.
 */
export async function setPrepStatus(
  db: Db,
  orderId: string,
  to: PrepStatus,
  now = new Date(),
): Promise<OrderRow> {
  const found = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = found[0];
  if (!order) throw new Error("Commande introuvable.");
  if (!BOARD_ORDER_STATUSES.includes(order.status)) {
    throw new Error("Commande hors du kanban (non payée ou annulée).");
  }
  if (order.prepStatus === to) return order;
  const [updated] = await db
    .update(orders)
    .set({ prepStatus: to, prepDoneAt: to === "done" ? now : null })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/unit/orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts
git commit -m "feat: setPrepStatus — déplacement des cartes du kanban"
```

---

### Task 4: `listBoardOrders` (visibilité + tri)

**Files:**
- Modify: `lib/orders.ts`
- Test: `tests/unit/orders.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/unit/orders.test.ts` : ajouter `listBoardOrders` à l'import depuis `@/lib/orders`, puis :

```ts
describe("listBoardOrders (visibilité du board)", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  const hours = (n: number) => n * 60 * 60 * 1000;

  async function paidOrder(deliveryDate?: string) {
    const { order } = await createPendingOrder(
      db,
      { ...camille, deliveryDate },
      [{ slug: "rivage", qty: 1 }],
    );
    return updateOrderStatus(db, order.id, "paid");
  }

  it("liste les payées, exclut pending et annulées", async () => {
    await createPendingOrder(db, camille, [{ slug: "gabut", qty: 1 }]); // pending
    const paid = await paidOrder();
    const toCancel = await createPendingOrder(db, camille, [
      { slug: "estran", qty: 1 },
    ]);
    await updateOrderStatus(db, toCancel.order.id, "cancelled");

    const board = await listBoardOrders(db, now);
    expect(board.map((o) => o.id)).toEqual([paid.id]);
  });

  it("masque les terminées de plus de 48h, garde les récentes", async () => {
    const recent = await paidOrder();
    await setPrepStatus(db, recent.id, "done", new Date(now.getTime() - hours(47)));
    const old = await paidOrder();
    await setPrepStatus(db, old.id, "done", new Date(now.getTime() - hours(49)));

    const ids = (await listBoardOrders(db, now)).map((o) => o.id);
    expect(ids).toContain(recent.id);
    expect(ids).not.toContain(old.id);
  });

  it("borne : pile 48h → masquée", async () => {
    const edge = await paidOrder();
    await setPrepStatus(
      db,
      edge.id,
      "done",
      new Date(now.getTime() - 48 * 60 * 60 * 1000),
    );
    expect((await listBoardOrders(db, now)).map((o) => o.id)).not.toContain(
      edge.id,
    );
  });

  it("trie par date de livraison souhaitée puis par création", async () => {
    const late = await paidOrder("2026-06-20");
    const early = await paidOrder("2026-06-15");
    const none = await paidOrder(); // sans date → en dernier

    const ids = (await listBoardOrders(db, now)).map((o) => o.id);
    expect(ids).toEqual([early.id, late.id, none.id]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/orders.test.ts -t "listBoardOrders"`
Expected: FAIL — `listBoardOrders is not a function`.

- [ ] **Step 3: Implémenter**

Dans `lib/orders.ts` :

1. Étendre les imports drizzle et domaine :

```ts
import { and, asc, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import {
  BOARD_ORDER_STATUSES,
  DONE_RETENTION_MS,
  type PrepStatus,
} from "./prep-status";
```

2. Ajouter après `listOrders` :

```ts
/**
 * Cartes visibles du kanban : commandes payées non annulées, les `done`
 * masquées 48h après leur fin de préparation. Tri : date de livraison
 * souhaitée croissante (NULLS LAST, défaut Postgres en ASC) puis création.
 */
export async function listBoardOrders(
  db: Db,
  now = new Date(),
): Promise<OrderRow[]> {
  const cutoff = new Date(now.getTime() - DONE_RETENTION_MS);
  return db
    .select()
    .from(orders)
    .where(
      and(
        inArray(orders.status, [...BOARD_ORDER_STATUSES]),
        or(
          ne(orders.prepStatus, "done"),
          isNull(orders.prepDoneAt),
          gt(orders.prepDoneAt, cutoff),
        ),
      ),
    )
    .orderBy(asc(orders.deliveryDate), asc(orders.createdAt));
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/unit/orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts
git commit -m "feat: listBoardOrders — cartes visibles du kanban (fenêtre 48h)"
```

---

### Task 5: Couplage `updateOrderStatus` → carte terminée

**Files:**
- Modify: `lib/orders.ts:212-235` (fonction `updateOrderStatus`)
- Test: `tests/unit/orders.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/unit/orders.test.ts`, à la fin du `describe("updateOrderStatus (machine d'états)")` existant :

```ts
  it("retirée/expédiée → la carte kanban passe en terminée", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");
    const final = await updateOrderStatus(db, order.id, "picked_up");
    expect(final.prepStatus).toBe("done");
    expect(final.prepDoneAt).not.toBeNull();
  });

  it("ne réécrase pas une date de fin de préparation déjà posée", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");
    const t0 = new Date("2026-06-10T08:00:00Z");
    await setPrepStatus(db, order.id, "done", t0);
    const final = await updateOrderStatus(db, order.id, "picked_up");
    expect(final.prepStatus).toBe("done");
    expect(final.prepDoneAt).toEqual(t0);
  });
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/orders.test.ts -t "carte kanban"`
Expected: le premier test FAIL — `expected 'todo' to be 'done'`. (Le second passe déjà ou échoue selon l'implémentation ; l'essentiel est l'échec du premier.)

- [ ] **Step 3: Implémenter**

Dans `lib/orders.ts`, remplacer le `db.update` de `updateOrderStatus` :

```ts
  // La préparation est forcément finie quand la commande part ou est retirée.
  const finishesPrep =
    (to === "shipped" || to === "picked_up") && order.prepStatus !== "done";
  const [updated] = await db
    .update(orders)
    .set({
      status: to,
      ...(finishesPrep
        ? { prepStatus: "done" as const, prepDoneAt: new Date() }
        : {}),
    })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
```

- [ ] **Step 4: Vérifier que tous les tests passent**

Run: `npm test`
Expected: PASS (toute la suite unitaire).

- [ ] **Step 5: Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts
git commit -m "feat: statut terminal → carte kanban auto-terminée"
```

---

### Task 6: Server action `changePrepStatus`

**Files:**
- Modify: `app/(admin)/admin/(panel)/commandes/actions.ts`

Les server actions du repo n'ont pas de tests unitaires dédiés (vérifiées par les e2e) — on reste cohérent ; la logique métier testée vit dans `lib/`.

- [ ] **Step 1: Implémenter l'action**

Dans `app/(admin)/admin/(panel)/commandes/actions.ts` :

1. Étendre les imports :

```ts
import { orderStatus, prepStatusEnum } from "@/lib/db/schema";
import {
  setPrepStatus,
  setTrackingNumber,
  updateOrderStatus,
} from "@/lib/orders";
```

2. Ajouter en fin de fichier :

```ts
const PrepSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(prepStatusEnum.enumValues),
});

export async function changePrepStatus(
  orderId: string,
  to: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = PrepSchema.safeParse({ orderId, to });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    await setPrepStatus(db, parsed.data.orderId, parsed.data.to);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}
```

- [ ] **Step 2: Vérifier types et lint**

Run: `npm run typecheck && npm run lint`
Expected: aucun diagnostic.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/(panel)/commandes/actions.ts"
git commit -m "feat(admin): action changePrepStatus pour le kanban"
```

---

### Task 7: Extraction `OrdersTable` + bascule de vue

**Files:**
- Create: `app/(admin)/admin/(panel)/commandes/orders-table.tsx`
- Rewrite: `app/(admin)/admin/(panel)/commandes/page.tsx`
- Modify: `tests/e2e/05-checkout.spec.ts:115` (`goto`)

Le kanban devient la vue par défaut ; la table actuelle est extraite à l'identique (mêmes `data-testid`) dans son propre fichier.

- [ ] **Step 1: Créer `orders-table.tsx`**

Contenu : la table et l'état vide actuels de `page.tsx`, paramétrés. Créer `app/(admin)/admin/(panel)/commandes/orders-table.tsx` :

```tsx
import Link from "next/link";
import type { OrderRow } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import { StatusBadge } from "./status-badge";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-stone-500">
        Aucune commande pour l&apos;instant — elles apparaîtront ici dès le
        premier paiement Stripe.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="px-4 py-3 font-medium">Commande</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Mode</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              data-testid={`order-row-${o.number}`}
              className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60"
            >
              <td className="px-4 py-3 font-semibold">{o.number}</td>
              <td className="px-4 py-3 text-stone-600">
                {dateFmt.format(o.createdAt)}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{o.customerName}</div>
                <div className="text-xs text-stone-500">{o.customerEmail}</div>
              </td>
              <td className="px-4 py-3 text-stone-600">
                {o.fulfillment === "poste" ? "Envoi postal" : "Retrait"}
              </td>
              <td className="px-4 py-3 font-medium">
                {formatEuros(o.totalCents)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={o.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/commandes/${o.id}`}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-wine hover:bg-wine/10"
                >
                  Détail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Réécrire `page.tsx`**

Remplacer intégralement `app/(admin)/admin/(panel)/commandes/page.tsx` (le kanban arrive à la Task 8 ; pour compiler dès maintenant, ce fichier l'importe — créer d'abord un `kanban-board.tsx` minimal, voir Step 3) :

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { listBoardOrders, listOrders } from "@/lib/orders";
import { KanbanBoard } from "./kanban-board";
import { OrdersTable } from "./orders-table";

export const dynamic = "force-dynamic";

export default async function CommandesPage({
  searchParams,
}: PageProps<"/admin/commandes">) {
  await verifySession();
  const { vue } = await searchParams;
  const showTable = vue === "tableau";
  const db = await getDb();
  const orders = showTable ? await listOrders(db) : await listBoardOrders(db);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commandes</h1>
          <p className="text-sm text-stone-500">
            {showTable
              ? `${orders.length} commande${orders.length > 1 ? "s" : ""} au total`
              : "Préparation — les cartes terminées disparaissent après 48h"}
          </p>
        </div>
        <nav
          aria-label="Vue des commandes"
          className="flex rounded-lg border border-stone-200 bg-white p-1 text-sm font-medium"
        >
          <ViewLink href="/admin/commandes" active={!showTable}>
            Kanban
          </ViewLink>
          <ViewLink href="/admin/commandes?vue=tableau" active={showTable}>
            Tableau
          </ViewLink>
        </nav>
      </div>

      {showTable ? (
        <OrdersTable orders={orders} />
      ) : (
        <KanbanBoard orders={orders} />
      )}
    </>
  );
}

function ViewLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 ${
        active ? "bg-wine text-linen" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 3: Créer un `kanban-board.tsx` minimal (placeholder compilable)**

Créer `app/(admin)/admin/(panel)/commandes/kanban-board.tsx` — remplacé intégralement à la Task 8 :

```tsx
"use client";

import type { OrderRow } from "@/lib/db/schema";

export function KanbanBoard({ orders }: { orders: OrderRow[] }) {
  return (
    <p className="text-sm text-stone-500">
      {orders.length} carte{orders.length > 1 ? "s" : ""} — board en
      construction.
    </p>
  );
}
```

- [ ] **Step 4: Pointer le spec e2e checkout vers la vue table**

Dans `tests/e2e/05-checkout.spec.ts`, le deuxième test navigue vers la liste :

```ts
  await page.goto("/admin/commandes?vue=tableau");
```

(remplace `await page.goto("/admin/commandes");` — la vue par défaut est désormais le kanban, sans `data-testid="order-row-…"`.)

- [ ] **Step 5: Vérifier types et lint**

Run: `npm run typecheck && npm run lint`
Expected: aucun diagnostic (`PageProps<"/admin/commandes">` est généré par `next typegen`, lancé par le script).

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/admin/(panel)/commandes" tests/e2e/05-checkout.spec.ts
git commit -m "feat(admin): bascule kanban/tableau sur la liste des commandes"
```

---

### Task 8: Board kanban (cartes, drag-and-drop, boutons)

**Files:**
- Rewrite: `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`

- [ ] **Step 1: Implémenter le board complet**

Remplacer intégralement `kanban-board.tsx` :

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { OrderRow } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import { PREP_LABELS, PREP_ORDER, type PrepStatus } from "@/lib/prep-status";
import { changePrepStatus } from "./actions";
import { StatusBadge } from "./status-badge";

// DnD HTML5 natif : suffisant pour 3 colonnes fixes, zéro dépendance.
// La carte glissée est mémorisée dans l'état React (dataTransfer n'est
// lisible qu'au drop et inutile ici).
type Dragged = { orderId: string; from: PrepStatus } | null;

export function KanbanBoard({ orders }: { orders: OrderRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Dragged>(null);
  const [pending, startTransition] = useTransition();

  const move = (orderId: string, from: PrepStatus, to: PrepStatus) => {
    if (from === to) return; // no-op : pas d'appel serveur
    setError(null);
    startTransition(async () => {
      const result = await changePrepStatus(orderId, to);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {PREP_ORDER.map((col) => {
          const cards = orders.filter((o) => o.prepStatus === col);
          return (
            <section
              key={col}
              data-testid={`kanban-col-${col}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged) move(dragged.orderId, dragged.from, col);
                setDragged(null);
              }}
              className="flex min-h-48 flex-col rounded-xl border border-stone-200 bg-stone-50/60 p-3"
            >
              <h2 className="mb-3 flex items-baseline justify-between px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">
                {PREP_LABELS[col]}
                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                  {cards.length}
                </span>
              </h2>
              <ul className="flex flex-1 flex-col gap-2">
                {cards.map((order) => (
                  <KanbanCard
                    key={order.id}
                    order={order}
                    column={col}
                    pending={pending}
                    onDragStart={() =>
                      setDragged({ orderId: order.id, from: col })
                    }
                    onMove={(to) => move(order.id, col, to)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  order,
  column,
  pending,
  onDragStart,
  onMove,
}: {
  order: OrderRow;
  column: PrepStatus;
  pending: boolean;
  onDragStart: () => void;
  onMove: (to: PrepStatus) => void;
}) {
  const idx = PREP_ORDER.indexOf(column);
  const prev = PREP_ORDER[idx - 1];
  const next = PREP_ORDER[idx + 1];

  return (
    <li
      draggable
      onDragStart={onDragStart}
      data-testid={`kanban-card-${order.number}`}
      className="cursor-grab rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/admin/commandes/${order.id}`}
          className="font-semibold text-wine hover:underline"
        >
          {order.number}
        </Link>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 font-medium">{order.customerName}</p>
      <p className="text-xs text-stone-500">
        {order.fulfillment === "poste" ? "Envoi postal" : "Retrait"}
        {order.deliveryDate && <> · souhaité le {order.deliveryDate}</>}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-medium">{formatEuros(order.totalCents)}</span>
        <span className="flex gap-1">
          {prev && (
            <MoveButton
              label={`Déplacer ${order.number} vers ${PREP_LABELS[prev]}`}
              disabled={pending}
              onClick={() => onMove(prev)}
            >
              ←
            </MoveButton>
          )}
          {next && (
            <MoveButton
              label={`Déplacer ${order.number} vers ${PREP_LABELS[next]}`}
              disabled={pending}
              onClick={() => onMove(next)}
            >
              →
            </MoveButton>
          )}
        </span>
      </div>
    </li>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Vérifier types et lint**

Run: `npm run typecheck && npm run lint`
Expected: aucun diagnostic.

- [ ] **Step 3: Contrôle visuel rapide (optionnel mais recommandé)**

Run: `npm run dev` puis ouvrir `http://localhost:3000/admin/commandes` (identifiants de `.env.local`). Vérifier : 3 colonnes, bascule Tableau, déplacement par bouton. Arrêter le serveur ensuite.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/(panel)/commandes/kanban-board.tsx"
git commit -m "feat(admin): board kanban — cartes, drag-and-drop natif, boutons"
```

---

### Task 9: Hooks de seed e2e

**Files:**
- Create: `app/api/e2e/orders/route.ts`
- Modify: `playwright.config.ts` (env du webServer)

PGlite est mono-processus : le runner Playwright ne peut pas écrire dans `.data/pglite-e2e` pendant que le serveur tourne. Cette route, activée uniquement quand `E2E_TEST_HOOKS=1`, crée des commandes en état arbitraire (dont `prep_done_at` antidaté pour le test des 48h). En production la variable est absente → 404.

- [ ] **Step 1: Créer la route**

Créer `app/api/e2e/orders/route.ts` :

```ts
// Hooks e2e : création de commandes en état arbitraire (statut, kanban,
// date de fin antidatée). Activé uniquement quand E2E_TEST_HOOKS=1
// (posé par playwright.config.ts) — 404 dans tous les autres cas.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "@/lib/db/client";
import { orders, orderStatus, prepStatusEnum } from "@/lib/db/schema";
import { createPendingOrder } from "@/lib/orders";

const BodySchema = z.object({
  name: z.string().min(1).max(100),
  items: z
    .array(z.object({ slug: z.string(), qty: z.number().int().min(1) }))
    .min(1),
  status: z.enum(orderStatus.enumValues).default("paid"),
  prepStatus: z.enum(prepStatusEnum.enumValues).default("todo"),
  prepDoneAt: z.iso.datetime().optional(),
});

export async function POST(request: Request) {
  if (process.env.E2E_TEST_HOOKS !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const { name, items, status, prepStatus, prepDoneAt } = parsed.data;

  const db = await getDb();
  const { order } = await createPendingOrder(
    db,
    { name, email: "e2e@test.local", fulfillment: "retrait" },
    items,
  );
  // Écriture directe assumée : les hooks posent un état, ils ne rejouent
  // pas la machine de transitions.
  const [updated] = await db
    .update(orders)
    .set({
      status,
      prepStatus,
      prepDoneAt: prepDoneAt ? new Date(prepDoneAt) : null,
    })
    .where(eq(orders.id, order.id))
    .returning();

  return NextResponse.json({ id: updated.id, number: updated.number });
}
```

- [ ] **Step 2: Activer le flag dans Playwright**

Dans `playwright.config.ts`, au début de `webServer.env` (juste après `NEXT_PUBLIC_SITE_URL: baseURL,`) :

```ts
      // Hooks de seed pour les specs kanban (app/api/e2e/orders).
      E2E_TEST_HOOKS: "1",
```

- [ ] **Step 3: Vérifier types et lint**

Run: `npm run typecheck && npm run lint`
Expected: aucun diagnostic.

- [ ] **Step 4: Commit**

```bash
git add app/api/e2e playwright.config.ts
git commit -m "test(e2e): hooks de seed des commandes (E2E_TEST_HOOKS)"
```

---

### Task 10: Spec e2e du kanban

**Files:**
- Create: `tests/e2e/06-admin-kanban.spec.ts`

- [ ] **Step 1: Écrire le spec**

Créer `tests/e2e/06-admin-kanban.spec.ts` :

```ts
import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminLogin } from "./helpers";

// Kanban de préparation. Les commandes sont seedées via les hooks e2e
// (/api/e2e/orders) — aucune dépendance au parcours Stripe du spec 05.
test.describe.configure({ mode: "serial" });

const HOURS = 60 * 60 * 1000;

async function seedOrder(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; number: string }> {
  const res = await request.post("/api/e2e/orders", { data: body });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

let fresh = { id: "", number: "" };

test("une commande payée apparaît en « En attente »", async ({
  page,
  request,
}) => {
  fresh = await seedOrder(request, {
    name: "Léa Kanban",
    items: [{ slug: "rivage", qty: 1 }],
  });
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await expect(page.getByTestId("kanban-col-todo")).toContainText(fresh.number);
  await expect(page.getByTestId("kanban-col-todo")).toContainText("Léa Kanban");
});

test("le bouton déplace la carte vers « En cours de traitement »", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await page
    .getByRole("button", {
      name: `Déplacer ${fresh.number} vers En cours de traitement`,
    })
    .click();
  await expect(page.getByTestId("kanban-col-in_progress")).toContainText(
    fresh.number,
  );
  await expect(page.getByTestId("kanban-col-todo")).not.toContainText(
    fresh.number,
  );
});

test("le drag-and-drop termine la carte", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/commandes");
  const card = page.getByTestId(`kanban-card-${fresh.number}`);
  // Playwright pilote le DnD HTML5 natif dans Chromium via dragTo.
  await card.dragTo(page.getByTestId("kanban-col-done"));
  await expect(page.getByTestId("kanban-col-done")).toContainText(fresh.number);
  await expect(page.getByTestId("kanban-col-in_progress")).not.toContainText(
    fresh.number,
  );
});

test("bascule kanban ↔ tableau", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await page.getByRole("link", { name: "Tableau" }).click();
  await expect(page.getByTestId(`order-row-${fresh.number}`)).toBeVisible();
  await page.getByRole("link", { name: "Kanban" }).click();
  await expect(page.getByTestId("kanban-col-done")).toContainText(fresh.number);
});

test("terminée depuis plus de 48h : hors du board, toujours dans le tableau", async ({
  page,
  request,
}) => {
  const old = await seedOrder(request, {
    name: "Vieille Terminée",
    items: [{ slug: "estran", qty: 1 }],
    status: "picked_up",
    prepStatus: "done",
    prepDoneAt: new Date(Date.now() - 49 * HOURS).toISOString(),
  });
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await expect(page.getByTestId("kanban-col-done")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(old.number);
  await page.goto("/admin/commandes?vue=tableau");
  await expect(page.getByTestId(`order-row-${old.number}`)).toBeVisible();
});
```

Note : si `dragTo` se révèle inopérant sur le DnD HTML5 (selon la version de Chromium), remplacer par une simulation événementielle :

```ts
  await card.dispatchEvent("dragstart");
  const col = page.getByTestId("kanban-col-done");
  await col.dispatchEvent("dragover");
  await col.dispatchEvent("drop");
```

(le board mémorise la carte glissée dans l'état React au `dragstart`, donc cette simulation suffit).

- [ ] **Step 2: Lancer le spec kanban seul**

Run: `npx playwright test tests/e2e/06-admin-kanban.spec.ts`
Expected: 5 PASS (build de prod ~1-2 min au démarrage ; base `.data/pglite-e2e` purgée par le webServer ; pas de réseau Stripe requis pour ce spec).

NB : `page.locator("main")` cible le contenu de page du layout admin (`app/(admin)/admin/(panel)/layout.tsx:44`) en excluant la sidebar.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/06-admin-kanban.spec.ts
git commit -m "test(e2e): parcours kanban — colonnes, déplacements, fenêtre 48h"
```

---

### Task 11: Vérification finale

- [ ] **Step 1: Suite unitaire complète**

Run: `npm test`
Expected: PASS (orders, prep-status, et toute la suite existante).

- [ ] **Step 2: Types + lint**

Run: `npm run typecheck && npm run lint`
Expected: aucun diagnostic.

- [ ] **Step 3: E2E**

Run: `npx playwright test tests/e2e/03-admin-auth.spec.ts tests/e2e/04-admin-products.spec.ts tests/e2e/06-admin-kanban.spec.ts`
Expected: PASS. La suite complète (`npm run test:e2e`) inclut `05-checkout` qui exige le réseau Stripe en mode test — la lancer si les clés sont disponibles, sinon le signaler dans le compte rendu.

- [ ] **Step 4: Mettre à jour le statut du spec**

Dans `docs/superpowers/specs/2026-06-11-kanban-commandes-design.md`, passer `**Statut :** validé (approche A)` à `**Statut :** implémenté`. Commit :

```bash
git add docs/superpowers/specs/2026-06-11-kanban-commandes-design.md
git commit -m "docs: spec kanban — implémenté"
```
