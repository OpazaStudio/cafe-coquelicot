# Retrait boutique / Envoi postal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la livraison à vélo par l'envoi postal (Colissimo, France + pays limitrophes), avec adresse structurée, mode de récupération stocké en base, statuts terminaux distincts (`shipped`/`picked_up`) et numéro de suivi côté admin.

**Architecture:** Le domaine pur vit dans `lib/order-status.ts` (constantes, machine d'états dépendante du mode). `lib/db/schema.ts` + une migration Drizzle ajoutent `fulfillment`, l'adresse éclatée et `tracking_number`, et remplacent le statut `delivered` par `shipped`/`picked_up`. Le checkout (action serveur + formulaire), la page de confirmation, l'admin et les tests sont adaptés en aval.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM (Postgres/Supabase, PGlite en test), Zod v4, Stripe Checkout, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-11-fulfillment-postal-design.md`

**Référence rapide des décisions :**
- `Fulfillment = "retrait" | "poste"` (remplace `"livraison"`)
- `SHIPPING_FEE_CENTS = 790` (provisoire), remplace `DELIVERY_FEE_CENTS = 900`
- Pays autorisés : FR, BE, LU, DE, CH, IT, ES, MC, AD
- Statuts : `pending, paid, preparing, shipped, picked_up, cancelled`
- `shipped` ⇔ poste uniquement, `picked_up` ⇔ retrait uniquement
- Code postal : `^\d{5}$` si FR, sinon 2–10 caractères

**Notes d'exécution :**
- Les tâches 1–3 cassent transitoirement la compilation du reste de l'app (renommage d'enum) ; c'est attendu. Les tests unitaires repassent en fin de tâche 4, le typecheck complet en fin de tâche 8.
- `npm run test` lance Vitest (PGlite en mémoire, migrations rejouées à chaque test). `npm run test:e2e` lance Playwright (réseau requis, Stripe en mode test).

---

### Task 1: Schéma DB + migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0001_fulfillment_postal.sql` (via `db:generate`, puis contenu remplacé)

- [ ] **Step 1: Mettre à jour `lib/db/schema.ts`**

Remplacer l'enum `orderStatus` (lignes 20-26) par :

```ts
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "picked_up",
  "cancelled",
]);

export const fulfillmentEnum = pgEnum("fulfillment", ["retrait", "poste"]);
```

Dans la table `orders`, remplacer la ligne `deliveryAddress: text("delivery_address"),` par :

```ts
  fulfillment: fulfillmentEnum("fulfillment").notNull(),
  shippingAddress: text("shipping_address"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingCity: text("shipping_city"),
  shippingCountry: text("shipping_country"),
  trackingNumber: text("tracking_number"),
```

En bas du fichier, après `export type OrderStatus = ...`, ajouter :

```ts
export type Fulfillment = (typeof fulfillmentEnum.enumValues)[number];
```

- [ ] **Step 2: Générer la migration**

Run: `npm run db:generate`
Expected: un nouveau fichier `lib/db/migrations/0001_<nom-aléatoire>.sql` + mise à jour de `meta/_journal.json` et d'un snapshot `meta/0001_snapshot.json`.

- [ ] **Step 3: Remplacer le SQL généré par la version avec backfill**

Le SQL généré par drizzle-kit ne sait ni retirer `delivered` de l'enum proprement, ni migrer les données. Remplacer **tout le contenu** du fichier `.sql` généré par :

```sql
CREATE TYPE "public"."fulfillment" AS ENUM('retrait', 'poste');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment" "fulfillment";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_postal_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_country" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
UPDATE "orders" SET
  "fulfillment" = CASE WHEN "delivery_address" IS NOT NULL THEN 'poste'::"public"."fulfillment" ELSE 'retrait'::"public"."fulfillment" END,
  "shipping_address" = "delivery_address",
  "shipping_country" = CASE WHEN "delivery_address" IS NOT NULL THEN 'FR' END;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "fulfillment" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "delivery_address";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "orders" SET "status" = CASE
  WHEN "status" = 'delivered' AND "fulfillment" = 'poste' THEN 'shipped'
  WHEN "status" = 'delivered' THEN 'picked_up'
  ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'preparing', 'shipped', 'picked_up', 'cancelled');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending';
```

Les marqueurs `--> statement-breakpoint` sont obligatoires (le migrator PGlite découpe sur ce token).

- [ ] **Step 4: Vérifier que la migration s'applique**

Run: `npx vitest run tests/unit/stats.test.ts`
Expected: erreurs **TypeScript/assertions** possibles (compilation de `lib/orders.ts` pas encore adaptée) mais **aucune erreur SQL** du type `syntax error` ou `type "fulfillment" already exists`. Si une erreur SQL apparaît, corriger le fichier `.sql` avant de continuer.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "feat(db): fulfillment, adresse postale structurée, statuts shipped/picked_up"
```

---

### Task 2: Domaine — `lib/order-status.ts`

**Files:**
- Modify: `lib/order-status.ts` (réécriture complète)

- [ ] **Step 1: Réécrire `lib/order-status.ts`**

Contenu complet du fichier :

```ts
// Domaine commandes côté client : machine d'états + constantes partagées.
// Module pur (aucun import runtime serveur), importable depuis les
// composants client comme depuis le serveur.
import type { Fulfillment, OrderStatus } from "./db/schema";

export type { Fulfillment };

// Tarif provisoire (montant Colissimo réel inconnu à ce jour) — à ajuster ici.
export const SHIPPING_FEE_CENTS = 790;

export const SHIPPING_COUNTRY_CODES = [
  "FR",
  "BE",
  "LU",
  "DE",
  "CH",
  "IT",
  "ES",
  "MC",
  "AD",
] as const;
export type ShippingCountryCode = (typeof SHIPPING_COUNTRY_CODES)[number];

export const SHIPPING_COUNTRY_LABELS: Record<ShippingCountryCode, string> = {
  FR: "France",
  BE: "Belgique",
  LU: "Luxembourg",
  DE: "Allemagne",
  CH: "Suisse",
  IT: "Italie",
  ES: "Espagne",
  MC: "Monaco",
  AD: "Andorre",
};

export function isShippingCountry(code: string): code is ShippingCountryCode {
  return (SHIPPING_COUNTRY_CODES as readonly string[]).includes(code);
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  preparing: "En préparation",
  shipped: "Expédiée",
  picked_up: "Retirée",
  cancelled: "Annulée",
};

// Graphe complet. Depuis `preparing`, le statut terminal dépend du mode :
// utiliser statusTransitions(from, fulfillment) pour la liste réellement permise.
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "picked_up", "cancelled"],
  shipped: [],
  picked_up: [],
  cancelled: [],
};

const TERMINAL_BY_FULFILLMENT: Record<Fulfillment, OrderStatus> = {
  poste: "shipped",
  retrait: "picked_up",
};

export function statusTransitions(
  from: OrderStatus,
  fulfillment: Fulfillment,
): OrderStatus[] {
  if (from === "preparing") {
    return [TERMINAL_BY_FULFILLMENT[fulfillment], "cancelled"];
  }
  return STATUS_TRANSITIONS[from];
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: Fulfillment,
): boolean {
  return statusTransitions(from, fulfillment).includes(to);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/order-status.ts
git commit -m "feat: machine d'états dépendante du mode + constantes d'envoi postal"
```

---

### Task 3: `lib/orders.ts` + tests unitaires (TDD)

**Files:**
- Modify: `tests/unit/orders.test.ts`
- Modify: `lib/orders.ts`

- [ ] **Step 1: Mettre à jour les tests (rouges d'abord)**

Dans `tests/unit/orders.test.ts` :

Remplacer l'import ligne 6 :

```ts
import { SHIPPING_FEE_CENTS } from "@/lib/order-status";
```

Remplacer le test `"ajoute les frais de livraison en mode livraison"` par :

```ts
  it("ajoute les frais d'expédition en mode poste", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "estran", qty: 1 }], // 2200
    );
    expect(order.fulfillment).toBe("poste");
    expect(order.deliveryFeeCents).toBe(SHIPPING_FEE_CENTS);
    expect(order.totalCents).toBe(2200 + SHIPPING_FEE_CENTS);
    expect(order.shippingAddress).toContain("quai Valin");
    expect(order.shippingPostalCode).toBe("17000");
    expect(order.shippingCity).toBe("La Rochelle");
    expect(order.shippingCountry).toBe("FR");
  });

  it("n'enregistre pas d'adresse en mode retrait", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "estran", qty: 1 },
    ]);
    expect(order.fulfillment).toBe("retrait");
    expect(order.deliveryFeeCents).toBe(0);
    expect(order.shippingAddress).toBeNull();
    expect(order.shippingCountry).toBeNull();
  });
```

Remplacer le bloc `describe("updateOrderStatus (machine d'états)")` complet par :

```ts
describe("updateOrderStatus (machine d'états)", () => {
  it("suit pending → paid → preparing → picked_up pour un retrait", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    expect((await updateOrderStatus(db, order.id, "paid")).status).toBe("paid");
    expect((await updateOrderStatus(db, order.id, "preparing")).status).toBe("preparing");
    expect((await updateOrderStatus(db, order.id, "picked_up")).status).toBe("picked_up");
  });

  it("suit preparing → shipped pour un envoi postal", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        ...camille,
        fulfillment: "poste",
        shippingAddress: "3 quai Valin",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
      },
      [{ slug: "rivage", qty: 1 }],
    );
    await updateOrderStatus(db, order.id, "paid");
    await updateOrderStatus(db, order.id, "preparing");
    expect((await updateOrderStatus(db, order.id, "shipped")).status).toBe("shipped");
  });

  it("refuse le statut terminal de l'autre mode", async () => {
    const retrait = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await updateOrderStatus(db, retrait.order.id, "paid");
    await updateOrderStatus(db, retrait.order.id, "preparing");
    await expect(
      updateOrderStatus(db, retrait.order.id, "shipped"),
    ).rejects.toThrow(/Transition impossible/);

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
      [{ slug: "rivage", qty: 1 }],
    );
    await updateOrderStatus(db, poste.order.id, "paid");
    await updateOrderStatus(db, poste.order.id, "preparing");
    await expect(
      updateOrderStatus(db, poste.order.id, "picked_up"),
    ).rejects.toThrow(/Transition impossible/);
  });

  it("refuse les transitions illégales", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await expect(updateOrderStatus(db, order.id, "picked_up")).rejects.toThrow(
      /Transition impossible/,
    );
    await updateOrderStatus(db, order.id, "cancelled");
    await expect(updateOrderStatus(db, order.id, "paid")).rejects.toThrow(
      /Transition impossible/,
    );
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("cancelled");
  });
});
```

Ajouter en fin de fichier un test pour `setTrackingNumber` :

```ts
describe("setTrackingNumber", () => {
  it("enregistre puis efface le numéro de suivi", async () => {
    const { order } = await createPendingOrder(db, camille, [
      { slug: "rivage", qty: 1 },
    ]);
    await setTrackingNumber(db, order.id, "6A1234567890123");
    let [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.trackingNumber).toBe("6A1234567890123");

    await setTrackingNumber(db, order.id, null);
    [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.trackingNumber).toBeNull();
  });
});
```

Et ajouter `setTrackingNumber` à l'import depuis `@/lib/orders` (liste lignes 7-16).

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run tests/unit/orders.test.ts`
Expected: FAIL — erreurs de compilation (`SHIPPING_FEE_CENTS`/`setTrackingNumber` inexistants, propriétés `shippingAddress` inconnues de `CheckoutCustomerInput`).

- [ ] **Step 3: Adapter `lib/orders.ts`**

Remplacer l'import et le ré-export (lignes 14-20) :

```ts
import {
  canTransition,
  SHIPPING_FEE_CENTS,
  type Fulfillment,
} from "./order-status";

export { SHIPPING_FEE_CENTS, type Fulfillment };
```

Remplacer `CheckoutCustomerInput` :

```ts
export type CheckoutCustomerInput = {
  name: string;
  email: string;
  phone?: string;
  fulfillment: Fulfillment;
  shippingAddress?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  shippingCountry?: string; // code ISO alpha-2, validé en amont (checkout action)
  deliveryDate?: string; // YYYY-MM-DD
  cardMessage?: string;
};
```

Dans `createPendingOrder`, remplacer le calcul des frais :

```ts
  const deliveryFeeCents =
    customer.fulfillment === "poste" ? SHIPPING_FEE_CENTS : 0;
```

Et dans le `.values({...})` de l'insert, remplacer le bloc `deliveryAddress` par :

```ts
        fulfillment: customer.fulfillment,
        shippingAddress:
          customer.fulfillment === "poste"
            ? (customer.shippingAddress ?? null)
            : null,
        shippingPostalCode:
          customer.fulfillment === "poste"
            ? (customer.shippingPostalCode ?? null)
            : null,
        shippingCity:
          customer.fulfillment === "poste"
            ? (customer.shippingCity ?? null)
            : null,
        shippingCountry:
          customer.fulfillment === "poste"
            ? (customer.shippingCountry ?? null)
            : null,
```

Dans `updateOrderStatus`, remplacer l'appel `canTransition(order.status, to)` par :

```ts
  if (!canTransition(order.status, to, order.fulfillment)) {
```

Ajouter en fin de fichier :

```ts
export async function setTrackingNumber(
  db: Db,
  orderId: string,
  trackingNumber: string | null,
): Promise<void> {
  await db
    .update(orders)
    .set({ trackingNumber })
    .where(eq(orders.id, orderId));
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/unit/orders.test.ts`
Expected: PASS (tous les tests du fichier).

- [ ] **Step 5: Commit**

```bash
git add lib/orders.ts tests/unit/orders.test.ts
git commit -m "feat: commandes avec mode de récupération explicite et adresse postale"
```

---

### Task 4: Stats — statuts encaissés

**Files:**
- Modify: `lib/stats.ts:1-12`

- [ ] **Step 1: Mettre à jour `REVENUE_STATUSES`**

Remplacer le commentaire d'en-tête et la constante :

```ts
// Statistiques back-office : tout est agrégé en SQL sur orders/order_items,
// aucune table dédiée. Le CA ne compte que les commandes encaissées
// (paid → preparing → shipped/picked_up) — jamais pending ni cancelled.
```

```ts
export const REVENUE_STATUSES: OrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "picked_up",
];
```

- [ ] **Step 2: Lancer tous les tests unitaires**

Run: `npm run test`
Expected: PASS — `orders`, `stats` et `webhook` verts (les trois suites compilent désormais).

- [ ] **Step 3: Commit**

```bash
git add lib/stats.ts
git commit -m "feat(stats): shipped/picked_up comptés dans le CA"
```

---

### Task 5: Action serveur checkout

**Files:**
- Modify: `app/checkout/actions.ts`

- [ ] **Step 1: Adapter le schéma Zod et l'appel à `createPendingOrder`**

Ajouter l'import :

```ts
import {
  isShippingCountry,
  type ShippingCountryCode,
} from "@/lib/order-status";
```

Remplacer `CheckoutSchema` (lignes 23-44) par :

```ts
const CheckoutSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Votre nom est requis." })
      .max(120),
    email: z.email({ error: "Adresse email invalide." }),
    phone: z.string().trim().max(25).optional(),
    fulfillment: z.enum(["retrait", "poste"], {
      error: "Choisissez retrait ou envoi postal.",
    }),
    shippingAddress: z.string().trim().max(200).optional(),
    shippingPostalCode: z.string().trim().max(10).optional(),
    shippingCity: z.string().trim().max(100).optional(),
    shippingCountry: z.string().trim().optional(),
    deliveryDate: z
      .union([z.literal(""), z.iso.date({ error: "Date invalide." })])
      .optional(),
    cardMessage: z.string().trim().max(300, { error: "300 caractères max." }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment !== "poste") return;
    if ((v.shippingAddress ?? "").length < 5) {
      ctx.addIssue({
        code: "custom",
        message: "Adresse d'expédition requise.",
        path: ["shippingAddress"],
      });
    }
    const country = v.shippingCountry ?? "";
    if (!isShippingCountry(country)) {
      ctx.addIssue({
        code: "custom",
        message: "Pays de destination non desservi.",
        path: ["shippingCountry"],
      });
      return; // la validation du code postal dépend du pays
    }
    const pc = v.shippingPostalCode ?? "";
    const pcOk =
      country === "FR" ? /^\d{5}$/.test(pc) : pc.length >= 2 && pc.length <= 10;
    if (!pcOk) {
      ctx.addIssue({
        code: "custom",
        message: "Code postal invalide.",
        path: ["shippingPostalCode"],
      });
    }
    if (!(v.shippingCity ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Ville requise.",
        path: ["shippingCity"],
      });
    }
  });
```

Remplacer le `safeParse` (lignes 59-67) par :

```ts
  const parsed = CheckoutSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    fulfillment: formData.get("fulfillment"),
    shippingAddress: formData.get("shippingAddress") ?? "",
    shippingPostalCode: formData.get("shippingPostalCode") ?? "",
    shippingCity: formData.get("shippingCity") ?? "",
    shippingCountry: formData.get("shippingCountry") ?? "",
    deliveryDate: formData.get("deliveryDate") ?? "",
    cardMessage: formData.get("cardMessage") ?? "",
  });
```

Remplacer l'objet client passé à `createPendingOrder` :

```ts
      {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        fulfillment: parsed.data.fulfillment,
        shippingAddress: parsed.data.shippingAddress,
        shippingPostalCode: parsed.data.shippingPostalCode,
        shippingCity: parsed.data.shippingCity,
        shippingCountry: parsed.data.shippingCountry as
          | ShippingCountryCode
          | undefined,
        deliveryDate: parsed.data.deliveryDate || undefined,
        cardMessage: parsed.data.cardMessage,
      },
```

Remplacer le nom de la ligne Stripe de frais (`product_data: { name: "Livraison à vélo — La Rochelle" }`) par :

```ts
                  product_data: { name: "Envoi postal — Colissimo" },
```

- [ ] **Step 2: Commit**

```bash
git add app/checkout/actions.ts
git commit -m "feat(checkout): validation adresse postale et pays desservis"
```

---

### Task 6: Formulaire checkout + CSS

**Files:**
- Modify: `components/checkout-form.tsx` (réécriture complète)
- Modify: `app/globals.css:1246-1266` (styliser `select` comme les inputs)

- [ ] **Step 1: Étendre le CSS aux `select`**

Dans `app/globals.css`, ajouter `.form-field select` aux trois règles existantes (lignes 1246, 1259, 1263) :

```css
.form-field input,
.form-field textarea,
.form-field select {
```

```css
.form-field input:focus,
.form-field textarea:focus,
.form-field select:focus {
```

(la règle `::placeholder` ne s'applique pas aux select — la laisser telle quelle)

- [ ] **Step 2: Réécrire `components/checkout-form.tsx`**

Contenu complet du fichier :

```tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
import {
  SHIPPING_COUNTRY_CODES,
  SHIPPING_COUNTRY_LABELS,
  SHIPPING_FEE_CENTS,
  type Fulfillment,
  type ShippingCountryCode,
} from "@/lib/order-status";
import { startCheckout, type CheckoutState } from "@/app/checkout/actions";
import { ArrowRight } from "./illustrations";

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function CheckoutForm() {
  const { items, subtotalCents, ready } = useCart();
  const [fulfillment, setFulfillment] = useState<Fulfillment>("retrait");
  const [country, setCountry] = useState<ShippingCountryCode>("FR");
  const [state, action, pending] = useActionState<CheckoutState, FormData>(
    startCheckout,
    undefined,
  );

  if (!ready) {
    return <p className="cart-empty body">Chargement…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty reveal is-visible">
        <p className="body body--lg">
          Votre panier est vide — rien à commander pour l&apos;instant.
        </p>
        <Link href="/boutique" className="btn btn--filled" style={{ marginTop: 24 }}>
          Découvrir la boutique <ArrowRight />
        </Link>
      </div>
    );
  }

  const feeCents = fulfillment === "poste" ? SHIPPING_FEE_CENTS : 0;
  const itemsPayload = JSON.stringify(
    items.map((i) => ({ slug: i.slug, qty: i.qty })),
  );

  return (
    <form action={action} className="checkout-grid">
      <input type="hidden" name="items" value={itemsPayload} />

      <div className="checkout-fields">
        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Vos coordonnées</legend>
          <label className="form-field">
            <span>Nom complet *</span>
            <input name="name" required autoComplete="name" placeholder="Camille Martin" />
          </label>
          <label className="form-field">
            <span>Email *</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="camille@exemple.fr"
            />
          </label>
          <label className="form-field">
            <span>Téléphone</span>
            <input name="phone" autoComplete="tel" placeholder="06 12 34 56 78" />
          </label>
        </fieldset>

        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Retrait ou envoi postal</legend>
          <div className="checkout-fulfillment" role="radiogroup">
            <label className={`checkout-choice${fulfillment === "retrait" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="fulfillment"
                value="retrait"
                checked={fulfillment === "retrait"}
                onChange={() => setFulfillment("retrait")}
              />
              <span className="checkout-choice__title">Retrait atelier</span>
              <span className="checkout-choice__desc">
                12 rue du Gabut, La Rochelle — gratuit
              </span>
            </label>
            <label className={`checkout-choice${fulfillment === "poste" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="fulfillment"
                value="poste"
                checked={fulfillment === "poste"}
                onChange={() => setFulfillment("poste")}
              />
              <span className="checkout-choice__title">Envoi par la poste</span>
              <span className="checkout-choice__desc">
                Colissimo, France et pays limitrophes —{" "}
                {formatEuros(SHIPPING_FEE_CENTS)}
              </span>
            </label>
          </div>

          {fulfillment === "poste" && (
            <>
              <label className="form-field">
                <span>Adresse d&apos;expédition *</span>
                <input
                  name="shippingAddress"
                  required
                  maxLength={200}
                  autoComplete="street-address"
                  placeholder="3 quai Valin"
                />
              </label>
              <label className="form-field">
                <span>Code postal *</span>
                <input
                  name="shippingPostalCode"
                  required
                  maxLength={10}
                  autoComplete="postal-code"
                  inputMode={country === "FR" ? "numeric" : "text"}
                  pattern={country === "FR" ? "\\d{5}" : undefined}
                  placeholder={country === "FR" ? "17000" : ""}
                />
              </label>
              <label className="form-field">
                <span>Ville *</span>
                <input
                  name="shippingCity"
                  required
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder="La Rochelle"
                />
              </label>
              <label className="form-field">
                <span>Pays *</span>
                <select
                  name="shippingCountry"
                  value={country}
                  onChange={(e) =>
                    setCountry(e.target.value as ShippingCountryCode)
                  }
                >
                  {SHIPPING_COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {SHIPPING_COUNTRY_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="form-field">
            <span>
              {fulfillment === "poste"
                ? "Date d'expédition souhaitée"
                : "Date de retrait souhaitée"}{" "}
              <em>(optionnel — sous réserve de confirmation)</em>
            </span>
            <input type="date" name="deliveryDate" min={tomorrowISO()} />
          </label>

          <label className="form-field">
            <span>
              Message pour la carte <em>(optionnel)</em>
            </span>
            <textarea
              name="cardMessage"
              rows={2}
              maxLength={300}
              placeholder="Joyeux anniversaire…"
            />
          </label>
        </fieldset>
      </div>

      <aside className="cart-summary">
        <h2 className="eyebrow">Votre commande</h2>
        <ul className="checkout-recap">
          {items.map((i) => (
            <li key={i.slug} className="cart-summary__row">
              <span>
                {i.name} × {i.qty}
              </span>
              <span>{formatEuros(i.priceCents * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="cart-summary__row">
          <span>Sous-total</span>
          <span>{formatEuros(subtotalCents)}</span>
        </div>
        <div className="cart-summary__row">
          <span>{fulfillment === "poste" ? "Envoi postal" : "Retrait"}</span>
          <span>{feeCents === 0 ? "offert" : formatEuros(feeCents)}</span>
        </div>
        <div className="cart-summary__row cart-summary__row--total">
          <span>Total</span>
          <span data-testid="checkout-total">
            {formatEuros(subtotalCents + feeCents)}
          </span>
        </div>

        {state?.error && (
          <p role="alert" className="checkout-error">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn btn--filled cart-summary__cta"
        >
          {pending ? "Redirection…" : "Payer avec Stripe"} <ArrowRight />
        </button>
        <p className="cart-summary__note">
          Paiement sécurisé par Stripe. Vous serez redirigé·e vers la page de
          paiement.
        </p>
      </aside>
    </form>
  );
}
```

- [ ] **Step 3: Vérification visuelle rapide**

Run: `npm run dev` puis ouvrir `http://localhost:3000/checkout` avec un article au panier.
Expected: choix « Envoi par la poste » → les 4 champs apparaissent, le select Pays est stylé comme les inputs, le total ajoute 7,90€ ; choix « Retrait atelier » → champs masqués, libellé date « Date de retrait souhaitée ». Arrêter le serveur ensuite.

- [ ] **Step 4: Commit**

```bash
git add components/checkout-form.tsx app/globals.css
git commit -m "feat(checkout): formulaire envoi postal avec adresse structurée et pays"
```

---

### Task 7: Page de confirmation

**Files:**
- Modify: `app/commande/confirmee/page.tsx:77-94`

- [ ] **Step 1: Adapter les libellés**

Remplacer la ligne de frais (lignes 77-82) :

```tsx
                    {data.order.deliveryFeeCents > 0 && (
                      <li className="cart-summary__row">
                        <span>Envoi postal</span>
                        <span>{formatEuros(data.order.deliveryFeeCents)}</span>
                      </li>
                    )}
```

Remplacer la note (lignes 88-94) :

```tsx
                  <p className="cart-summary__note">
                    Un email de confirmation Stripe a été envoyé à{" "}
                    {data.order.customerEmail}.{" "}
                    {data.order.fulfillment === "poste"
                      ? "Votre commande partira par la poste très vite."
                      : "Votre commande vous attendra à l'atelier, 12 rue du Gabut."}
                  </p>
```

- [ ] **Step 2: Commit**

```bash
git add app/commande/confirmee/page.tsx
git commit -m "feat(confirmation): libellés envoi postal"
```

---

### Task 8: Admin — badge, transitions, liste, détail, n° de suivi

**Files:**
- Modify: `app/(admin)/admin/(panel)/commandes/status-badge.tsx`
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`
- Modify: `app/(admin)/admin/(panel)/commandes/actions.ts`
- Create: `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`
- Modify: `app/(admin)/admin/(panel)/commandes/page.tsx:68-70`

- [ ] **Step 1: Badge de statut**

Dans `status-badge.tsx`, remplacer `STYLES` :

```ts
const STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  preparing: "bg-blue-100 text-blue-800",
  shipped: "bg-violet-100 text-violet-800",
  picked_up: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-800",
};
```

- [ ] **Step 2: Boutons de transition selon le mode**

Dans `status-actions.tsx` :

Remplacer l'import ligne 5 :

```ts
import { statusTransitions, STATUS_LABELS } from "@/lib/order-status";
import type { Fulfillment, OrderStatus } from "@/lib/db/schema";
```

(supprimer l'import `OrderStatus` de la ligne 4 existante)

Remplacer `ACTION_LABELS` :

```ts
const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  paid: "Marquer payée",
  preparing: "Passer en préparation",
  shipped: "Marquer expédiée",
  picked_up: "Marquer retirée",
  cancelled: "Annuler la commande",
};
```

Ajouter la prop `fulfillment` et l'utiliser :

```ts
export function StatusActions({
  orderId,
  status,
  fulfillment,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
}) {
```

et remplacer `const targets = STATUS_TRANSITIONS[status];` par :

```ts
  const targets = statusTransitions(status, fulfillment);
```

- [ ] **Step 3: Action serveur n° de suivi**

Dans `app/(admin)/admin/(panel)/commandes/actions.ts`, remplacer l'import de `lib/orders` :

```ts
import { setTrackingNumber, updateOrderStatus } from "@/lib/orders";
```

et ajouter en fin de fichier :

```ts
const TrackingSchema = z.object({
  orderId: z.uuid(),
  trackingNumber: z.string().trim().max(40),
});

export async function saveTrackingNumber(
  orderId: string,
  trackingNumber: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = TrackingSchema.safeParse({ orderId, trackingNumber });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    await setTrackingNumber(
      db,
      parsed.data.orderId,
      parsed.data.trackingNumber || null,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}
```

- [ ] **Step 4: Composant formulaire de suivi**

Créer `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { saveTrackingNumber, type StatusActionState } from "../actions";

export function TrackingForm({
  orderId,
  trackingNumber,
}: {
  orderId: string;
  trackingNumber: string | null;
}) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(
    async (_prev, formData) =>
      saveTrackingNumber(orderId, String(formData.get("trackingNumber") ?? "")),
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="trackingNumber"
        defaultValue={trackingNumber ?? ""}
        placeholder="N° de suivi Colissimo"
        maxLength={40}
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-wine px-3.5 py-2 text-sm font-semibold text-linen transition hover:bg-wine-dark disabled:opacity-60"
      >
        Enregistrer
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Page détail commande**

Dans `app/(admin)/admin/(panel)/commandes/[id]/page.tsx` :

Ajouter les imports :

```ts
import {
  SHIPPING_COUNTRY_LABELS,
  isShippingCountry,
} from "@/lib/order-status";
import { TrackingForm } from "./tracking-form";
```

Remplacer la ligne `<dt className="text-stone-500">Livraison</dt>` et son `<dd>` (lignes 71-77) :

```tsx
              <div className="flex justify-between">
                <dt className="text-stone-500">Expédition</dt>
                <dd>
                  {order.deliveryFeeCents > 0
                    ? formatEuros(order.deliveryFeeCents)
                    : "Retrait atelier — offert"}
                </dd>
              </div>
```

Remplacer `<StatusActions orderId={order.id} status={order.status} />` par :

```tsx
            <StatusActions
              orderId={order.id}
              status={order.status}
              fulfillment={order.fulfillment}
            />
```

Remplacer le bloc adresse (lignes 103-117) :

```tsx
            <div className="mt-4 border-t border-stone-200 pt-4">
              <p className="mb-1 font-medium">
                {order.fulfillment === "poste"
                  ? "Envoi par la poste"
                  : "Retrait atelier"}
              </p>
              {order.fulfillment === "poste" && (
                <p className="text-stone-600">
                  {order.shippingAddress}
                  <br />
                  {order.shippingPostalCode} {order.shippingCity}
                  {order.shippingCountry &&
                    isShippingCountry(order.shippingCountry) &&
                    order.shippingCountry !== "FR" && (
                      <> — {SHIPPING_COUNTRY_LABELS[order.shippingCountry]}</>
                    )}
                </p>
              )}
              {order.deliveryDate && (
                <p className="mt-1 text-stone-600">
                  Date souhaitée : {order.deliveryDate}
                </p>
              )}
            </div>
            {order.fulfillment === "poste" && (
              <div className="mt-4 border-t border-stone-200 pt-4">
                <p className="mb-2 font-medium">Suivi Colissimo</p>
                <TrackingForm
                  orderId={order.id}
                  trackingNumber={order.trackingNumber}
                />
              </div>
            )}
```

- [ ] **Step 6: Liste des commandes**

Dans `app/(admin)/admin/(panel)/commandes/page.tsx`, remplacer la cellule Mode (lignes 68-70) :

```tsx
                  <td className="px-4 py-3 text-stone-600">
                    {o.fulfillment === "poste" ? "Envoi postal" : "Retrait"}
                  </td>
```

- [ ] **Step 7: Typecheck complet**

Run: `npm run typecheck`
Expected: PASS — plus aucune référence à `delivered`, `deliveryAddress`, `DELIVERY_FEE_CENTS` ou `"livraison"`. En cas d'échec, le message pointe la référence oubliée.

Run: `grep -rn "delivered\|deliveryAddress\|DELIVERY_FEE_CENTS" app lib components --include="*.ts" --include="*.tsx"`
Expected: aucun résultat.

- [ ] **Step 8: Tests unitaires**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "app/(admin)/admin/(panel)/commandes/"
git commit -m "feat(admin): mode de récupération, statuts expédiée/retirée, n° de suivi"
```

---

### Task 9: Test E2E checkout

**Files:**
- Modify: `tests/e2e/05-checkout.spec.ts`

- [ ] **Step 1: Adapter le parcours au mode postal**

Panier inchangé : rivage (48€) + 2 × estran (22€) = 92€ ; envoi postal +7,90€ → total « 99,90€ ».

Remplacer le bloc formulaire (lignes 69-80) :

```ts
  // Formulaire : envoi postal (+7,90€) → total 99,90€
  await page.getByLabel("Nom complet *").fill("Camille Martin");
  await page.getByLabel("Email *").fill("camille.test@exemple.fr");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");
  await page.getByText("Envoi par la poste").click();
  await page.getByLabel("Adresse d'expédition *").fill("3 quai Valin");
  await page.getByLabel("Code postal *").fill("17000");
  await page.getByLabel("Ville *").fill("La Rochelle");
  // Le select pays ne propose que la France et ses voisins, France par défaut
  await expect(page.getByLabel("Pays *")).toHaveValue("FR");
  await expect(page.getByLabel("Pays *").locator("option")).toHaveCount(9);
  await page
    .getByLabel("Message pour la carte", { exact: false })
    .fill("Pour les tests, avec amour.");
  await expect(page.getByTestId("checkout-total")).toHaveText("99,90€");
```

Dans les assertions de confirmation (lignes 90-94), remplacer `"101€"` par `"99,90€"`.

- [ ] **Step 2: Adapter le test admin**

Dans le deuxième test :

- ligne 116-117 : remplacer `"101€"` par `"99,90€"` et `"Livraison"` par `"Envoi postal"`;
- après l'assertion `quai Valin` (ligne 123), ajouter :

```ts
  await expect(page.getByText("17000 La Rochelle")).toBeVisible();
  await expect(page.getByText("Envoi par la poste")).toBeVisible();
```

- remplacer les transitions (lignes 126-129) :

```ts
  await page.getByRole("button", { name: "Passer en préparation" }).click();
  await expect(page.getByText("En préparation").first()).toBeVisible();

  // N° de suivi Colissimo
  await page.getByPlaceholder("N° de suivi Colissimo").fill("6A1234567890123");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.reload();
  await expect(page.getByPlaceholder("N° de suivi Colissimo")).toHaveValue(
    "6A1234567890123",
  );

  await page.getByRole("button", { name: "Marquer expédiée" }).click();
  await expect(page.getByText("Expédiée").first()).toBeVisible();
```

- [ ] **Step 3: Adapter le test KPIs**

Dans le troisième test, remplacer `"101€"` par `"99,90€"` (kpi-revenue et kpi-aov).

- [ ] **Step 4: Lancer la suite E2E**

Run: `npm run test:e2e`
Expected: PASS (réseau requis — Stripe mode test ; `.env.test` doit être configuré comme avant).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/05-checkout.spec.ts
git commit -m "test(e2e): parcours checkout en envoi postal avec suivi Colissimo"
```

---

### Task 10: Vérification finale + migration de la base de dev

**Files:**
- Aucun nouveau fichier (vérifications)

- [ ] **Step 1: Vérifications croisées**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: tout PASS.

```bash
grep -rn "livraison\|Livraison" app lib components tests --include="*.ts" --include="*.tsx"
```
Expected: aucun résultat (ou uniquement des occurrences volontaires, à justifier).

- [ ] **Step 2: Migrer la base de dev**

Run: `npm run db:migrate`
Expected: migration `0001` appliquée sans erreur sur la base `DATABASE_URL` (Supabase). Vérifier ensuite que `/admin/commandes` s'affiche correctement avec `npm run dev` si des commandes existaient.

- [ ] **Step 3: Commit final (si reliquats)**

```bash
git status
```
Expected: arbre propre — sinon committer les reliquats avec un message approprié.
