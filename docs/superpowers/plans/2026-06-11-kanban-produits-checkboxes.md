# Cartes kanban : produits, checkboxes par unité, colonne « À expédier » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Les cartes du kanban admin affichent les produits avec une checkbox par unité ; cocher fait avancer la carte automatiquement (symétrique) à travers 4 colonnes : En attente → En cours de traitement → À expédier → Terminée.

**Architecture :** Nouvelle valeur d'enum `ready` + compteur `prepared_qty` sur `order_items` (les unités sont fongibles). Une fonction pure `derivePrepStatus` calcule le statut depuis les cases ; elle n'est appliquée que par `setItemPreparedQty` (clic sur une case), jamais lors d'un drag. `listBoardOrders` renvoie désormais les commandes avec leurs articles.

**Tech stack :** Next.js 16 (App Router, server actions), Drizzle + PGlite/Postgres, Zod 4, Tailwind 4, vitest, Playwright.

**Spec :** `docs/superpowers/specs/2026-06-11-kanban-produits-checkboxes-design.md`

**Conventions du repo à respecter :**
- Commentaires et messages d'erreur en français, ton sobre.
- Les migrations sont générées par `npm run db:generate` puis enrichies à la main (backfill ajouté en fin de fichier, voir `0002_prep_status.sql`).
- Tests unitaires : vitest + PGlite via `createTestDb()` (`tests/helpers/db.ts`), base neuve par test.
- E2E : seed via `POST /api/e2e/orders` (hook `E2E_TEST_HOOKS=1`), mode `serial`.
- Aucune nouvelle API Next.js : on copie les gabarits server action / `revalidatePath` déjà présents dans `actions.ts`.

---

### Task 1 : Enum `ready`, colonne `prepared_qty`, constantes domaine

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/prep-status.ts`
- Create: `lib/db/migrations/0003_*.sql` (généré puis enrichi)
- Test: `tests/unit/prep-status.test.ts`

- [ ] **Step 1 : Mettre à jour le test des constantes (il doit échouer)**

Dans `tests/unit/prep-status.test.ts`, remplacer le test « colonnes ordonnées et libellées en français » :

```ts
  it("colonnes ordonnées et libellées en français", () => {
    expect(PREP_ORDER).toEqual(["todo", "in_progress", "ready", "done"]);
    expect(PREP_LABELS.todo).toBe("En attente");
    expect(PREP_LABELS.in_progress).toBe("En cours de traitement");
    expect(PREP_LABELS.ready).toBe("À expédier");
    expect(PREP_LABELS.done).toBe("Terminée");
  });
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx vitest run tests/unit/prep-status.test.ts`
Attendu : FAIL — `PREP_ORDER` ne contient que 3 valeurs.

- [ ] **Step 3 : Schéma — enum et colonne**

Dans `lib/db/schema.ts`, remplacer la déclaration de l'enum :

```ts
export const prepStatusEnum = pgEnum("prep_status", [
  "todo",
  "in_progress",
  "ready",
  "done",
]);
```

Et dans `orderItems`, après `qty` :

```ts
  qty: integer("qty").notNull(),
  // Unités préparées (cases du kanban admin) : compteur 0..qty, borné côté
  // application — les unités d'un même produit sont interchangeables.
  preparedQty: integer("prepared_qty").notNull().default(0),
```

- [ ] **Step 4 : Domaine — ordre des colonnes et libellés**

Dans `lib/prep-status.ts` :

```ts
// Ordre des colonnes du board, partagé entre UI et tests.
export const PREP_ORDER = [
  "todo",
  "in_progress",
  "ready",
  "done",
] as const satisfies readonly PrepStatus[];

export const PREP_LABELS: Record<PrepStatus, string> = {
  todo: "En attente",
  in_progress: "En cours de traitement",
  ready: "À expédier",
  done: "Terminée",
};
```

- [ ] **Step 5 : Générer la migration**

Run : `npm run db:generate`
Attendu : nouveau fichier `lib/db/migrations/0003_<nom>.sql` contenant :

```sql
ALTER TYPE "public"."prep_status" ADD VALUE 'ready' BEFORE 'done';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "prepared_qty" integer DEFAULT 0 NOT NULL;
```

Si drizzle-kit génère autre chose (ex. recréation du type), remplacer le contenu par ces deux statements exactement. Le `ADD VALUE` n'utilise pas `'ready'` dans la même transaction → compatible avec le migrator transactionnel (Postgres ≥ 12, PGlite inclus).

- [ ] **Step 6 : Ajouter le backfill au fichier généré**

Ajouter à la fin du fichier `0003_*.sql` (même esprit que le backfill de `0002_prep_status.sql`) :

```sql
--> statement-breakpoint
UPDATE "order_items" SET "prepared_qty" = "qty"
FROM "orders"
WHERE "order_items"."order_id" = "orders"."id"
  AND "orders"."prep_status" = 'done';
```

- [ ] **Step 7 : Vérifier que tout passe**

Run : `npx vitest run` puis `npm run typecheck`
Attendu : PASS partout — `createTestDb()` rejoue les migrations sur PGlite, donc la 0003 est exercée par toute la suite.

- [ ] **Step 8 : Commit**

```bash
git add lib/db/schema.ts lib/prep-status.ts lib/db/migrations tests/unit/prep-status.test.ts
git commit -m "feat(db): statut ready + compteur prepared_qty sur les articles"
```

---

### Task 2 : `derivePrepStatus` (fonction pure)

**Files:**
- Modify: `lib/prep-status.ts`
- Test: `tests/unit/prep-status.test.ts`

- [ ] **Step 1 : Écrire les tests (ils doivent échouer)**

Ajouter à `tests/unit/prep-status.test.ts` (importer `derivePrepStatus` depuis `@/lib/prep-status`) :

```ts
describe("derivePrepStatus", () => {
  it("rien coché → en attente", () => {
    expect(derivePrepStatus(0, 3)).toBe("todo");
    expect(derivePrepStatus(-1, 3)).toBe("todo"); // défensif
  });

  it("partiellement coché → en cours de traitement", () => {
    expect(derivePrepStatus(1, 3)).toBe("in_progress");
    expect(derivePrepStatus(2, 3)).toBe("in_progress");
  });

  it("tout coché → à expédier", () => {
    expect(derivePrepStatus(3, 3)).toBe("ready");
    expect(derivePrepStatus(4, 3)).toBe("ready"); // défensif
  });

  it("zéro unité au total → en attente (défensif, panier vide impossible)", () => {
    expect(derivePrepStatus(0, 0)).toBe("todo");
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx vitest run tests/unit/prep-status.test.ts`
Attendu : FAIL — `derivePrepStatus` n'existe pas.

- [ ] **Step 3 : Implémenter**

Ajouter à `lib/prep-status.ts` :

```ts
// Statut dérivé des cases de préparation. Ne renvoie jamais `done` : la
// sortie du board est l'affaire du statut commande (shipped / picked_up).
// Appliqué uniquement quand on coche/décoche — jamais lors d'un drag.
export function derivePrepStatus(
  preparedTotal: number,
  totalQty: number,
): Extract<PrepStatus, "todo" | "in_progress" | "ready"> {
  if (totalQty <= 0 || preparedTotal <= 0) return "todo";
  if (preparedTotal >= totalQty) return "ready";
  return "in_progress";
}
```

- [ ] **Step 4 : Vérifier le pass**

Run : `npx vitest run tests/unit/prep-status.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add lib/prep-status.ts tests/unit/prep-status.test.ts
git commit -m "feat: derivePrepStatus — statut kanban dérivé des cases"
```

---

### Task 3 : `setItemPreparedQty` (cycle de vie)

**Files:**
- Modify: `lib/orders.ts`
- Test: `tests/unit/orders.test.ts`

- [ ] **Step 1 : Écrire les tests (ils doivent échouer)**

Ajouter à `tests/unit/orders.test.ts`. Imports à compléter : `setItemPreparedQty` depuis `@/lib/orders`, `orderItems` depuis `@/lib/db/schema`.

```ts
describe("setItemPreparedQty (cases de préparation)", () => {
  async function paidOrderWithItems(items: { slug: string; qty: number }[]) {
    const created = await createPendingOrder(db, camille, items);
    const order = await updateOrderStatus(db, created.order.id, "paid");
    return { order, items: created.items };
  }

  it("borne la valeur dans [0, qty] (clamp silencieux)", async () => {
    const { items } = await paidOrderWithItems([{ slug: "rivage", qty: 2 }]);
    await setItemPreparedQty(db, items[0].id, 99);
    let [row] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, items[0].id));
    expect(row.preparedQty).toBe(2);

    await setItemPreparedQty(db, items[0].id, -5);
    [row] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, items[0].id));
    expect(row.preparedQty).toBe(0);
  });

  it("transitions symétriques : todo → in_progress → ready → in_progress → todo", async () => {
    const { items } = await paidOrderWithItems([
      { slug: "rivage", qty: 2 },
      { slug: "estran", qty: 1 },
    ]);
    const rivage = items.find((i) => i.nameSnapshot === "rivage")!;
    const estran = items.find((i) => i.nameSnapshot === "estran")!;

    let order = await setItemPreparedQty(db, rivage.id, 1); // 1/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, rivage.id, 2); // 2/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, estran.id, 1); // 3/3
    expect(order.prepStatus).toBe("ready");
    expect(order.prepDoneAt).toBeNull(); // ready n'est pas done

    order = await setItemPreparedQty(db, rivage.id, 1); // 2/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, rivage.id, 0); // 1/3
    expect(order.prepStatus).toBe("in_progress");
    order = await setItemPreparedQty(db, estran.id, 0); // 0/3
    expect(order.prepStatus).toBe("todo");
  });

  it("un drag manuel vers ready n'invente pas de cases cochées", async () => {
    const { order, items } = await paidOrderWithItems([
      { slug: "rivage", qty: 2 },
    ]);
    const moved = await setPrepStatus(db, order.id, "ready");
    expect(moved.prepStatus).toBe("ready");
    const [row] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, items[0].id));
    expect(row.preparedQty).toBe(0);
  });

  it("refuse hors board, carte terminée et article inconnu", async () => {
    const created = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(
      setItemPreparedQty(db, created.items[0].id, 1),
    ).rejects.toThrow(/hors du kanban/);

    const { order, items } = await paidOrderWithItems([
      { slug: "estran", qty: 1 },
    ]);
    await setPrepStatus(db, order.id, "done");
    await expect(setItemPreparedQty(db, items[0].id, 1)).rejects.toThrow(
      /déjà terminée/,
    );

    await expect(
      setItemPreparedQty(db, "00000000-0000-0000-0000-000000000000", 1),
    ).rejects.toThrow(/Article introuvable/);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx vitest run tests/unit/orders.test.ts`
Attendu : FAIL — `setItemPreparedQty` n'existe pas.

- [ ] **Step 3 : Implémenter**

Dans `lib/orders.ts` : ajouter `derivePrepStatus` à l'import depuis `./prep-status`, puis après `setPrepStatus` :

```ts
/**
 * Cases de préparation (kanban admin) : pose le nombre d'unités préparées
 * d'un article (borné à [0, qty]) puis recalcule le statut de la carte
 * depuis l'ensemble des articles — symétrique : tout coché → ready,
 * partiel → in_progress, rien → todo. Refusé sur une carte terminée
 * (cases gelées) ; `prep_done_at` n'est jamais touché ici.
 */
export async function setItemPreparedQty(
  db: Db,
  orderItemId: string,
  preparedQty: number,
): Promise<OrderRow> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ item: orderItems, order: orders })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orderItems.id, orderItemId))
      .limit(1);
    const row = found[0];
    if (!row) throw new Error("Article introuvable.");
    if (!BOARD_ORDER_STATUSES.includes(row.order.status)) {
      throw new Error("Commande hors du kanban (non payée ou annulée).");
    }
    if (row.order.prepStatus === "done") {
      throw new Error("Préparation déjà terminée.");
    }

    const clamped = Math.min(Math.max(preparedQty, 0), row.item.qty);
    await tx
      .update(orderItems)
      .set({ preparedQty: clamped })
      .where(eq(orderItems.id, orderItemId));

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, row.order.id));
    const preparedTotal = items.reduce((sum, i) => sum + i.preparedQty, 0);
    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    const derived = derivePrepStatus(preparedTotal, totalQty);
    if (derived === row.order.prepStatus) return row.order;

    const [updated] = await tx
      .update(orders)
      .set({ prepStatus: derived })
      .where(eq(orders.id, row.order.id))
      .returning();
    return updated;
  });
}
```

Note : la spec mentionnait un paramètre `now` — inutile puisque `prep_done_at`
n'est jamais posé ici (`derivePrepStatus` ne renvoie jamais `done`). On le
retire (YAGNI) ; la spec sera mise à jour en Task 7.

- [ ] **Step 4 : Vérifier le pass**

Run : `npx vitest run tests/unit/orders.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts
git commit -m "feat: setItemPreparedQty — cases de préparation et statut dérivé"
```

---

### Task 4 : `updateOrderStatus` coche toutes les cases à l'expédition/au retrait

**Files:**
- Modify: `lib/orders.ts`
- Test: `tests/unit/orders.test.ts`

- [ ] **Step 1 : Écrire les tests (ils doivent échouer)**

Ajouter dans le `describe("updateOrderStatus (machine d'états)")` existant :

```ts
  it("expédiée → toutes les cases cochées", async () => {
    const poste = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "rivage", qty: 2 }],
    );
    await updateOrderStatus(db, poste.order.id, "paid");
    await updateOrderStatus(db, poste.order.id, "preparing");
    await updateOrderStatus(db, poste.order.id, "shipped");
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, poste.items[0].id));
    expect(item.preparedQty).toBe(2);
  });

  it("retirée → cases cochées même si la carte était déjà terminée", async () => {
    const retrait = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 2 },
    ]);
    await updateOrderStatus(db, retrait.order.id, "paid");
    await setPrepStatus(db, retrait.order.id, "done"); // déplacée à la main, cases vides
    await updateOrderStatus(db, retrait.order.id, "preparing");
    await updateOrderStatus(db, retrait.order.id, "picked_up");
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, retrait.items[0].id));
    expect(item.preparedQty).toBe(2);
  });
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx vitest run tests/unit/orders.test.ts`
Attendu : FAIL — `preparedQty` reste à 0 après `shipped` / `picked_up`.

- [ ] **Step 3 : Implémenter**

Dans `lib/orders.ts` : ajouter `sql` à l'import `drizzle-orm`, puis remplacer la fin de `updateOrderStatus` (à partir du commentaire « La préparation est forcément finie… ») par :

```ts
  // La préparation est forcément finie quand la commande part ou est
  // retirée : carte en « Terminée » (date posée une seule fois) et toutes
  // les cases cochées — même si la carte y avait été déplacée à la main.
  const finishesPrep = to === "shipped" || to === "picked_up";
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orders)
      .set({
        status: to,
        ...(finishesPrep && order.prepStatus !== "done"
          ? { prepStatus: "done" as const, prepDoneAt: new Date() }
          : {}),
      })
      .where(eq(orders.id, orderId))
      .returning();
    if (finishesPrep) {
      await tx
        .update(orderItems)
        .set({ preparedQty: sql`${orderItems.qty}` })
        .where(eq(orderItems.orderId, orderId));
    }
    return updated;
  });
```

- [ ] **Step 4 : Vérifier le pass (toute la suite)**

Run : `npx vitest run`
Attendu : PASS — y compris « ne réécrase pas une date de fin de préparation déjà posée ».

- [ ] **Step 5 : Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts
git commit -m "feat: expédition/retrait coche toutes les cases de préparation"
```

---

### Task 5 : `listBoardOrders` avec articles + UI (carte produits, 4 colonnes, action)

**Files:**
- Modify: `lib/orders.ts`
- Modify: `tests/unit/orders.test.ts`
- Modify: `app/(admin)/admin/(panel)/commandes/page.tsx`
- Modify: `app/(admin)/admin/(panel)/commandes/actions.ts`
- Modify: `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`

- [ ] **Step 1 : Adapter les tests de `listBoardOrders` (ils doivent échouer)**

Dans `tests/unit/orders.test.ts`, `describe("listBoardOrders (visibilité du board)")` — le retour devient `Array<{ order, items }>` :

- remplacer chaque `board.map((o) => o.id)` / `(await listBoardOrders(db, now)).map((o) => o.id)` par `.map(({ order }) => order.id)` (5 occurrences) ;
- ajouter :

```ts
  it("joint les articles de chaque commande, triés par nom", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 2 },
      { slug: "estran", qty: 1 },
    ]);
    await updateOrderStatus(db, order.id, "paid");

    const board = await listBoardOrders(db, now);
    expect(board).toHaveLength(1);
    expect(board[0].items.map((i) => i.nameSnapshot)).toEqual([
      "estran",
      "rivage",
    ]);
    expect(board[0].items.map((i) => i.preparedQty)).toEqual([0, 0]);
  });
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `npx vitest run tests/unit/orders.test.ts`
Attendu : FAIL — `listBoardOrders` renvoie des `OrderRow` plats.

- [ ] **Step 3 : Implémenter `listBoardOrders`**

Dans `lib/orders.ts`, remplacer `listBoardOrders` :

```ts
export type BoardOrder = { order: OrderRow; items: OrderItemRow[] };

/**
 * Cartes visibles du kanban avec leurs articles : commandes payées non
 * annulées, les `done` masquées 48h après leur fin de préparation.
 * Tri : date de livraison souhaitée croissante (NULLS LAST, défaut
 * Postgres en ASC) puis création ; articles triés par nom.
 */
export async function listBoardOrders(
  db: Db,
  now = new Date(),
): Promise<BoardOrder[]> {
  const cutoff = new Date(now.getTime() - DONE_RETENTION_MS);
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        inArray(orders.status, BOARD_ORDER_STATUSES),
        or(
          ne(orders.prepStatus, "done"),
          isNull(orders.prepDoneAt),
          gt(orders.prepDoneAt, cutoff),
        ),
      ),
    )
    .orderBy(asc(orders.deliveryDate), asc(orders.createdAt));
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(orderItems.nameSnapshot));
  const byOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }
  return rows.map((order) => ({ order, items: byOrder.get(order.id) ?? [] }));
}
```

- [ ] **Step 4 : Vérifier le pass unitaire**

Run : `npx vitest run tests/unit/orders.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Server action `setItemPrepared`**

Dans `app/(admin)/admin/(panel)/commandes/actions.ts` : ajouter `setItemPreparedQty` à l'import `@/lib/orders`, puis à la fin du fichier :

```ts
const ItemPrepSchema = z.object({
  orderItemId: z.uuid(),
  preparedQty: z.number().int().min(0).max(99),
});

export async function setItemPrepared(
  orderItemId: string,
  preparedQty: number,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = ItemPrepSchema.safeParse({ orderItemId, preparedQty });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  let orderId: string;
  try {
    const db = await getDb();
    const updated = await setItemPreparedQty(
      db,
      parsed.data.orderItemId,
      parsed.data.preparedQty,
    );
    orderId = updated.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}
```

- [ ] **Step 6 : `page.tsx` — passer les articles au board**

Dans `app/(admin)/admin/(panel)/commandes/page.tsx`, remplacer le corps de `CommandesPage` (les imports et `ViewLink` ne changent pas) :

```tsx
export default async function CommandesPage({
  searchParams,
}: PageProps<"/admin/commandes">) {
  await verifySession();
  const { vue } = await searchParams;
  const showTable = vue === "tableau";
  const db = await getDb();
  const tableOrders = showTable ? await listOrders(db) : [];
  const boardOrders = showTable ? [] : await listBoardOrders(db);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commandes</h1>
          <p className="text-sm text-stone-500">
            {showTable
              ? `${tableOrders.length} commande${tableOrders.length > 1 ? "s" : ""} au total`
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
        <OrdersTable orders={tableOrders} />
      ) : (
        <KanbanBoard orders={boardOrders} />
      )}
    </>
  );
}
```

- [ ] **Step 7 : `kanban-board.tsx` — carte produits + cases + 4 colonnes**

Remplacer intégralement `app/(admin)/admin/(panel)/commandes/kanban-board.tsx` :

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { OrderItemRow } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import type { BoardOrder } from "@/lib/orders";
import { PREP_LABELS, PREP_ORDER, type PrepStatus } from "@/lib/prep-status";
import { changePrepStatus, setItemPrepared } from "./actions";
import { StatusBadge } from "./status-badge";

// DnD HTML5 natif : suffisant pour 4 colonnes fixes, zéro dépendance.
// La carte glissée est mémorisée dans l'état React (dataTransfer n'est
// lisible qu'au drop et inutile ici).
type Dragged = { orderId: string; from: PrepStatus } | null;

export function KanbanBoard({ orders }: { orders: BoardOrder[] }) {
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Dragged>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error: string } | undefined>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  };

  const move = (orderId: string, from: PrepStatus, to: PrepStatus) => {
    if (from === to) return; // no-op : pas d'appel serveur
    run(() => changePrepStatus(orderId, to));
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PREP_ORDER.map((col) => {
          const cards = orders.filter((b) => b.order.prepStatus === col);
          return (
            <section
              key={col}
              aria-labelledby={`kanban-col-titre-${col}`}
              data-testid={`kanban-col-${col}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged) move(dragged.orderId, dragged.from, col);
                setDragged(null);
              }}
              className="flex min-h-48 flex-col rounded-xl border border-stone-200 bg-stone-50/60 p-3"
            >
              <h2
                id={`kanban-col-titre-${col}`}
                className="mb-3 flex items-baseline justify-between px-1 text-sm font-semibold uppercase tracking-wide text-stone-500"
              >
                {PREP_LABELS[col]}
                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                  {cards.length}
                </span>
              </h2>
              <ul className="flex flex-1 flex-col gap-2">
                {cards.map((board) => (
                  <KanbanCard
                    key={board.order.id}
                    board={board}
                    column={col}
                    pending={pending}
                    onDragStart={() =>
                      setDragged({ orderId: board.order.id, from: col })
                    }
                    // dragend suit toujours le drop (ou un drag avorté) :
                    // nettoie l'état pour ne jamais déplacer une carte périmée.
                    onDragEnd={() => setDragged(null)}
                    onMove={(to) => move(board.order.id, col, to)}
                    onSetPrepared={(itemId, qty) =>
                      run(() => setItemPrepared(itemId, qty))
                    }
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
  board,
  column,
  pending,
  onDragStart,
  onDragEnd,
  onMove,
  onSetPrepared,
}: {
  board: BoardOrder;
  column: PrepStatus;
  pending: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: PrepStatus) => void;
  onSetPrepared: (itemId: string, preparedQty: number) => void;
}) {
  const { order, items } = board;
  const idx = PREP_ORDER.indexOf(column);
  const prev = PREP_ORDER[idx - 1];
  const next = PREP_ORDER[idx + 1];

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
      <ul className="mt-2 flex flex-col gap-1.5 border-y border-stone-100 py-2">
        {items.map((item) => (
          <ItemLine
            key={item.id}
            item={item}
            // Cases gelées en « Terminée » (le serveur refuse aussi).
            disabled={pending || column === "done"}
            onSetPrepared={(qty) => onSetPrepared(item.id, qty)}
          />
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">
          {formatEuros(order.totalCents)}
        </span>
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

// Une checkbox par unité : les `preparedQty` premières sont cochées (les
// unités sont fongibles). Cocher une case vide → +1, décocher → −1 ; le
// serveur recalcule la colonne de la carte à chaque clic.
function ItemLine({
  item,
  disabled,
  onSetPrepared,
}: {
  item: OrderItemRow;
  disabled: boolean;
  onSetPrepared: (preparedQty: number) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="font-medium text-stone-700">
        {item.qty > 1 && `${item.qty} × `}
        {item.nameSnapshot}
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        {Array.from({ length: item.qty }, (_, i) => {
          const checked = i < item.preparedQty;
          return (
            <input
              key={i}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              aria-label={`${item.nameSnapshot} — unité ${i + 1} sur ${item.qty}`}
              onChange={() =>
                onSetPrepared(checked ? item.preparedQty - 1 : item.preparedQty + 1)
              }
              className="size-4 accent-wine"
            />
          );
        })}
      </span>
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

- [ ] **Step 8 : Vérifier types et suite complète**

Run : `npm run typecheck` puis `npx vitest run`
Attendu : PASS partout.

- [ ] **Step 9 : Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts "app/(admin)/admin/(panel)/commandes/page.tsx" "app/(admin)/admin/(panel)/commandes/actions.ts" "app/(admin)/admin/(panel)/commandes/kanban-board.tsx"
git commit -m "feat(admin): cartes kanban — produits, cases par unité, colonne À expédier"
```

---

### Task 6 : E2E — parcours checkboxes et 4 colonnes

**Files:**
- Modify: `tests/e2e/06-admin-kanban.spec.ts`

Les tests existants restent valides (la colonne `ready` s'ajoute sans casser
les sélecteurs ni les libellés des boutons). On ajoute le parcours des cases
à la suite, toujours en mode `serial`.

- [ ] **Step 1 : Ajouter les tests**

À la fin de `tests/e2e/06-admin-kanban.spec.ts` :

```ts
let checklist = { id: "", number: "" };

test("la carte affiche les produits et une case par unité", async ({
  page,
  request,
}) => {
  checklist = await seedOrder(request, {
    name: "Maud Checklist",
    items: [
      { slug: "rivage", qty: 2 },
      { slug: "estran", qty: 1 },
    ],
  });
  await adminLogin(page);
  await page.goto("/admin/commandes");
  const card = page.getByTestId(`kanban-card-${checklist.number}`);
  await expect(card).toContainText("rivage");
  await expect(card).toContainText("estran");
  await expect(card.getByRole("checkbox")).toHaveCount(3);
});

test("cocher les cases fait avancer la carte (1 → en cours, toutes → à expédier)", async ({
  page,
}) => {
  expect(checklist.number, "le test de seed doit passer d'abord").toMatch(/^CQ-/);
  await adminLogin(page);
  await page.goto("/admin/commandes");
  const card = page.getByTestId(`kanban-card-${checklist.number}`);

  await card.getByRole("checkbox", { checked: false }).first().check();
  await expect(page.getByTestId("kanban-col-in_progress")).toContainText(
    checklist.number,
  );

  await card.getByRole("checkbox", { checked: false }).first().check();
  await expect(card.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(page.getByTestId("kanban-col-in_progress")).toContainText(
    checklist.number,
  );

  await card.getByRole("checkbox", { checked: false }).first().check();
  await expect(page.getByTestId("kanban-col-ready")).toContainText(
    checklist.number,
  );
});

test("décocher fait reculer la carte (symétrique jusqu'à en attente)", async ({
  page,
}) => {
  expect(checklist.number, "le test de seed doit passer d'abord").toMatch(/^CQ-/);
  await adminLogin(page);
  await page.goto("/admin/commandes");
  const card = page.getByTestId(`kanban-card-${checklist.number}`);

  await card.getByRole("checkbox", { checked: true }).first().uncheck();
  await expect(page.getByTestId("kanban-col-in_progress")).toContainText(
    checklist.number,
  );

  await card.getByRole("checkbox", { checked: true }).first().uncheck();
  await card.getByRole("checkbox", { checked: true }).first().uncheck();
  await expect(page.getByTestId("kanban-col-todo")).toContainText(
    checklist.number,
  );
});
```

- [ ] **Step 2 : Lancer le spec kanban**

Run : `npx playwright test tests/e2e/06-admin-kanban.spec.ts`
Attendu : PASS (8 tests).

- [ ] **Step 3 : Commit**

```bash
git add tests/e2e/06-admin-kanban.spec.ts
git commit -m "test(e2e): parcours checkboxes — avancée et recul automatiques"
```

---

### Task 7 : Finalisation — suites complètes, migration réelle, docs

- [ ] **Step 1 : Suites complètes**

Run : `npm run typecheck && npm run lint && npx vitest run && npx playwright test`
Attendu : PASS partout.

- [ ] **Step 2 : Appliquer la migration sur la base réelle (Supabase)**

Run : `npm run db:migrate`
Attendu : `0003_*` appliquée. En cas d'échec (env manquant), le signaler à l'utilisateur sans bloquer le reste.

- [ ] **Step 3 : Mettre à jour la spec**

Dans `docs/superpowers/specs/2026-06-11-kanban-produits-checkboxes-design.md` :
- `**Statut :** validé` → `**Statut :** implémenté` ;
- section 3, signature `setItemPreparedQty(db, orderItemId, preparedQty, now)` → retirer `now` (jamais utilisé : `prep_done_at` n'est pas touché par les cases).

- [ ] **Step 4 : Commit final**

```bash
git add docs/superpowers/specs/2026-06-11-kanban-produits-checkboxes-design.md docs/superpowers/plans/2026-06-11-kanban-produits-checkboxes.md
git commit -m "docs: spec kanban produits/checkboxes — implémenté"
```
