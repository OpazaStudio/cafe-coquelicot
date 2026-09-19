# Colissimo à domicile — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proposer au checkout le choix entre point relais Mondial Relay et livraison à domicile Colissimo (étiquette manuelle), avec les deux forfaits modifiables dans l'admin.

**Architecture:** On réutilise la valeur d'enum `poste` et les colonnes d'adresse existantes de `orders` (aucune migration). Les forfaits vivent dans la table `settings` (nouveau type de champ `price`), sont lus côté serveur par la page checkout et par `createPendingOrder`, jamais depuis le client. Le formulaire checkout gagne un choix radio qui bascule entre le `RelayPicker` existant et trois champs d'adresse ; la validation serveur devient une union discriminée Zod extraite dans un module pur.

**Tech Stack:** Next.js App Router (server components + server actions), Drizzle, Zod 4, Vitest + Testing Library, Playwright (PGlite), Stripe Checkout hébergé.

**Spec:** `docs/superpowers/specs/2026-09-19-colissimo-domicile-design.md`

## Global Constraints

- **Aucun commit** dans ce plan : l'utilisateur committe lui-même quand il le décide (règle globale du projet). Les tâches se terminent par des vérifications, pas par `git commit`.
- **Aucun commentaire dans le code** (ni JSDoc, ni inline). Les commentaires déjà présents dans les fichiers touchés ne sont pas modifiés, sauf ceux que la spec demande explicitement de supprimer.
- **Aucune migration** : l'enum `fulfillment` garde `retrait | poste | mondial_relay`. `poste` = Colissimo.
- **France métropolitaine** : code postal `^\d{5}$`, préfixes `97` et `98` refusés, pays forcé `FR`.
- Défauts : Mondial Relay `490` centimes (`"4,90"`), Colissimo `790` centimes (`"7,90"`).
- Libellés UI : « Mondial Relay », « Colissimo », « Retrait ». Ligne Stripe : « Livraison Mondial Relay — point relais » / « Livraison Colissimo — à domicile ».
- Ce projet utilise une version de Next.js différente de celle de l'entraînement : lire `node_modules/next/dist/docs/` en cas de doute sur une API (`PageProps`, `revalidatePath`, `dynamic`).
- Commandes shell à préfixer par `rtk` (`rtk vitest run …`, `rtk tsc --noEmit`, `rtk eslint …`, `rtk playwright test …`).
- Les tests PGlite peuvent échouer avec `STACK_TRACE_ERROR` quand toute la suite tourne en parallèle : relancer le fichier seul avant de conclure à une régression.

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `lib/order-status.ts` | Domaine pur : forfaits par défaut, `ShippingFees`, conversion prix ↔ centimes, libellés par mode | Modifier |
| `lib/settings-fields.ts` | Clés de paramètres, type de champ `price`, `shippingFeesFromSettings` | Modifier |
| `app/(admin)/admin/(panel)/settings-form.tsx` | Rendu `inputMode="decimal"` pour les champs `price` | Modifier |
| `app/(admin)/admin/(panel)/parametres/actions.ts` | Revalidation de `/checkout` et `/panier` | Modifier |
| `lib/orders.ts` | `createPendingOrder(db, customer, items, fees)` | Modifier |
| `app/checkout/schema.ts` | Zod union discriminée + conversion vers `CheckoutCustomerInput` | Créer |
| `app/checkout/actions.ts` | Utilise le schéma, lit les frais, libellé Stripe par mode | Modifier |
| `app/checkout/page.tsx` | Server component async, passe `fees` | Modifier |
| `components/checkout-form.tsx` | Radio mode + champs adresse | Modifier |
| `app/globals.css` | `.checkout-choice { position: relative }` | Modifier |
| `app/(admin)/admin/(panel)/commandes/orders-table.tsx`, `kanban-board.tsx` | Libellé par mode via `FULFILLMENT_LABELS` | Modifier |
| `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`, `tracking-form.tsx` | Bloc Colissimo, suivi pour les deux modes | Modifier |
| `app/commande/confirmee/page.tsx` | Phrase Colissimo | Modifier |
| `components/legal/livraison-retours.tsx`, `components/legal/cgv.tsx`, `app/livraison-retours/page.tsx` | Deux modes, frais depuis les paramètres | Modifier |
| `tests/unit/order-status.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/orders.test.ts`, `tests/unit/legal-content.test.tsx` | Tests unitaires | Modifier |
| `tests/unit/checkout-schema.test.ts` | Tests du schéma | Créer |
| `tests/e2e/12-checkout-colissimo.spec.ts` | Parcours Colissimo + frais éditable | Créer |

---

### Task 1 : Domaine des forfaits (`lib/order-status.ts`)

**Files:**
- Modify: `lib/order-status.ts`
- Test: `tests/unit/order-status.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MONDIAL_RELAY_FEE_CENTS = 490;
  export const COLISSIMO_FEE_CENTS = 790;
  export type ShippingFees = { mondialRelay: number; colissimo: number };
  export const DEFAULT_SHIPPING_FEES: ShippingFees;
  export function parseFeeInput(raw: string): number | null;
  export function formatFeeInput(cents: number): string;
  export function shippingFeeFor(fulfillment: Fulfillment, fees: ShippingFees): number;
  export const FULFILLMENT_LABELS: Record<Fulfillment, string>;
  export const SHIPPING_LINE_LABELS: Record<Fulfillment, string>;
  ```

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `tests/unit/order-status.test.ts` (et compléter l'import) :

```ts
import {
  COLISSIMO_FEE_CENTS,
  DEFAULT_SHIPPING_FEES,
  FULFILLMENT_LABELS,
  MONDIAL_RELAY_FEE_CENTS,
  SHIPPING_COUNTRY_CODES,
  SHIPPING_LINE_LABELS,
  canTransition,
  formatFeeInput,
  isShippingCountry,
  parseFeeInput,
  shippingFeeFor,
  statusTransitions,
} from "@/lib/order-status";

describe("order-status — forfaits de livraison", () => {
  it("parseFeeInput accepte virgule, point, entier et décimale unique", () => {
    expect(parseFeeInput("7,90")).toBe(790);
    expect(parseFeeInput("7.90")).toBe(790);
    expect(parseFeeInput("7,9")).toBe(790);
    expect(parseFeeInput("7")).toBe(700);
    expect(parseFeeInput(" 4,90 ")).toBe(490);
    expect(parseFeeInput("0")).toBe(0);
  });

  it("parseFeeInput renvoie null pour vide ou invalide", () => {
    expect(parseFeeInput("")).toBeNull();
    expect(parseFeeInput("abc")).toBeNull();
    expect(parseFeeInput("7,999")).toBeNull();
    expect(parseFeeInput("-1")).toBeNull();
    expect(parseFeeInput("12345")).toBeNull();
  });

  it("formatFeeInput écrit le montant à la française", () => {
    expect(formatFeeInput(490)).toBe("4,90");
    expect(formatFeeInput(790)).toBe("7,90");
    expect(formatFeeInput(0)).toBe("0,00");
  });

  it("les défauts reprennent les constantes", () => {
    expect(DEFAULT_SHIPPING_FEES).toEqual({
      mondialRelay: MONDIAL_RELAY_FEE_CENTS,
      colissimo: COLISSIMO_FEE_CENTS,
    });
    expect(COLISSIMO_FEE_CENTS).toBe(790);
  });

  it("shippingFeeFor choisit le forfait selon le mode", () => {
    const fees = { mondialRelay: 111, colissimo: 222 };
    expect(shippingFeeFor("mondial_relay", fees)).toBe(111);
    expect(shippingFeeFor("poste", fees)).toBe(222);
    expect(shippingFeeFor("retrait", fees)).toBe(0);
  });

  it("chaque mode a un libellé admin et une ligne Stripe", () => {
    expect(FULFILLMENT_LABELS).toEqual({
      retrait: "Retrait",
      poste: "Colissimo",
      mondial_relay: "Mondial Relay",
    });
    expect(SHIPPING_LINE_LABELS.poste).toBe("Livraison Colissimo — à domicile");
    expect(SHIPPING_LINE_LABELS.mondial_relay).toBe("Livraison Mondial Relay — point relais");
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `rtk vitest run tests/unit/order-status.test.ts`
Expected: FAIL, exports `COLISSIMO_FEE_CENTS`, `parseFeeInput`… introuvables.

- [ ] **Step 3 : Implémenter**

Dans `lib/order-status.ts`, remplacer le bloc `MONDIAL_RELAY_FEE_CENTS` par :

```ts
export const MONDIAL_RELAY_FEE_CENTS = 490;
export const COLISSIMO_FEE_CENTS = 790;

export type ShippingFees = { mondialRelay: number; colissimo: number };

export const DEFAULT_SHIPPING_FEES: ShippingFees = {
  mondialRelay: MONDIAL_RELAY_FEE_CENTS,
  colissimo: COLISSIMO_FEE_CENTS,
};

const PRICE_INPUT = /^\d{1,4}([.,]\d{1,2})?$/;

export function parseFeeInput(raw: string): number | null {
  const value = raw.trim();
  if (!PRICE_INPUT.test(value)) return null;
  const [units, decimals = ""] = value.split(/[.,]/);
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}

export function formatFeeInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function shippingFeeFor(fulfillment: Fulfillment, fees: ShippingFees): number {
  switch (fulfillment) {
    case "mondial_relay":
      return fees.mondialRelay;
    case "poste":
      return fees.colissimo;
    case "retrait":
      return 0;
  }
}

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  retrait: "Retrait",
  poste: "Colissimo",
  mondial_relay: "Mondial Relay",
};

export const SHIPPING_LINE_LABELS: Record<Fulfillment, string> = {
  retrait: "Retrait à l'atelier",
  poste: "Livraison Colissimo — à domicile",
  mondial_relay: "Livraison Mondial Relay — point relais",
};
```

Supprimer le commentaire « Forfait Mondial Relay (point relais) — à caler sur le contrat. Provisoire. » qui précédait la constante (il ne décrit plus le bloc).

- [ ] **Step 4 : Vérifier le succès**

Run: `rtk vitest run tests/unit/order-status.test.ts`
Expected: PASS.

---

### Task 2 : Frais éditables dans les paramètres

**Files:**
- Modify: `lib/settings-fields.ts`
- Modify: `app/(admin)/admin/(panel)/settings-form.tsx`
- Modify: `app/(admin)/admin/(panel)/parametres/actions.ts`
- Test: `tests/unit/settings.test.ts`

**Interfaces:**
- Consumes (Task 1) : `DEFAULT_SHIPPING_FEES`, `formatFeeInput`, `parseFeeInput`, `ShippingFees`.
- Produces :
  ```ts
  // nouvelles clés : "shipping_fee_mondial_relay" | "shipping_fee_colissimo" | "shipping_delay_colissimo"
  // SettingField.kind gagne "price"
  export function shippingFeesFromSettings(values: Settings): ShippingFees;
  ```

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `tests/unit/settings.test.ts`, étendre l'import :

```ts
import {
  DEFAULT_SETTINGS,
  SETTING_FIELDS,
  parseSettings,
  querySettings,
  readSettingsForm,
  saveSettings,
  shippingFeesFromSettings,
  type SettingKey,
} from "@/lib/settings";
```

Ajouter dans `describe("readSettingsForm", …)` :

```ts
  it("accepte un frais de livraison à la française ou vide", () => {
    expect(readSettingsForm(form({ shipping_fee_colissimo: "7,90" })).ok).toBe(true);
    expect(readSettingsForm(form({ shipping_fee_colissimo: "7.9" })).ok).toBe(true);
    expect(readSettingsForm(form({ shipping_fee_colissimo: "" })).ok).toBe(true);
  });

  it("refuse un frais de livraison qui n'est pas un montant", () => {
    for (const bad of ["abc", "7,999", "-1", "1 000"]) {
      const r = readSettingsForm(form({ shipping_fee_mondial_relay: bad }));
      expect(r.ok, bad).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatch(/Frais Mondial Relay/);
    }
  });
```

Ajouter un nouveau `describe` :

```ts
describe("shippingFeesFromSettings", () => {
  it("renvoie les défauts quand les champs sont vides", () => {
    expect(shippingFeesFromSettings({ ...DEFAULT_SETTINGS, shipping_fee_mondial_relay: "", shipping_fee_colissimo: "" }))
      .toEqual({ mondialRelay: 490, colissimo: 790 });
  });

  it("les défauts eux-mêmes valent 4,90 et 7,90", () => {
    expect(DEFAULT_SETTINGS.shipping_fee_mondial_relay).toBe("4,90");
    expect(DEFAULT_SETTINGS.shipping_fee_colissimo).toBe("7,90");
    expect(shippingFeesFromSettings(DEFAULT_SETTINGS)).toEqual({ mondialRelay: 490, colissimo: 790 });
  });

  it("convertit les montants saisis et replie clé par clé sur le défaut", () => {
    expect(shippingFeesFromSettings({ ...DEFAULT_SETTINGS, shipping_fee_colissimo: "9,50" }))
      .toEqual({ mondialRelay: 490, colissimo: 950 });
    expect(shippingFeesFromSettings({ ...DEFAULT_SETTINGS, shipping_fee_mondial_relay: "n/a", shipping_fee_colissimo: "0" }))
      .toEqual({ mondialRelay: 490, colissimo: 0 });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `rtk vitest run tests/unit/settings.test.ts`
Expected: FAIL (`shippingFeesFromSettings` introuvable, clés inconnues).

- [ ] **Step 3 : Implémenter dans `lib/settings-fields.ts`**

Import en tête :

```ts
import {
  DEFAULT_SHIPPING_FEES,
  formatFeeInput,
  parseFeeInput,
  type ShippingFees,
} from "./order-status";
```

`SettingField.kind` :

```ts
  kind?: "text" | "email" | "tel" | "url" | "price";
```

Dans `SETTING_KEYS`, après `"shipping_delay"` :

```ts
  "shipping_delay_colissimo",
  "shipping_fee_mondial_relay",
  "shipping_fee_colissimo",
```

Dans `SETTING_FIELDS`, remplacer l'entrée `shipping_delay` et ajouter à sa suite :

```ts
  {
    key: "shipping_fee_mondial_relay",
    label: "Frais Mondial Relay (€)",
    group: "shipping",
    kind: "price",
    hint: "Ex. 4,90 — appliqué aux nouvelles commandes.",
  },
  {
    key: "shipping_delay",
    label: "Délai d'acheminement Mondial Relay",
    group: "shipping",
    hint: "Ex. 2 à 4 jours ouvrés après dépôt.",
  },
  {
    key: "shipping_fee_colissimo",
    label: "Frais Colissimo (€)",
    group: "shipping",
    kind: "price",
    hint: "Ex. 7,90 — appliqué aux nouvelles commandes.",
  },
  {
    key: "shipping_delay_colissimo",
    label: "Délai d'acheminement Colissimo",
    group: "shipping",
    hint: "Ex. 2 à 3 jours ouvrés après dépôt.",
  },
```

Dans `DEFAULT_SETTINGS`, après `shipping_delay: ""` :

```ts
  shipping_delay_colissimo: "",
  shipping_fee_mondial_relay: formatFeeInput(DEFAULT_SHIPPING_FEES.mondialRelay),
  shipping_fee_colissimo: formatFeeInput(DEFAULT_SHIPPING_FEES.colissimo),
```

Dans `fieldSchema`, après le bloc `email` :

```ts
  if (field.kind === "price") {
    schema = schema.refine((v) => v === "" || parseFeeInput(v) !== null, {
      error: `${field.label} : montant invalide (ex. 4,90).`,
    }) as unknown as typeof schema;
  }
```

Après `emailTemplatesFromSettings` :

```ts
export function shippingFeesFromSettings(values: Settings): ShippingFees {
  return {
    mondialRelay:
      parseFeeInput(values.shipping_fee_mondial_relay) ?? DEFAULT_SHIPPING_FEES.mondialRelay,
    colissimo:
      parseFeeInput(values.shipping_fee_colissimo) ?? DEFAULT_SHIPPING_FEES.colissimo,
  };
}
```

- [ ] **Step 4 : Rendu du champ `price` dans `settings-form.tsx`**

Remplacer le `<input …>` non multiline par :

```tsx
                  <input
                    type={field.kind === "price" || !field.kind ? "text" : field.kind}
                    inputMode={field.kind === "price" ? "decimal" : undefined}
                    name={field.key}
                    defaultValue={initial[field.key]}
                    maxLength={fieldMaxLength(field)}
                    className={input}
                  />
```

- [ ] **Step 5 : Revalidation du checkout dans `parametres/actions.ts`**

Après `revalidatePath("/");` ajouter :

```ts
  revalidatePath("/checkout");
  revalidatePath("/panier");
```

- [ ] **Step 6 : Vérifier**

Run: `rtk vitest run tests/unit/settings.test.ts && rtk tsc --noEmit`
Expected: PASS, aucune erreur TypeScript.

---

### Task 3 : `createPendingOrder` prend les frais en paramètre

**Files:**
- Modify: `lib/orders.ts`
- Test: `tests/unit/orders.test.ts`

**Interfaces:**
- Consumes (Task 1) : `DEFAULT_SHIPPING_FEES`, `shippingFeeFor`, `ShippingFees`.
- Produces :
  ```ts
  export async function createPendingOrder(
    db: Db,
    customer: CheckoutCustomerInput,
    items: CheckoutItemInput[],
    fees: ShippingFees = DEFAULT_SHIPPING_FEES,
  ): Promise<{ order: OrderRow; items: OrderItemRow[] }>;
  ```
  (signature existante + 4ᵉ paramètre optionnel ; le type de retour ne change pas.)

- [ ] **Step 1 : Adapter et ajouter les tests**

Dans `tests/unit/orders.test.ts`, étendre l'import :

```ts
import { CARD_FEE_CENTS, COLISSIMO_FEE_CENTS, MONDIAL_RELAY_FEE_CENTS } from "@/lib/order-status";
```

Remplacer le test `"ajoute les frais d'expédition en mode poste"` par :

```ts
  it("applique le forfait Colissimo par défaut en mode poste et garde l'adresse client", async () => {
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
      [{ slug: "estran", qty: 1 }],
    );
    expect(order.fulfillment).toBe("poste");
    expect(order.deliveryFeeCents).toBe(COLISSIMO_FEE_CENTS);
    expect(order.totalCents).toBe(2200 + COLISSIMO_FEE_CENTS);
    expect(order.shippingAddress).toContain("quai Valin");
    expect(order.shippingPostalCode).toBe("17000");
    expect(order.shippingCity).toBe("La Rochelle");
    expect(order.shippingCountry).toBe("FR");
    expect(order.relayPointId).toBeNull();
    expect(order.relayPointName).toBeNull();
  });

  it("applique le forfait Mondial Relay par défaut en mode mondial_relay", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        ...camille,
        phone: "0612345678",
        fulfillment: "mondial_relay",
        relayPointId: "012345",
        relayPointName: "Tabac de la Gare",
        relayStreet: "1 rue des Lilas",
        relayPostalCode: "17000",
        relayCity: "La Rochelle",
      },
      [{ slug: "estran", qty: 1 }],
    );
    expect(order.deliveryFeeCents).toBe(MONDIAL_RELAY_FEE_CENTS);
    expect(order.totalCents).toBe(2200 + MONDIAL_RELAY_FEE_CENTS);
  });

  it("utilise les forfaits transmis (paramètres admin) selon le mode", async () => {
    const fees = { mondialRelay: 350, colissimo: 950 };
    const poste = await createPendingOrder(
      db,
      { ...camille, fulfillment: "poste", shippingAddress: "3 quai Valin", shippingPostalCode: "17000", shippingCity: "La Rochelle", shippingCountry: "FR" },
      [{ slug: "estran", qty: 1 }],
      fees,
    );
    expect(poste.order.deliveryFeeCents).toBe(950);
    const relay = await createPendingOrder(
      db,
      { ...camille, fulfillment: "mondial_relay", relayPointId: "012345", relayPointName: "Tabac", relayStreet: "1 rue des Lilas", relayPostalCode: "17000", relayCity: "La Rochelle" },
      [{ slug: "estran", qty: 1 }],
      fees,
    );
    expect(relay.order.deliveryFeeCents).toBe(350);
    const retrait = await createPendingOrder(db, camille, [{ slug: "estran", qty: 1 }], fees);
    expect(retrait.order.deliveryFeeCents).toBe(0);
  });
```

Vérifier avec `rtk grep -n "MONDIAL_RELAY_FEE_CENTS" tests/unit/orders.test.ts` qu'aucun autre test du fichier ne suppose le forfait Mondial Relay pour une commande `poste` ; corriger le cas échéant en `COLISSIMO_FEE_CENTS`.

- [ ] **Step 2 : Vérifier l'échec**

Run: `rtk vitest run tests/unit/orders.test.ts`
Expected: FAIL sur les trois tests ci-dessus (forfait Mondial Relay appliqué au mode poste, 4ᵉ argument ignoré).

- [ ] **Step 3 : Implémenter dans `lib/orders.ts`**

Import depuis `./order-status` :

```ts
import {
  canTransition,
  CARD_FEE_CENTS,
  DEFAULT_SHIPPING_FEES,
  MONDIAL_RELAY_FEE_CENTS,
  shippingFeeFor,
  type Fulfillment,
  type ShippingCountryCode,
  type ShippingFees,
} from "./order-status";
```

Signature de `createPendingOrder` : ajouter `fees: ShippingFees = DEFAULT_SHIPPING_FEES` en 4ᵉ paramètre.

Remplacer :

```ts
  // Seul `mondial_relay` est créé par le checkout aujourd'hui ; `poste` est un
  // mode historique. Tout envoi (non-retrait) porte le forfait Mondial Relay.
  const deliveryFeeCents =
    customer.fulfillment === "retrait" ? 0 : MONDIAL_RELAY_FEE_CENTS;
```

par :

```ts
  const deliveryFeeCents = shippingFeeFor(customer.fulfillment, fees);
```

Dans `CheckoutCustomerInput`, remplacer le commentaire `// Champs legacy (poste) — conservés pour les commandes d'avant.` par `// Adresse client (mode poste = Colissimo à domicile).` (commentaire existant mis à jour, pas ajouté).

- [ ] **Step 4 : Vérifier**

Run: `rtk vitest run tests/unit/orders.test.ts && rtk tsc --noEmit`
Expected: PASS.

---

### Task 4 : Schéma de validation du checkout (`app/checkout/schema.ts`)

**Files:**
- Create: `app/checkout/schema.ts`
- Test: `tests/unit/checkout-schema.test.ts`

**Interfaces:**
- Consumes : `CheckoutCustomerInput` (`lib/orders.ts`).
- Produces :
  ```ts
  export const CheckoutSchema: z.ZodDiscriminatedUnion<…>;
  export type CheckoutInput = z.infer<typeof CheckoutSchema>;
  export function rawCheckoutValues(formData: FormData): Record<string, string>;
  export function toCustomerInput(data: CheckoutInput): CheckoutCustomerInput;
  ```

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/unit/checkout-schema.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { CheckoutSchema, rawCheckoutValues, toCustomerInput } from "@/app/checkout/schema";

const base = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  phone: "06 12 34 56 78",
  deliveryDate: "",
  cardMessage: "",
};

const relay = {
  ...base,
  fulfillment: "mondial_relay",
  relayPointId: "012345",
  relayPointName: "Tabac de la Gare",
  relayStreet: "1 rue des Lilas",
  relayPostalCode: "17000",
  relayCity: "La Rochelle",
  relayCountry: "FR",
};

const colissimo = {
  ...base,
  fulfillment: "poste",
  address: "3 quai Valin",
  postalCode: "17000",
  city: "La Rochelle",
};

function firstError(input: unknown): string {
  const r = CheckoutSchema.safeParse(input);
  return r.success ? "" : (r.error.issues[0]?.message ?? "?");
}

describe("CheckoutSchema — Mondial Relay", () => {
  it("accepte un point relais français complet", () => {
    expect(CheckoutSchema.safeParse(relay).success).toBe(true);
  });

  it("refuse sans point relais", () => {
    expect(firstError({ ...relay, relayPointId: "" })).toBe("Choisissez un point relais.");
  });

  it("refuse un relais hors France", () => {
    expect(firstError({ ...relay, relayCountry: "BE" })).toBe("Mondial Relay : France uniquement.");
  });
});

describe("CheckoutSchema — Colissimo", () => {
  it("accepte une adresse en France métropolitaine, Corse comprise", () => {
    expect(CheckoutSchema.safeParse(colissimo).success).toBe(true);
    expect(CheckoutSchema.safeParse({ ...colissimo, postalCode: "20000" }).success).toBe(true);
    expect(CheckoutSchema.safeParse({ ...colissimo, postalCode: " 75001 " }).success).toBe(true);
  });

  it("refuse les DOM-TOM et les codes postaux mal formés", () => {
    expect(firstError({ ...colissimo, postalCode: "97400" })).toBe("Colissimo : France métropolitaine uniquement.");
    expect(firstError({ ...colissimo, postalCode: "98000" })).toBe("Colissimo : France métropolitaine uniquement.");
    expect(firstError({ ...colissimo, postalCode: "1234" })).toBe("Code postal invalide.");
    expect(firstError({ ...colissimo, postalCode: "17 000" })).toBe("Code postal invalide.");
  });

  it("refuse sans adresse ou sans ville", () => {
    expect(firstError({ ...colissimo, address: "" })).toBe("Votre adresse est requise.");
    expect(firstError({ ...colissimo, city: "  " })).toBe("Votre ville est requise.");
  });

  it("ignore les champs relais résiduels envoyés avec un mode Colissimo", () => {
    const r = CheckoutSchema.safeParse({ ...colissimo, relayPointId: "012345" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect("relayPointId" in r.data).toBe(false);
  });
});

describe("CheckoutSchema — commun", () => {
  it("exige un téléphone dans les deux modes", () => {
    expect(firstError({ ...relay, phone: "" })).toBe("Téléphone requis (suivi de livraison).");
    expect(firstError({ ...colissimo, phone: "" })).toBe("Téléphone requis (suivi de livraison).");
  });

  it("refuse un mode inconnu", () => {
    expect(CheckoutSchema.safeParse({ ...base, fulfillment: "retrait" }).success).toBe(false);
  });
});

describe("rawCheckoutValues / toCustomerInput", () => {
  it("lit tous les champs du formulaire en chaînes", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(colissimo)) fd.set(k, v);
    const raw = rawCheckoutValues(fd);
    expect(raw.fulfillment).toBe("poste");
    expect(raw.address).toBe("3 quai Valin");
    expect(raw.relayPointId).toBe("");
    expect(raw.deliveryDate).toBe("");
  });

  it("mappe Colissimo vers l'adresse client, pays FR", () => {
    const parsed = CheckoutSchema.parse(colissimo);
    expect(toCustomerInput(parsed)).toEqual({
      name: "Camille Martin",
      email: "camille@exemple.fr",
      phone: "06 12 34 56 78",
      fulfillment: "poste",
      shippingAddress: "3 quai Valin",
      shippingPostalCode: "17000",
      shippingCity: "La Rochelle",
      shippingCountry: "FR",
      deliveryDate: undefined,
      cardMessage: "",
    });
  });

  it("mappe Mondial Relay vers les champs relais", () => {
    const parsed = CheckoutSchema.parse({ ...relay, deliveryDate: "2026-10-01" });
    expect(toCustomerInput(parsed)).toEqual({
      name: "Camille Martin",
      email: "camille@exemple.fr",
      phone: "06 12 34 56 78",
      fulfillment: "mondial_relay",
      relayPointId: "012345",
      relayPointName: "Tabac de la Gare",
      relayStreet: "1 rue des Lilas",
      relayPostalCode: "17000",
      relayCity: "La Rochelle",
      deliveryDate: "2026-10-01",
      cardMessage: "",
    });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `rtk vitest run tests/unit/checkout-schema.test.ts`
Expected: FAIL, module `@/app/checkout/schema` introuvable.

- [ ] **Step 3 : Créer `app/checkout/schema.ts`**

```ts
import * as z from "zod";
import type { CheckoutCustomerInput } from "@/lib/orders";

const BaseSchema = z.object({
  name: z.string().trim().min(1, { error: "Votre nom est requis." }).max(120),
  email: z.email({ error: "Adresse email invalide." }),
  phone: z.string().trim().min(6, { error: "Téléphone requis (suivi de livraison)." }).max(25),
  deliveryDate: z.union([z.literal(""), z.iso.date({ error: "Date invalide." })]).optional(),
  cardMessage: z.string().trim().max(300, { error: "300 caractères max." }).optional(),
});

const RelaySchema = BaseSchema.extend({
  fulfillment: z.literal("mondial_relay"),
  relayPointId: z.string().trim().min(1, { error: "Choisissez un point relais." }).max(20),
  relayPointName: z.string().trim().min(1).max(120),
  relayStreet: z.string().trim().min(1).max(200),
  relayPostalCode: z.string().trim().regex(/^\d{5}$/, { error: "Code postal du relais invalide." }),
  relayCity: z.string().trim().min(1).max(100),
  relayCountry: z.literal("FR", { error: "Mondial Relay : France uniquement." }),
});

const ColissimoSchema = BaseSchema.extend({
  fulfillment: z.literal("poste"),
  address: z.string().trim().min(1, { error: "Votre adresse est requise." }).max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: "Code postal invalide." })
    .refine((cp) => !/^9[78]/.test(cp), { error: "Colissimo : France métropolitaine uniquement." }),
  city: z.string().trim().min(1, { error: "Votre ville est requise." }).max(100),
});

export const CheckoutSchema = z.discriminatedUnion("fulfillment", [RelaySchema, ColissimoSchema]);

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

const FORM_KEYS = [
  "fulfillment",
  "name",
  "email",
  "phone",
  "deliveryDate",
  "cardMessage",
  "relayPointId",
  "relayPointName",
  "relayStreet",
  "relayPostalCode",
  "relayCity",
  "relayCountry",
  "address",
  "postalCode",
  "city",
] as const;

export function rawCheckoutValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(FORM_KEYS.map((key) => [key, String(formData.get(key) ?? "")]));
}

export function toCustomerInput(data: CheckoutInput): CheckoutCustomerInput {
  const common = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    deliveryDate: data.deliveryDate || undefined,
    cardMessage: data.cardMessage,
  };
  if (data.fulfillment === "poste") {
    return {
      ...common,
      fulfillment: "poste",
      shippingAddress: data.address,
      shippingPostalCode: data.postalCode,
      shippingCity: data.city,
      shippingCountry: "FR",
    };
  }
  return {
    ...common,
    fulfillment: "mondial_relay",
    relayPointId: data.relayPointId,
    relayPointName: data.relayPointName,
    relayStreet: data.relayStreet,
    relayPostalCode: data.relayPostalCode,
    relayCity: data.relayCity,
  };
}
```

Si `toEqual` échoue à cause de l'ordre ou de clés `undefined`, c'est `toEqual` qui ignore les `undefined` : garder les tests tels quels, ils passent avec cette implémentation.

- [ ] **Step 4 : Vérifier**

Run: `rtk vitest run tests/unit/checkout-schema.test.ts`
Expected: PASS.

---

### Task 5 : Server action checkout

**Files:**
- Modify: `app/checkout/actions.ts`

**Interfaces:**
- Consumes : `CheckoutSchema`, `rawCheckoutValues`, `toCustomerInput` (Task 4) ; `createPendingOrder(db, customer, items, fees)` (Task 3) ; `shippingFeesFromSettings`, `getSettings` (`lib/settings`, Task 2) ; `SHIPPING_LINE_LABELS` (Task 1).
- Produces : `startCheckout` inchangé en signature (`(prev: CheckoutState, formData: FormData) => Promise<CheckoutState>`).

- [ ] **Step 1 : Réécrire la validation**

Remplacer les imports `zod` partiels et le `CheckoutSchema` local. En tête du fichier :

```ts
"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { getDb } from "@/lib/db/client";
import {
  attachStripeSession,
  createPendingOrder,
  CheckoutError,
} from "@/lib/orders";
import { SHIPPING_LINE_LABELS } from "@/lib/order-status";
import { composeItemName } from "@/lib/item-label";
import { getSettings, shippingFeesFromSettings } from "@/lib/settings";
import { getSiteUrl, getStripe } from "@/lib/stripe";
import { CheckoutSchema, rawCheckoutValues, toCustomerInput } from "./schema";
```

Supprimer entièrement l'ancienne constante `CheckoutSchema` (de `const CheckoutSchema = z.object({` jusqu'à `});`). Garder `ItemsSchema`.

Dans `startCheckout`, remplacer le bloc `const parsed = CheckoutSchema.safeParse({ … });` par :

```ts
  const parsed = CheckoutSchema.safeParse(rawCheckoutValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
```

Remplacer l'appel `createPendingOrder(db, { name: …, fulfillment: "mondial_relay", … }, items)` par :

```ts
    const fees = shippingFeesFromSettings(await getSettings());
    const { order, items: orderLines } = await createPendingOrder(
      db,
      toCustomerInput(parsed.data),
      items,
      fees,
    );
```

Dans les `line_items` Stripe, remplacer `product_data: { name: "Livraison Mondial Relay — point relais" }` par :

```ts
                  product_data: { name: SHIPPING_LINE_LABELS[order.fulfillment] },
```

- [ ] **Step 2 : Vérifier**

Run: `rtk tsc --noEmit && rtk eslint app/checkout && rtk vitest run tests/unit/checkout-schema.test.ts tests/unit/orders.test.ts`
Expected: aucune erreur. Si `getSettings` échoue en test (pas de base), ce n'est pas testé ici : la couverture est e2e (Task 9).

---

### Task 6 : Page et formulaire checkout

**Files:**
- Modify: `app/checkout/page.tsx`
- Modify: `components/checkout-form.tsx`
- Modify: `app/globals.css:1558` (`.checkout-choice`)

**Interfaces:**
- Consumes : `ShippingFees`, `shippingFeeFor`, `CARD_FEE_CENTS` (Task 1) ; `getSettings`, `shippingFeesFromSettings` (Task 2) ; `RelayPicker`, `RelaySelection` (existants).
- Produces : `CheckoutForm({ fees }: { fees: ShippingFees })`. Champs de formulaire : `fulfillment`, `address`, `postalCode`, `city` (+ champs relais existants). `data-testid` : `checkout-total` (existant), `shipping-mode-mondial_relay`, `shipping-mode-poste`.

- [ ] **Step 1 : `app/checkout/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { CheckoutForm } from "@/components/checkout-form";
import { getSettings, shippingFeesFromSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Commander",
  robots: { index: false, follow: false },
  description: "Finalisez votre commande de fleurs fraîches & séchées.",
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const fees = shippingFeesFromSettings(await getSettings());
  return (
    <>
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="cart-page">
          <div className="container">
            <nav className="boutique-crumb reveal is-visible" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <Link href="/panier">panier</Link>
              <span aria-hidden>/</span>
              <span>commander</span>
            </nav>
            <h1 className="display cart-page__title">
              commander
              <span className="script">encore un instant…</span>
            </h1>
            <CheckoutForm fees={fees} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2 : `components/checkout-form.tsx`**

Imports :

```tsx
"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { trackBeginCheckout } from "@/lib/analytics/gtag";
import { composeItemName } from "@/lib/item-label";
import { formatEuros } from "@/lib/money";
import { CARD_FEE_CENTS, shippingFeeFor, type ShippingFees } from "@/lib/order-status";
import { startCheckout, type CheckoutState } from "@/app/checkout/actions";
import { ArrowRight } from "./illustrations";
import { RelayPicker, type RelaySelection } from "./relay-picker";

type ShippingMode = "mondial_relay" | "poste";
```

Signature et état :

```tsx
export function CheckoutForm({ fees }: { fees: ShippingFees }) {
  const { items, subtotalCents, ready } = useCart();
  const [mode, setMode] = useState<ShippingMode>("mondial_relay");
  const [relay, setRelay] = useState<RelaySelection | null>(null);
  const [hasCard, setHasCard] = useState(false);
  const [state, action, pending] = useActionState<CheckoutState, FormData>(
    startCheckout,
    undefined,
  );
```

GA4 (remplacer `MONDIAL_RELAY_FEE_CENTS` par `fees.mondialRelay`) :

```tsx
  useEffect(() => {
    if (!ready || items.length === 0 || beginCheckoutFired.current) return;
    beginCheckoutFired.current = true;
    trackBeginCheckout(items, subtotalCents + fees.mondialRelay);
  }, [ready, items, subtotalCents, fees.mondialRelay]);
```

Calcul du frais :

```tsx
  const feeCents = shippingFeeFor(mode, fees);
  const cardFeeCents = hasCard ? CARD_FEE_CENTS : 0;
  const canSubmit = mode === "poste" || relay !== null;
```

Remplacer tout le second `<fieldset>` (« Livraison en point relais ») par :

```tsx
        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Mode de livraison</legend>
          <input type="hidden" name="fulfillment" value={mode} />
          <div className="checkout-fulfillment" role="radiogroup" aria-label="Mode de livraison">
            <label className={`checkout-choice${mode === "mondial_relay" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="shippingMode"
                value="mondial_relay"
                checked={mode === "mondial_relay"}
                onChange={() => setMode("mondial_relay")}
                data-testid="shipping-mode-mondial_relay"
              />
              <span className="checkout-choice__title">Point relais Mondial Relay</span>
              <span className="checkout-choice__desc">
                Livré dans le relais de votre choix — {formatEuros(fees.mondialRelay)}
              </span>
            </label>
            <label className={`checkout-choice${mode === "poste" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="shippingMode"
                value="poste"
                checked={mode === "poste"}
                onChange={() => setMode("poste")}
                data-testid="shipping-mode-poste"
              />
              <span className="checkout-choice__title">À domicile par Colissimo</span>
              <span className="checkout-choice__desc">
                Livré à votre adresse, France métropolitaine — {formatEuros(fees.colissimo)}
              </span>
            </label>
          </div>

          {mode === "mondial_relay" ? (
            <>
              <RelayPicker value={relay} onSelect={setRelay} />
              {relay && (
                <>
                  <input type="hidden" name="relayPointId" value={relay.id} />
                  <input type="hidden" name="relayPointName" value={relay.name} />
                  <input type="hidden" name="relayStreet" value={relay.street} />
                  <input type="hidden" name="relayPostalCode" value={relay.postalCode} />
                  <input type="hidden" name="relayCity" value={relay.city} />
                  <input type="hidden" name="relayCountry" value="FR" />
                </>
              )}
            </>
          ) : (
            <>
              <label className="form-field">
                <span>Adresse (n° et rue) *</span>
                <input
                  name="address"
                  required
                  maxLength={200}
                  autoComplete="street-address"
                  placeholder="3 quai Valin, appartement 2"
                />
              </label>
              <label className="form-field">
                <span>Code postal *</span>
                <input
                  name="postalCode"
                  required
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  autoComplete="postal-code"
                  placeholder="17000"
                />
              </label>
              <label className="form-field">
                <span>Ville *</span>
                <input
                  name="city"
                  required
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder="La Rochelle"
                />
              </label>
            </>
          )}

          <label className="form-field">
            <span>
              Message pour la carte{" "}
              <em>(optionnel — carte manuscrite +{formatEuros(CARD_FEE_CENTS)})</em>
            </span>
            <textarea
              name="cardMessage"
              rows={2}
              maxLength={300}
              placeholder="Joyeux anniversaire…"
              onChange={(e) => setHasCard(e.target.value.trim().length > 0)}
            />
          </label>
        </fieldset>
```

Dans le récapitulatif, remplacer la ligne « Livraison (point relais) » par :

```tsx
        <div className="cart-summary__row">
          <span>{mode === "poste" ? "Livraison (Colissimo à domicile)" : "Livraison (point relais)"}</span>
          <span>{formatEuros(feeCents)}</span>
        </div>
```

Bouton :

```tsx
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="btn btn--filled cart-summary__cta"
        >
          {pending ? "Redirection…" : canSubmit ? "Payer avec Stripe" : "Choisissez un point relais"}{" "}
          <ArrowRight />
        </button>
```

Supprimer l'ancien `const feeCents = MONDIAL_RELAY_FEE_CENTS;` et toute référence restante à `MONDIAL_RELAY_FEE_CENTS` dans ce fichier.

- [ ] **Step 3 : CSS**

Dans `app/globals.css`, règle `.checkout-choice` : ajouter `position: relative;` en première déclaration du bloc.

- [ ] **Step 4 : Vérifier types, lint et rendu**

Run: `rtk tsc --noEmit && rtk eslint components/checkout-form.tsx app/checkout`
Expected: aucune erreur.

Puis lancer `npm run dev`, ajouter un produit au panier, ouvrir `/checkout` et vérifier à l'œil : deux cartes radio, Mondial Relay actif par défaut avec le picker, bascule vers Colissimo qui affiche les trois champs, total qui passe de +4,90 € à +7,90 €, bouton actif en mode Colissimo sans relais. Vérifier en largeur mobile (< 640 px) que les cartes passent en une colonne. Arrêter le serveur.

---

### Task 7 : Admin commandes

**Files:**
- Modify: `app/(admin)/admin/(panel)/commandes/orders-table.tsx:57`
- Modify: `app/(admin)/admin/(panel)/commandes/kanban-board.tsx:183`
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/page.tsx:110-155`
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`

**Interfaces:**
- Consumes : `FULFILLMENT_LABELS` (Task 1), `Fulfillment` (`lib/order-status`).
- Produces : `TrackingForm({ orderId, trackingNumber, fulfillment })`.

- [ ] **Step 1 : Libellés tableau et kanban**

Dans `orders-table.tsx`, importer `FULFILLMENT_LABELS` depuis `@/lib/order-status` et remplacer :

```tsx
                {o.fulfillment === "retrait" ? "Retrait" : "Mondial Relay"}
```

par :

```tsx
                {FULFILLMENT_LABELS[o.fulfillment]}
```

Même remplacement dans `kanban-board.tsx` (`order.fulfillment`).

- [ ] **Step 2 : `tracking-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { Fulfillment } from "@/lib/order-status";
import { btnPrimary, input } from "../../ui";
import { saveTrackingNumber, type StatusActionState } from "../actions";

export function TrackingForm({
  orderId,
  trackingNumber,
  fulfillment,
}: {
  orderId: string;
  trackingNumber: string | null;
  fulfillment: Fulfillment;
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
        placeholder={fulfillment === "poste" ? "N° de suivi Colissimo" : "N° de suivi Mondial Relay"}
        maxLength={40}
        className={`${input} sm:flex-1`}
      />
      <button type="submit" disabled={pending} className={btnPrimary}>
        Enregistrer
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3 : Fiche commande `[id]/page.tsx`**

Titre du bloc livraison :

```tsx
              <p className="mb-1 font-medium">
                {order.fulfillment === "mondial_relay"
                  ? "Point relais Mondial Relay"
                  : order.fulfillment === "poste"
                    ? "Livraison à domicile — Colissimo"
                    : "Retrait atelier"}
              </p>
```

Remplacer le bloc `{order.fulfillment === "mondial_relay" && ( <div className="mt-4 border-t …"> … </div> )}` (étiquette + suivi) par :

```tsx
            {order.fulfillment === "mondial_relay" && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 font-medium">Étiquette Mondial Relay</p>
                <LabelButton orderId={order.id} hasLabel={!!order.relayLabelUrl} />
                {order.relayLabelUrl && (
                  <p className="mt-2">
                    <a href={order.relayLabelUrl} target="_blank" rel="noopener noreferrer" className="text-wine hover:underline">
                      Télécharger l&apos;étiquette (PDF)
                    </a>
                  </p>
                )}
              </div>
            )}
            {order.fulfillment === "poste" && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 font-medium">Étiquette Colissimo</p>
                <p className="text-muted">
                  À générer depuis votre espace La Poste Pro (ou au bureau de poste), puis
                  saisir le n° de suivi ci-dessous.
                </p>
              </div>
            )}
            {(order.fulfillment === "mondial_relay" || order.fulfillment === "poste") && (
              <div className="mt-3">
                <p className="mb-2 font-medium">N° de suivi</p>
                <TrackingForm
                  orderId={order.id}
                  trackingNumber={order.trackingNumber}
                  fulfillment={order.fulfillment}
                />
              </div>
            )}
```

- [ ] **Step 4 : Vérifier**

Run: `rtk tsc --noEmit && rtk eslint "app/(admin)/admin/(panel)/commandes"`
Expected: aucune erreur.

Run: `rtk vitest run tests/unit/orders.test.ts`
Expected: PASS (le test `setTrackingNumber` existant couvre déjà `poste` et `mondial_relay`).

---

### Task 8 : Pages client et légales

**Files:**
- Modify: `app/commande/confirmee/page.tsx:133-134`
- Modify: `components/legal/livraison-retours.tsx`
- Modify: `components/legal/cgv.tsx:1-75`
- Modify: `app/livraison-retours/page.tsx:8`
- Test: `tests/unit/legal-content.test.tsx`

**Interfaces:**
- Consumes : `shippingFeesFromSettings` (Task 2), `CARD_FEE_CENTS`, `formatEuros`.

- [ ] **Step 1 : Tests légaux qui échouent**

Dans `tests/unit/legal-content.test.tsx`, compléter `filled` :

```ts
  shipping_delay: "2 à 4 jours ouvrés",
  shipping_delay_colissimo: "2 à 3 jours ouvrés",
  shipping_fee_mondial_relay: "4,90",
  shipping_fee_colissimo: "9,50",
```

Remplacer le `describe("Livraison & retours", …)` par :

```tsx
describe("Livraison & retours", () => {
  it("décrit Mondial Relay et Colissimo avec leurs délais et frais", () => {
    render(<LivraisonRetoursContent settings={filled} />);
    expect(screen.getAllByText(/Mondial Relay/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Colissimo/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 à 4 jours ouvrés/)).toBeTruthy();
    expect(screen.getByText(/2 à 3 jours ouvrés/)).toBeTruthy();
    expect(screen.getByText(/4,90€/)).toBeTruthy();
    expect(screen.getByText(/9,50€/)).toBeTruthy();
  });

  it("signale le délai Colissimo à compléter quand il est vide", () => {
    render(<LivraisonRetoursContent settings={DEFAULT_SETTINGS} />);
    expect(screen.getByText(/à compléter : délai d'acheminement Colissimo/)).toBeTruthy();
  });
});
```

Ajouter dans `describe("CGV", …)` :

```tsx
  it("liste les deux frais de livraison depuis les paramètres", () => {
    render(<CgvContent settings={filled} />);
    expect(screen.getByText(/point relais Mondial Relay 4,90€/)).toBeTruthy();
    expect(screen.getByText(/domicile par Colissimo 9,50€/)).toBeTruthy();
  });
```

Vérifier au préalable le format exact de `formatEuros(950)` avec `rtk read lib/money.ts` ; si le séparateur est une espace fine ou un `€` collé différemment, adapter les regex des tests au format réel (le test e2e 05 attend `"98,90€"`, donc `9,50€` est le format attendu).

- [ ] **Step 2 : Vérifier l'échec**

Run: `rtk vitest run tests/unit/legal-content.test.tsx`
Expected: FAIL (Colissimo absent, clés inconnues dans `Settings`… ces clés existent depuis Task 2, seul le contenu manque).

- [ ] **Step 3 : `components/legal/livraison-retours.tsx`**

```tsx
import { formatEuros } from "@/lib/money";
import { shippingFeesFromSettings, type Settings } from "@/lib/settings";
import { LegalValue } from "./legal-value";
import { LegalNav, ShopAddress, ShopEmail } from "./legal-page";

export function LivraisonRetoursContent({ settings }: { settings: Settings }) {
  const fees = shippingFeesFromSettings(settings);
  return (
    <>
      <LegalNav current="/livraison-retours" />
      <p className="legal__intro">
        Nos bouquets partent de l&apos;atelier de La Rochelle et sont livrés en point
        relais Mondial Relay ou à domicile par Colissimo, partout en France
        métropolitaine.
      </p>

      <h2>Préparation</h2>
      <p>
        Chaque commande est composée à la main à l&apos;atelier, sous{" "}
        <LegalValue value={settings.preparation_delay} label="délai de préparation" />.
        Les fleurs fraîches sont préparées au plus près du départ pour arriver dans
        le meilleur état possible.
      </p>

      <h2>Livraison en point relais Mondial Relay</h2>
      <p>
        Vous choisissez votre point relais lors de la commande. Le colis est ensuite
        acheminé sous{" "}
        <LegalValue value={settings.shipping_delay} label="délai d'acheminement Mondial Relay" />{" "}
        après dépôt. Vous êtes prévenu·e par SMS ou e-mail par Mondial Relay dès que
        le colis est disponible ; il vous attend ensuite plusieurs jours au relais.
        Frais de livraison : {formatEuros(fees.mondialRelay)} par commande.
      </p>

      <h2>Livraison à domicile par Colissimo</h2>
      <p>
        Vous indiquez votre adresse lors de la commande. Le colis est remis à
        Colissimo et livré à votre domicile sous{" "}
        <LegalValue value={settings.shipping_delay_colissimo} label="délai d'acheminement Colissimo" />{" "}
        après dépôt. En cas d&apos;absence, un avis de passage vous permet de le
        retirer au bureau de poste. Frais de livraison :{" "}
        {formatEuros(fees.colissimo)} par commande.
      </p>
      <p>
        Le numéro de suivi vous est communiqué dès l&apos;expédition. Les délais
        annoncés sont indicatifs ; un retard du transporteur ne peut donner lieu à
        annulation qu&apos;après mise en demeure restée sans effet, conformément à
        l&apos;article L. 216-6 du Code de la consommation.
      </p>

      <h2>Retrait à l&apos;atelier</h2>
      <p>
        Vous pouvez aussi venir chercher votre commande à l&apos;atelier :{" "}
        <ShopAddress settings={settings} />. Écrivez-nous pour convenir d&apos;un
        créneau.
      </p>

      <h2>Colis abîmé ou fleurs non conformes</h2>
      <p>
        Si le colis arrive endommagé ou si les fleurs ne correspondent pas à votre
        commande, prévenez-nous sous 48 heures avec quelques photos à{" "}
        <ShopEmail settings={settings} />. Nous vous proposons un remplacement, un
        avoir ou un remboursement.
      </p>

      <h2>Retours et rétractation</h2>
      <p>
        Les fleurs fraîches sont des produits périssables : elles ne peuvent être ni
        reprises ni échangées (article L. 221-28, 4° du Code de la consommation).
        Les fleurs séchées et les vases peuvent être retournés dans les quatorze
        jours suivant la réception, complets et en parfait état, frais de retour à
        votre charge. Le remboursement intervient sous quatorze jours après réception
        du retour. Les conditions complètes figurent dans nos <a href="/cgv">CGV</a>.
      </p>
    </>
  );
}
```

- [ ] **Step 4 : `components/legal/cgv.tsx`**

Imports :

```tsx
import { formatEuros } from "@/lib/money";
import { CARD_FEE_CENTS } from "@/lib/order-status";
import { shippingFeesFromSettings, type Settings } from "@/lib/settings";
```

Début du composant : `const fees = shippingFeesFromSettings(settings);`

§3 Prix, remplacer la phrase « Frais actuels : … » par :

```tsx
        Frais actuels : livraison en point relais Mondial Relay{" "}
        {formatEuros(fees.mondialRelay)}, livraison à domicile par Colissimo{" "}
        {formatEuros(fees.colissimo)}, carte manuscrite optionnelle{" "}
        {formatEuros(CARD_FEE_CENTS)}. La boutique se réserve le droit de modifier ses
        prix à tout moment ; le prix applicable est celui affiché au moment de la
        commande.
```

§4 Commande : « renseigne ses coordonnées et son point relais » → « renseigne ses coordonnées et son mode de livraison (point relais ou adresse) ».

§6 Livraison et retrait, remplacer le paragraphe par :

```tsx
      <p>
        Les commandes sont préparées à l&apos;atelier sous{" "}
        <LegalValue value={settings.preparation_delay} label="délai de préparation" />,
        puis remises au transporteur choisi par le client, en France métropolitaine :
        Mondial Relay pour une livraison en point relais sous{" "}
        <LegalValue value={settings.shipping_delay} label="délai d'acheminement Mondial Relay" />,
        ou Colissimo pour une livraison à domicile sous{" "}
        <LegalValue value={settings.shipping_delay_colissimo} label="délai d'acheminement Colissimo" />.
        Une date de livraison souhaitée peut être indiquée à la commande ; elle est
        prise en compte dans la mesure du possible. Voir le détail dans la page{" "}
        <a href="/livraison-retours">Livraison &amp; retours</a>.
      </p>
```

- [ ] **Step 5 : Metadata et confirmation**

`app/livraison-retours/page.tsx` : `description: "Délais de préparation, livraison en point relais Mondial Relay ou à domicile par Colissimo, retrait à l'atelier et conditions de retour."`

`app/commande/confirmee/page.tsx` : `"Votre commande partira par la poste très vite."` → `"Votre commande partira par Colissimo à votre domicile très vite."`

- [ ] **Step 6 : Vérifier**

Run: `rtk vitest run tests/unit/legal-content.test.tsx && rtk tsc --noEmit`
Expected: PASS.

---

### Task 9 : E2E Colissimo et frais éditable

**Files:**
- Create: `tests/e2e/12-checkout-colissimo.spec.ts`

**Interfaces:**
- Consumes : `addToCart`, `adminLogin` (`tests/e2e/helpers.ts`) ; `data-testid` `shipping-mode-poste`, `checkout-total`, `order-confirmation`, `order-row-<numéro>` ; labels « Frais Colissimo (€) », placeholder « N° de suivi Colissimo ».

- [ ] **Step 1 : Écrire le test**

Le parcours Stripe reprend la fonction `fillStripeCheckout` de `tests/e2e/05-checkout.spec.ts`. Pour ne pas la dupliquer, la déplacer avec `findCardFrame` dans `tests/e2e/helpers.ts` (export nommé `fillStripeCheckout`) et l'importer depuis les deux specs ; supprimer les copies locales du fichier 05.

```ts
import { expect, test } from "@playwright/test";
import { addToCart, adminLogin, fillStripeCheckout } from "./helpers";

test.describe.configure({ mode: "serial" });

let orderNumber = "";

async function neutralizeRelayWidget(page: import("@playwright/test").Page) {
  for (const cdn of ["https://ajax.googleapis.com/**", "**/parcelshop-picker/**"]) {
    await page.route(cdn, (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
  }
}

test("checkout Colissimo : adresse, forfait 7,90 €, paiement, confirmation", async ({ page }) => {
  test.setTimeout(240_000);
  await neutralizeRelayWidget(page);

  await page.goto("/boutique");
  await addToCart(page, "rivage");
  await page.goto("/checkout");

  await page.getByLabel("Nom complet *").fill("Camille Martin");
  await page.getByLabel("Email *").fill("camille.colissimo@exemple.fr");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");

  await expect(page.getByRole("button", { name: "Choisissez un point relais" })).toBeDisabled();
  await page.getByText("À domicile par Colissimo").click();

  await page.getByLabel("Adresse (n° et rue) *").fill("3 quai Valin");
  await page.getByLabel("Code postal *").fill("17000");
  await page.getByLabel("Ville *").fill("La Rochelle");
  await expect(page.getByTestId("checkout-total")).toHaveText("55,90€");

  await page.getByRole("button", { name: "Payer avec Stripe" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await expect(page.getByText("Livraison Colissimo — à domicile")).toBeVisible();
  await fillStripeCheckout(page);

  await page.waitForURL(/\/commande\/confirmee/, { timeout: 90_000 });
  const confirmation = page.getByTestId("order-confirmation");
  await expect(confirmation).toContainText("55,90€");
  await expect(confirmation).toContainText("Colissimo à votre domicile");
  const numberText = await confirmation.locator("p", { hasText: "Commande CQ-" }).textContent();
  orderNumber = numberText?.match(/CQ-[A-Z0-9-]+/)?.[0] ?? "";
  expect(orderNumber).toMatch(/^CQ-/);
});

test("la commande Colissimo est lisible dans l'admin, sans bouton d'étiquette", async ({ page }) => {
  expect(orderNumber, "le test de paiement doit passer d'abord").toMatch(/^CQ-/);
  await adminLogin(page);

  await page.goto("/admin/commandes?vue=tableau");
  const row = page.getByTestId(`order-row-${orderNumber}`);
  await expect(row).toContainText("Colissimo");
  await row.getByRole("link", { name: "Détail" }).click();

  await expect(page.getByText("Livraison à domicile — Colissimo")).toBeVisible();
  await expect(page.getByText("3 quai Valin")).toBeVisible();
  await expect(page.getByText("17000 La Rochelle")).toBeVisible();
  await expect(page.getByRole("button", { name: /l'étiquette/ })).toHaveCount(0);

  await page.getByPlaceholder("N° de suivi Colissimo").fill("6A12345678901");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.reload();
  await expect(page.getByPlaceholder("N° de suivi Colissimo")).toHaveValue("6A12345678901");
});

test("le forfait Colissimo modifié dans les paramètres s'applique au checkout", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/parametres");
  await page.getByLabel("Frais Colissimo (€)").fill("9,50");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");

  await neutralizeRelayWidget(page);
  await page.goto("/boutique");
  await addToCart(page, "rivage");
  await page.goto("/checkout");
  await expect(page.getByText("France métropolitaine — 9,50€")).toBeVisible();
  await page.getByText("À domicile par Colissimo").click();
  await expect(page.getByTestId("checkout-total")).toHaveText("57,50€");

  await page.goto("/livraison-retours");
  await expect(page.getByText(/9,50€/)).toBeVisible();

  await page.goto("/admin/parametres");
  await page.getByLabel("Frais Colissimo (€)").fill("7,90");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");
});

test("un forfait invalide est refusé dans les paramètres", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/parametres");
  await page.getByLabel("Frais Mondial Relay (€)").fill("abc");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("alert")).toContainText("Frais Mondial Relay");
  await page.getByLabel("Frais Mondial Relay (€)").fill("4,90");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");
});
```

Montants : `rivage` = 48,00 € (voir test 05) ; 48 + 7,90 = 55,90 ; 48 + 9,50 = 57,50. Vérifier avec `rtk grep -n "rivage" lib/db/seed*.ts tests/helpers/db.ts` que le prix seedé est bien 4800 avant de figer ces valeurs.

Si Stripe affiche la ligne de livraison sous un autre libellé ou dans un accordéon replié, retirer l'assertion `Livraison Colissimo — à domicile` de la page Stripe (le libellé est vérifié par l'admin et l'e-mail Stripe).

- [ ] **Step 2 : Lancer les e2e concernés**

Run: `rtk playwright test tests/e2e/05-checkout.spec.ts tests/e2e/12-checkout-colissimo.spec.ts tests/e2e/10-legal-settings.spec.ts`
Expected: PASS (réseau Stripe test requis, clés dans `.env.local`).

Les inputs radio sont masqués en CSS (`opacity: 0`, `pointer-events: none`) : on clique le texte du label, jamais l'input.

Si le test « Choisissez un point relais » est trop rapide (bouton pas encore rendu), remplacer l'assertion par `await expect(page.getByRole("button", { name: /Choisissez un point relais|Payer avec Stripe/ })).toBeVisible();`.

---

### Task 10 : Vérification globale

**Files:** aucun nouveau.

- [ ] **Step 1 : Suite complète**

Run: `rtk tsc --noEmit && rtk eslint . && rtk vitest run`
Expected: aucune erreur. En cas de `STACK_TRACE_ERROR` sur des tests PGlite, relancer les fichiers concernés seuls.

- [ ] **Step 2 : E2E complets**

Run: `rtk playwright test`
Expected: PASS.

- [ ] **Step 3 : Contrôle de cohérence des libellés**

Run: `rtk grep -rn "Envoi par la poste\|par la poste\|N° de suivi Mondial Relay\"" app components lib --include=*.tsx --include=*.ts`
Expected: aucune occurrence hors `tracking-form.tsx` (où le libellé Mondial Relay est conditionnel).

- [ ] **Step 4 : Récapitulatif pour l'utilisateur**

Lister les fichiers modifiés (`rtk git status --short`), rappeler qu'aucun commit n'a été fait, et signaler les deux points métier de la spec §11 : produits frais à domicile et anciennes commandes `poste` désormais affichées « Colissimo ».
