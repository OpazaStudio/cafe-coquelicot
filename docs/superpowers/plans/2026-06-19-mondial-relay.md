# Mondial Relay — seule méthode de livraison · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer entièrement le mode de livraison du site par Mondial Relay (point relais, France uniquement), avec sélection du point relais au checkout, forfait de port unique, et génération automatique de l'étiquette + n° de suivi via l'API Connect.

**Architecture:** La sélection du point relais se fait sur la page `/checkout` (formulaire maison) avant la redirection vers Stripe Checkout hébergé — exactement là où le formulaire d'adresse vit aujourd'hui. Le point relais est stocké sur la commande ; au paiement confirmé (webhook + filet `/commande/confirmee`), une fonction idempotente `ensureRelayShipment` appelle l'API Connect (client isolé derrière une interface `MondialRelayClient`) pour créer l'expédition et récupérer l'étiquette PDF. Repli admin : bouton « Générer l'étiquette ».

**Tech Stack:** Next.js (App Router, version à API modifiée — voir contrainte), Drizzle ORM + Postgres/PGlite, TypeScript, Stripe (Checkout Sessions hébergé), Zod, Vitest (unit), Playwright (e2e sur PGlite), widget jQuery officiel Mondial Relay, `fast-xml-parser` (parsing réponse Connect).

**Spec de référence :** `docs/superpowers/specs/2026-06-19-mondial-relay-design.md`

## Global Constraints

- **Next.js à API modifiée** : avant d'écrire du code spécifique Next (ex. `next/script`), lire le guide concerné dans `node_modules/next/dist/docs/` (cf. `AGENTS.md`). Ne pas se fier à la mémoire d'entraînement.
- **France uniquement** : `SHIPPING_COUNTRY_CODES = ["FR"]` ; widget figé `Country: "FR"`, aucun sélecteur de pays ; garde serveur rejetant tout point relais non-`FR` ; `CountryCode = "FR"` forcé dans le payload `createShipment`.
- **Migrations** : la base de test PGlite applique automatiquement `lib/db/migrations/`. **Avant de générer 0005**, s'assurer que 0003 et 0004 sont appliquées sur Supabase (`npm run db:migrate`).
- **Migration additive** : on **ajoute** la valeur d'enum `mondial_relay` ; on ne supprime jamais `retrait`/`poste` (commandes historiques). Le checkout ne crée plus que `mondial_relay`.
- **Client MR injectable** : tout passe par l'interface `MondialRelayClient`. **Aucun appel réseau en test unitaire** (transport/fixture injectés). En e2e, l'env MR est **absent** → `ensureRelayShipment` saute proprement (pas d'appel sandbox en CI).
- **Sécurité** : les identifiants API MR sont **serveur uniquement** (jamais `NEXT_PUBLIC_`, sauf le code enseigne du widget qui est public par nature).
- **Idempotence** : `ensureRelayShipment` ne crée l'expédition que si `relayShipmentNumber` est nul.
- **Validation/commande** : commandes en français, respecter les conventions Zod + messages existants.
- **Outils** : `npm run typecheck`, `npm run lint`, `npm test` (unit), `npm run test:e2e`.

---

### Task 1: Schéma + migration `0005` (enum `mondial_relay` + colonnes relais)

**Files:**
- Modify: `lib/db/schema.ts:29` (enum) et `lib/db/schema.ts:89-115` (table `orders`)
- Create: `lib/db/migrations/0005_*.sql` (généré par drizzle-kit)
- Test: `tests/unit/schema-relay.test.ts`

**Interfaces:**
- Produces: enum `fulfillment` avec valeur `"mondial_relay"` ; colonnes `orders.relayPointId`, `orders.relayPointName`, `orders.relayShipmentNumber`, `orders.relayLabelUrl` (toutes `text` nullable) ; type `Fulfillment` inclut `"mondial_relay"`.

- [ ] **Step 1: Vérifier l'état des migrations distantes**

Run: `npm run db:migrate`
Expected: applique 0003 + 0004 si en retard sur Supabase, sinon « No migrations to apply ». (Sans `DATABASE_URL`, cible la PGlite locale — sans effet distant ; le but est de ne pas empiler 0005 sur une base en retard.)

- [ ] **Step 2: Écrire le test d'intégration (échouera)**

Create `tests/unit/schema-relay.test.ts` :

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders, fulfillmentEnum } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";

describe("schéma Mondial Relay", () => {
  it("l'enum fulfillment inclut mondial_relay", () => {
    expect(fulfillmentEnum.enumValues).toContain("mondial_relay");
  });

  it("insère et relit une commande mondial_relay avec ses colonnes relais", async () => {
    const db = await createTestDb({ seed: false });
    const [row] = await db
      .insert(orders)
      .values({
        number: "CQ-TEST-0001",
        customerName: "Camille",
        customerEmail: "c@exemple.fr",
        fulfillment: "mondial_relay",
        relayPointId: "FR-012345",
        relayPointName: "Tabac de la Gare",
        shippingAddress: "1 rue des Lilas",
        shippingPostalCode: "17000",
        shippingCity: "La Rochelle",
        shippingCountry: "FR",
        relayShipmentNumber: null,
        relayLabelUrl: null,
        subtotalCents: 4800,
        deliveryFeeCents: 490,
        totalCents: 5290,
      })
      .returning();
    const found = await db.select().from(orders).where(eq(orders.id, row.id));
    expect(found[0].fulfillment).toBe("mondial_relay");
    expect(found[0].relayPointId).toBe("FR-012345");
    expect(found[0].relayPointName).toBe("Tabac de la Gare");
  });
});
```

- [ ] **Step 3: Lancer le test → échec attendu**

Run: `npm test -- schema-relay`
Expected: FAIL (`relayPointId` n'existe pas sur le type d'insert / colonne inconnue).

- [ ] **Step 4: Modifier le schéma**

`lib/db/schema.ts` ligne 29 :

```ts
export const fulfillmentEnum = pgEnum("fulfillment", [
  "retrait",
  "poste",
  "mondial_relay",
]);
```

Dans la table `orders` (après `shippingCountry`, ligne 100), ajouter :

```ts
  shippingCountry: text("shipping_country"),
  // Mondial Relay : point relais sélectionné + suivi de l'expédition.
  // L'adresse du relais est portée par shipping_address/postal_code/city/country.
  relayPointId: text("relay_point_id"),
  relayPointName: text("relay_point_name"),
  relayShipmentNumber: text("relay_shipment_number"),
  relayLabelUrl: text("relay_label_url"),
  trackingNumber: text("tracking_number"),
```

(Garder `trackingNumber` tel quel ; on l'a juste déplacé sous les colonnes relais pour la lisibilité — ou laisser à sa place et n'ajouter que les 4 lignes relais avant.)

- [ ] **Step 5: Générer la migration**

Run: `npm run db:generate`
Expected: crée `lib/db/migrations/0005_*.sql` contenant `ALTER TYPE "fulfillment" ADD VALUE 'mondial_relay';` + 4 × `ALTER TABLE "orders" ADD COLUMN "relay_..." text;`. Vérifier le contenu généré.

- [ ] **Step 6: Lancer le test → succès attendu**

Run: `npm test -- schema-relay`
Expected: PASS (la PGlite de test applique 0005 automatiquement).

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add lib/db/schema.ts lib/db/migrations tests/unit/schema-relay.test.ts
git commit -m "feat(db): migration 0005 — fulfillment mondial_relay + colonnes point relais"
```

---

### Task 2: `lib/order-status.ts` — forfait, France uniquement, transitions `mondial_relay`

**Files:**
- Modify: `lib/order-status.ts`
- Test: `tests/unit/order-status.test.ts` (créer si absent)

**Interfaces:**
- Consumes: type `Fulfillment` (Task 1).
- Produces: `MONDIAL_RELAY_FEE_CENTS: number` ; `SHIPPING_COUNTRY_CODES = ["FR"] as const` ; `isShippingCountry` ; `statusTransitions(from, "mondial_relay")` retourne `["shipped","cancelled"]` depuis `preparing`.

- [ ] **Step 1: Écrire le test (échouera)**

Create/compléter `tests/unit/order-status.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  MONDIAL_RELAY_FEE_CENTS,
  SHIPPING_COUNTRY_CODES,
  isShippingCountry,
  statusTransitions,
  canTransition,
} from "@/lib/order-status";

describe("order-status — Mondial Relay", () => {
  it("ne dessert que la France", () => {
    expect([...SHIPPING_COUNTRY_CODES]).toEqual(["FR"]);
    expect(isShippingCountry("FR")).toBe(true);
    expect(isShippingCountry("BE")).toBe(false);
  });

  it("a un forfait de livraison positif", () => {
    expect(MONDIAL_RELAY_FEE_CENTS).toBeGreaterThan(0);
  });

  it("transition terminale = shipped pour mondial_relay", () => {
    expect(statusTransitions("preparing", "mondial_relay")).toEqual([
      "shipped",
      "cancelled",
    ]);
    expect(canTransition("preparing", "shipped", "mondial_relay")).toBe(true);
    expect(canTransition("preparing", "picked_up", "mondial_relay")).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npm test -- order-status`
Expected: FAIL (`MONDIAL_RELAY_FEE_CENTS` non exporté).

- [ ] **Step 3: Modifier `lib/order-status.ts`**

Remplacer les lignes 8-34 :

```ts
// Forfait Mondial Relay (point relais) — à caler sur le contrat. Provisoire.
export const MONDIAL_RELAY_FEE_CENTS = 490;

// France uniquement (cf. spec) — aucune expédition à l'étranger.
export const SHIPPING_COUNTRY_CODES = ["FR"] as const;
export type ShippingCountryCode = (typeof SHIPPING_COUNTRY_CODES)[number];

export const SHIPPING_COUNTRY_LABELS: Record<ShippingCountryCode, string> = {
  FR: "France",
};

export function isShippingCountry(code: string): code is ShippingCountryCode {
  return (SHIPPING_COUNTRY_CODES as readonly string[]).includes(code);
}
```

Remplacer `TERMINAL_BY_FULFILLMENT` (lignes 60-63) :

```ts
const TERMINAL_BY_FULFILLMENT: Record<Fulfillment, OrderStatus> = {
  poste: "shipped",
  retrait: "picked_up",
  mondial_relay: "shipped",
};
```

- [ ] **Step 4: Lancer → succès attendu**

Run: `npm test -- order-status`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add lib/order-status.ts tests/unit/order-status.test.ts
git commit -m "feat(shipping): forfait Mondial Relay + France uniquement + transitions mondial_relay"
```

> Note : `npm run typecheck` peut signaler des imports cassés de `SHIPPING_FEE_CENTS` dans `lib/orders.ts`, `components/checkout-form.tsx`, `tests/unit/orders.test.ts`. Ils sont corrigés aux Tasks 6 et 7. Si le typecheck doit passer dès ce commit, faire un remplacement mécanique `SHIPPING_FEE_CENTS` → `MONDIAL_RELAY_FEE_CENTS` dans ces fichiers maintenant (sinon, les Tasks 6-7 s'en chargent). Recommandé : laisser et committer ; les tasks suivantes réparent.

---

### Task 3: `lib/mondial-relay/` — types, config, XML (builder + parseur)

**Files:**
- Create: `lib/mondial-relay/types.ts`
- Create: `lib/mondial-relay/config.ts`
- Create: `lib/mondial-relay/xml.ts`
- Test: `tests/unit/mondial-relay-xml.test.ts`

**Interfaces:**
- Produces:
  - `interface MondialRelayClient { createShipment(input: RelayShipmentInput): Promise<RelayShipmentResult> }`
  - `type RelayShipmentInput = { orderNumber: string; customer: { name: string; email: string; phone: string }; relay: { id: string; name: string; street: string; postalCode: string; city: string }; weightGr: number }`
  - `type RelayShipmentResult = { shipmentNumber: string; labelUrl: string; trackingNumber: string }`
  - `type MondialRelayConfig = { apiUrl: string; login: string; password: string; customerId: string; sender: SenderAddress; defaultWeightGr: number }`
  - `buildShipmentXml(input: RelayShipmentInput, config: MondialRelayConfig): string`
  - `parseShipmentResponse(xml: string): RelayShipmentResult` (throw `MondialRelayError` si statut d'erreur).
  - `getMondialRelayConfig(): MondialRelayConfig | null` (null si env serveur incomplet).

- [ ] **Step 1: Ajouter la dépendance de parsing XML**

Run: `npm install fast-xml-parser`
Expected: ajoute `fast-xml-parser` aux dependencies.

- [ ] **Step 2: Écrire `types.ts` et `config.ts`**

Create `lib/mondial-relay/types.ts` :

```ts
export type RelayShipmentInput = {
  orderNumber: string; // → OrderNo (≤15, [0-9A-Z_-])
  customer: { name: string; email: string; phone: string };
  relay: {
    id: string; // ID nu du point relais (sans préfixe pays)
    name: string;
    street: string;
    postalCode: string;
    city: string;
  };
  weightGr: number;
};

export type RelayShipmentResult = {
  shipmentNumber: string;
  labelUrl: string;
  trackingNumber: string;
};

export interface MondialRelayClient {
  createShipment(input: RelayShipmentInput): Promise<RelayShipmentResult>;
}

export type SenderAddress = {
  name: string;
  street: string;
  houseNo: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
};

export type MondialRelayConfig = {
  apiUrl: string;
  login: string;
  password: string;
  customerId: string;
  sender: SenderAddress;
  defaultWeightGr: number;
};

export class MondialRelayError extends Error {}
```

Create `lib/mondial-relay/config.ts` :

```ts
import type { MondialRelayConfig, SenderAddress } from "./types";

// Expéditeur (boutique) — statique. À ajuster avec l'adresse réelle.
const SENDER: SenderAddress = {
  name: "Coquelicot",
  street: "rue du Gabut",
  houseNo: "12",
  postalCode: "17000",
  city: "La Rochelle",
  phone: "+33000000000",
  email: "bonjour@coquelicot-lr.fr",
};

export const DEFAULT_PARCEL_WEIGHT_GR = 1000;

/** Config serveur, ou null si les identifiants API ne sont pas fournis. */
export function getMondialRelayConfig(): MondialRelayConfig | null {
  const apiUrl = process.env.MONDIAL_RELAY_API_URL;
  const login = process.env.MONDIAL_RELAY_API_LOGIN;
  const password = process.env.MONDIAL_RELAY_API_PASSWORD;
  const customerId = process.env.MONDIAL_RELAY_CUSTOMER_ID;
  if (!apiUrl || !login || !password || !customerId) return null;
  return {
    apiUrl,
    login,
    password,
    customerId,
    sender: SENDER,
    defaultWeightGr: DEFAULT_PARCEL_WEIGHT_GR,
  };
}
```

- [ ] **Step 3: Écrire le test XML (échouera)**

Create `tests/unit/mondial-relay-xml.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildShipmentXml, parseShipmentResponse } from "@/lib/mondial-relay/xml";
import { MondialRelayError, type MondialRelayConfig, type RelayShipmentInput } from "@/lib/mondial-relay/types";

const config: MondialRelayConfig = {
  apiUrl: "https://connect-api-sandbox.mondialrelay.com",
  login: "BDTEST@business-api.mondialrelay.com",
  password: "pw&<secret>",
  customerId: "BDTEST",
  sender: { name: "Coquelicot", street: "rue du Gabut", houseNo: "12", postalCode: "17000", city: "La Rochelle", phone: "+33000000000", email: "shop@x.fr" },
  defaultWeightGr: 1000,
};

const input: RelayShipmentInput = {
  orderNumber: "CQ-260619-ABCD",
  customer: { name: "Camille Martin", email: "c@x.fr", phone: "+33612345678" },
  relay: { id: "012345", name: "Tabac de la Gare", street: "1 rue des Lilas", postalCode: "17000", city: "La Rochelle" },
  weightGr: 1000,
};

describe("buildShipmentXml", () => {
  it("place les identifiants dans Context et le relais en mode 24R", () => {
    const xml = buildShipmentXml(input, config);
    expect(xml).toContain("<CustomerId>BDTEST</CustomerId>");
    expect(xml).toContain("<Login>BDTEST@business-api.mondialrelay.com</Login>");
    expect(xml).toContain('Mode="24R"');
    expect(xml).toContain('Location="FR-012345"');
    expect(xml).toContain("<OrderNo>CQ-260619-ABCD</OrderNo>");
    expect(xml).toContain('<Weight Value="1000" Unit="gr"');
  });

  it("échappe les caractères XML spéciaux", () => {
    const xml = buildShipmentXml(input, config);
    expect(xml).toContain("pw&amp;&lt;secret&gt;");
    expect(xml).not.toContain("pw&<secret>");
  });
});

describe("parseShipmentResponse", () => {
  const ok = `<?xml version="1.0"?><ShipmentCreationResponse><ShipmentsList><Shipment><ShipmentNumber>12345678</ShipmentNumber><LabelList><Label><Output>https://mr/label.pdf</Output></Label></LabelList></Shipment></ShipmentsList></ShipmentCreationResponse>`;
  const err = `<?xml version="1.0"?><ShipmentCreationResponse><StatusList><Status Level="error" Message="Champ invalide"/></StatusList></ShipmentCreationResponse>`;

  it("extrait n° d'expédition + URL d'étiquette", () => {
    const r = parseShipmentResponse(ok);
    expect(r.shipmentNumber).toBe("12345678");
    expect(r.labelUrl).toBe("https://mr/label.pdf");
    expect(r.trackingNumber).toBe("12345678");
  });

  it("lève MondialRelayError sur statut d'erreur", () => {
    expect(() => parseShipmentResponse(err)).toThrow(MondialRelayError);
  });
});
```

- [ ] **Step 4: Lancer → échec attendu**

Run: `npm test -- mondial-relay-xml`
Expected: FAIL (`@/lib/mondial-relay/xml` introuvable).

- [ ] **Step 5: Écrire `lib/mondial-relay/xml.ts`**

```ts
import { XMLParser } from "fast-xml-parser";
import {
  MondialRelayError,
  type MondialRelayConfig,
  type RelayShipmentInput,
  type RelayShipmentResult,
} from "./types";

function esc(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Construit la requête XML ShipmentCreationRequest (API Connect v2).
 * Auth = bloc Context dans le corps. Mode 24R = livraison en point relais ;
 * la Location est l'ID relais préfixé du pays (FR uniquement).
 * Pour le 24R, l'adresse destinataire = celle du point relais (pas de
 * domicile client requis) ; le client est identifié par nom/tél/email.
 */
export function buildShipmentXml(
  input: RelayShipmentInput,
  config: MondialRelayConfig,
): string {
  const s = config.sender;
  const c = input.customer;
  const r = input.relay;
  // Découpe nom : tout en Lastname (≤32 avec Title+Firstname) pour rester simple.
  const lastname = c.name.slice(0, 32);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ShipmentCreationRequest xmlns="http://www.example.org/Request" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Context>
    <Login>${esc(config.login)}</Login>
    <Password>${esc(config.password)}</Password>
    <CustomerId>${esc(config.customerId)}</CustomerId>
    <Culture>fr-FR</Culture>
    <VersionAPI>1.0</VersionAPI>
  </Context>
  <OutputOptions>
    <OutputFormat>A4</OutputFormat>
    <OutputType>PdfUrl</OutputType>
  </OutputOptions>
  <ShipmentsList>
    <Shipment>
      <OrderNo>${esc(input.orderNumber)}</OrderNo>
      <ParcelCount>1</ParcelCount>
      <CollectionMode Mode="CCC"/>
      <DeliveryMode Mode="24R" Location="FR-${esc(r.id)}"/>
      <Parcels>
        <Parcel>
          <Content>Composition florale</Content>
          <Weight Value="${input.weightGr}" Unit="gr"/>
        </Parcel>
      </Parcels>
      <Sender>
        <Address>
          <Lastname>${esc(s.name)}</Lastname>
          <Streetname>${esc(s.street)}</Streetname>
          <HouseNo>${esc(s.houseNo)}</HouseNo>
          <CountryCode>FR</CountryCode>
          <PostCode>${esc(s.postalCode)}</PostCode>
          <City>${esc(s.city)}</City>
          <MobileNo>${esc(s.phone)}</MobileNo>
          <Email>${esc(s.email)}</Email>
        </Address>
      </Sender>
      <Recipient>
        <Address>
          <Lastname>${esc(lastname)}</Lastname>
          <Streetname>${esc(r.street)}</Streetname>
          <CountryCode>FR</CountryCode>
          <PostCode>${esc(r.postalCode)}</PostCode>
          <City>${esc(r.city)}</City>
          <MobileNo>${esc(c.phone)}</MobileNo>
          <Email>${esc(c.email)}</Email>
        </Address>
      </Recipient>
    </Shipment>
  </ShipmentsList>
</ShipmentCreationRequest>`;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * Parse la réponse. NB : noms d'éléments à confirmer contre la sandbox
 * (cf. Task 4, step de vérification). On gère plusieurs casses courantes.
 */
export function parseShipmentResponse(xml: string): RelayShipmentResult {
  const doc = parser.parse(xml) as Record<string, unknown>;
  // Recherche tolérante des statuts d'erreur.
  const flat = JSON.stringify(doc);
  if (/"@_Level"\s*:\s*"error"/i.test(flat)) {
    const msg = flat.match(/"@_Message"\s*:\s*"([^"]*)"/i)?.[1] ?? "Erreur Mondial Relay";
    throw new MondialRelayError(msg);
  }
  const shipmentNumber = flat.match(/"ShipmentNumber"\s*:\s*"?([0-9A-Z-]+)"?/i)?.[1];
  const labelUrl = flat.match(/"Output"\s*:\s*"(https?:\/\/[^"]+)"/i)?.[1];
  if (!shipmentNumber || !labelUrl) {
    throw new MondialRelayError("Réponse Mondial Relay inattendue (n° ou étiquette absents).");
  }
  return { shipmentNumber, labelUrl, trackingNumber: shipmentNumber };
}
```

- [ ] **Step 6: Lancer → succès attendu**

Run: `npm test -- mondial-relay-xml`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add package.json package-lock.json lib/mondial-relay tests/unit/mondial-relay-xml.test.ts
git commit -m "feat(mondial-relay): types, config et (dé)sérialisation XML Connect v2"
```

---

### Task 4: `lib/mondial-relay/client.ts` — client réel (transport fetch)

**Files:**
- Create: `lib/mondial-relay/client.ts`
- Test: `tests/unit/mondial-relay-client.test.ts`

**Interfaces:**
- Consumes: `MondialRelayClient`, `MondialRelayConfig`, `buildShipmentXml`, `parseShipmentResponse`, `getMondialRelayConfig`.
- Produces:
  - `createMondialRelayClient(config: MondialRelayConfig, fetchImpl?: typeof fetch): MondialRelayClient`
  - `getMondialRelayClient(): MondialRelayClient | null` (null si config absente).

- [ ] **Step 1: Écrire le test (échouera)**

Create `tests/unit/mondial-relay-client.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { createMondialRelayClient } from "@/lib/mondial-relay/client";
import { MondialRelayError, type MondialRelayConfig } from "@/lib/mondial-relay/types";

const config: MondialRelayConfig = {
  apiUrl: "https://sandbox.example.com",
  login: "BDTEST@business-api.mondialrelay.com",
  password: "pw",
  customerId: "BDTEST",
  sender: { name: "Coquelicot", street: "rue du Gabut", houseNo: "12", postalCode: "17000", city: "La Rochelle", phone: "+33000000000", email: "shop@x.fr" },
  defaultWeightGr: 1000,
};
const input = {
  orderNumber: "CQ-260619-ABCD",
  customer: { name: "Camille", email: "c@x.fr", phone: "+33612345678" },
  relay: { id: "012345", name: "Tabac", street: "1 rue X", postalCode: "17000", city: "La Rochelle" },
  weightGr: 1000,
};
const okXml = `<ShipmentCreationResponse><ShipmentsList><Shipment><ShipmentNumber>99887766</ShipmentNumber><LabelList><Label><Output>https://mr/lbl.pdf</Output></Label></LabelList></Shipment></ShipmentsList></ShipmentCreationResponse>`;

describe("createMondialRelayClient", () => {
  it("POST l'XML et renvoie le résultat parsé", async () => {
    const fetchImpl = vi.fn(async () => new Response(okXml, { status: 200 }));
    const client = createMondialRelayClient(config, fetchImpl as unknown as typeof fetch);
    const res = await client.createShipment(input);
    expect(res.shipmentNumber).toBe("99887766");
    expect(res.labelUrl).toBe("https://mr/lbl.pdf");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://sandbox.example.com/api/shipment");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "Content-Type": "application/xml" });
  });

  it("lève MondialRelayError sur HTTP non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const client = createMondialRelayClient(config, fetchImpl as unknown as typeof fetch);
    await expect(client.createShipment(input)).rejects.toBeInstanceOf(MondialRelayError);
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npm test -- mondial-relay-client`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire `lib/mondial-relay/client.ts`**

```ts
import { getMondialRelayConfig } from "./config";
import { MondialRelayError, type MondialRelayClient, type MondialRelayConfig } from "./types";
import { buildShipmentXml, parseShipmentResponse } from "./xml";

export function createMondialRelayClient(
  config: MondialRelayConfig,
  fetchImpl: typeof fetch = fetch,
): MondialRelayClient {
  return {
    async createShipment(input) {
      const body = buildShipmentXml(input, config);
      const res = await fetchImpl(`${config.apiUrl}/api/shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body,
      });
      if (!res.ok) {
        throw new MondialRelayError(`HTTP ${res.status} de Mondial Relay.`);
      }
      return parseShipmentResponse(await res.text());
    },
  };
}

export function getMondialRelayClient(): MondialRelayClient | null {
  const config = getMondialRelayConfig();
  return config ? createMondialRelayClient(config) : null;
}
```

- [ ] **Step 4: Lancer → succès attendu**

Run: `npm test -- mondial-relay-client`
Expected: PASS.

- [ ] **Step 5: Vérification sandbox (avec identifiants) — à faire dès que l'env MR est disponible**

Quand `.env.local` contient les identifiants sandbox `BDTEST` (cf. spec §6), envoyer une vraie requête pour **confirmer les noms d'éléments de la réponse** et ajuster `parseShipmentResponse`/les fixtures si besoin :

```bash
# Exemple ; adapter le corps XML (cf. buildShipmentXml).
curl -s -X POST https://connect-api-sandbox.mondialrelay.com/api/shipment \
  -H "Content-Type: application/xml" --data-binary @/tmp/shipment.xml | tee /tmp/mr-response.xml
```

Si les éléments réels diffèrent (`Output`/`ShipmentNumber`/`Level`), corriger `parseShipmentResponse` et les fixtures de Task 3, relancer `npm test -- mondial-relay`. Si la sandbox exige du JSON (`/api/shipments` + Basic Auth), basculer la sérialisation dans `xml.ts`/`client.ts` (interface inchangée) — voir spec §4 (fallback).

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add lib/mondial-relay/client.ts tests/unit/mondial-relay-client.test.ts
git commit -m "feat(mondial-relay): client Connect v2 (transport fetch, injectable)"
```

---

### Task 5: `ensureRelayShipment` idempotent

**Files:**
- Create: `lib/mondial-relay/ensure-shipment.ts`
- Test: `tests/unit/ensure-relay-shipment.test.ts`

**Interfaces:**
- Consumes: `Db`, `orders` (colonnes relais), `MondialRelayClient`, `getMondialRelayClient`, `DEFAULT_PARCEL_WEIGHT_GR`.
- Produces: `ensureRelayShipment(db: Db, orderId: string, client?: MondialRelayClient | null): Promise<RelayShipmentResult | null>` — idempotent ; `null` si déjà expédié, si pas de point relais, ou si aucun client configuré ; **throw** en cas d'échec API réel (pour le bouton admin).

- [ ] **Step 1: Écrire le test (échouera)**

Create `tests/unit/ensure-relay-shipment.test.ts` :

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { orders } from "@/lib/db/schema";
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";
import type { MondialRelayClient } from "@/lib/mondial-relay/types";
import { createTestDb } from "../helpers/db";

async function makeRelayOrder(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [o] = await db.insert(orders).values({
    number: "CQ-TEST-REL1",
    status: "paid",
    customerName: "Camille",
    customerEmail: "c@x.fr",
    customerPhone: "+33612345678",
    fulfillment: "mondial_relay",
    relayPointId: "012345",
    relayPointName: "Tabac",
    shippingAddress: "1 rue X",
    shippingPostalCode: "17000",
    shippingCity: "La Rochelle",
    shippingCountry: "FR",
    subtotalCents: 4800,
    deliveryFeeCents: 490,
    totalCents: 5290,
  }).returning();
  return o;
}

const fakeClient = (): MondialRelayClient & { calls: number } => {
  const c = {
    calls: 0,
    async createShipment() {
      c.calls++;
      return { shipmentNumber: "555", labelUrl: "https://mr/l.pdf", trackingNumber: "555" };
    },
  };
  return c;
};

describe("ensureRelayShipment", () => {
  it("crée l'expédition et persiste n°/étiquette/suivi", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    const client = fakeClient();
    const res = await ensureRelayShipment(db, o.id, client);
    expect(res?.shipmentNumber).toBe("555");
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after.relayShipmentNumber).toBe("555");
    expect(after.relayLabelUrl).toBe("https://mr/l.pdf");
    expect(after.trackingNumber).toBe("555");
  });

  it("est idempotent : 2e appel n'appelle pas le client", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    const client = fakeClient();
    await ensureRelayShipment(db, o.id, client);
    await ensureRelayShipment(db, o.id, client);
    expect(client.calls).toBe(1);
  });

  it("retourne null sans client configuré", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    expect(await ensureRelayShipment(db, o.id, null)).toBeNull();
  });

  it("propage l'erreur si le client échoue", async () => {
    const db = await createTestDb({ seed: false });
    const o = await makeRelayOrder(db);
    const client: MondialRelayClient = { async createShipment() { throw new Error("boom"); } };
    await expect(ensureRelayShipment(db, o.id, client)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npm test -- ensure-relay-shipment`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire `lib/mondial-relay/ensure-shipment.ts`**

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { DEFAULT_PARCEL_WEIGHT_GR } from "./config";
import { getMondialRelayClient } from "./client";
import type { MondialRelayClient, RelayShipmentResult } from "./types";

/**
 * Crée l'expédition Mondial Relay pour une commande payée, idempotent.
 * Retourne null si : déjà expédiée, pas de point relais, ou client non
 * configuré (env MR absente). Throw si l'appel API échoue (le bouton admin
 * affiche l'erreur ; les appels webhook/confirmation l'avalent).
 */
export async function ensureRelayShipment(
  db: Db,
  orderId: string,
  client: MondialRelayClient | null = getMondialRelayClient(),
): Promise<RelayShipmentResult | null> {
  if (!client) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  if (order.relayShipmentNumber) return null; // idempotent
  if (!order.relayPointId || !order.shippingAddress || !order.shippingCity || !order.shippingPostalCode) {
    return null; // pas un point relais exploitable
  }

  const result = await client.createShipment({
    orderNumber: order.number,
    customer: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone ?? "",
    },
    relay: {
      id: order.relayPointId,
      name: order.relayPointName ?? "",
      street: order.shippingAddress,
      postalCode: order.shippingPostalCode,
      city: order.shippingCity,
    },
    weightGr: DEFAULT_PARCEL_WEIGHT_GR,
  });

  // Garde idempotente concurrente : n'écrit que si toujours sans n°.
  await db
    .update(orders)
    .set({
      relayShipmentNumber: result.shipmentNumber,
      relayLabelUrl: result.labelUrl,
      trackingNumber: result.trackingNumber,
    })
    .where(and(eq(orders.id, orderId), isNull(orders.relayShipmentNumber)));

  return result;
}
```

- [ ] **Step 4: Lancer → succès attendu**

Run: `npm test -- ensure-relay-shipment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add lib/mondial-relay/ensure-shipment.ts tests/unit/ensure-relay-shipment.test.ts
git commit -m "feat(mondial-relay): ensureRelayShipment idempotent"
```

---

### Task 6: `createPendingOrder` + action checkout (relais, garde FR, téléphone requis, forfait, ligne Stripe) + garde `setTrackingNumber`

**Files:**
- Modify: `lib/orders.ts` (`CheckoutCustomerInput`, `createPendingOrder`, `setTrackingNumber`, import constante)
- Modify: `app/checkout/actions.ts` (`CheckoutSchema`, mapping)
- Modify: `tests/unit/orders.test.ts` (import constante + nouveaux cas)

**Interfaces:**
- Consumes: `MONDIAL_RELAY_FEE_CENTS` (Task 2), enum `mondial_relay` (Task 1).
- Produces: `createPendingOrder` accepte `relayPointId`, `relayPointName`, `relayStreet`, `relayPostalCode`, `relayCity` et applique le forfait pour `mondial_relay` ; `setTrackingNumber` autorisé pour `mondial_relay`.

- [ ] **Step 1: Écrire/adapter les tests (échoueront)**

Dans `tests/unit/orders.test.ts` : remplacer l'import `SHIPPING_FEE_CENTS` par `MONDIAL_RELAY_FEE_CENTS` ; ajouter :

```ts
describe("createPendingOrder — Mondial Relay", () => {
  it("stocke le point relais et applique le forfait", async () => {
    const { order } = await createPendingOrder(
      db,
      {
        name: "Camille Martin",
        email: "c@x.fr",
        phone: "+33612345678",
        fulfillment: "mondial_relay",
        relayPointId: "012345",
        relayPointName: "Tabac de la Gare",
        relayStreet: "1 rue des Lilas",
        relayPostalCode: "17000",
        relayCity: "La Rochelle",
      },
      [{ slug: "rivage", qty: 1 }],
    );
    expect(order.fulfillment).toBe("mondial_relay");
    expect(order.relayPointId).toBe("012345");
    expect(order.shippingAddress).toBe("1 rue des Lilas");
    expect(order.shippingCountry).toBe("FR");
    expect(order.deliveryFeeCents).toBe(MONDIAL_RELAY_FEE_CENTS);
  });

  it("setTrackingNumber fonctionne pour mondial_relay", async () => {
    const { order } = await createPendingOrder(db, {
      name: "C", email: "c@x.fr", phone: "+33612345678",
      fulfillment: "mondial_relay", relayPointId: "012345", relayPointName: "T",
      relayStreet: "1 rue X", relayPostalCode: "17000", relayCity: "La Rochelle",
    }, [{ slug: "rivage", qty: 1 }]);
    await setTrackingNumber(db, order.id, "12345678");
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after.trackingNumber).toBe("12345678");
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npm test -- orders`
Expected: FAIL (champs relais inconnus / `SHIPPING_FEE_CENTS` retiré).

- [ ] **Step 3: Modifier `lib/orders.ts`**

Import (lignes 19-32) : remplacer `SHIPPING_FEE_CENTS` par `MONDIAL_RELAY_FEE_CENTS` (dans l'import et le ré-export ligne 32).

`CheckoutCustomerInput` (lignes 54-67) : ajouter les champs relais (et garder les `shipping*` pour la rétro-compat des appels legacy) :

```ts
export type CheckoutCustomerInput = {
  name: string;
  email: string;
  phone?: string;
  fulfillment: Fulfillment;
  // Point relais Mondial Relay (mode mondial_relay).
  relayPointId?: string;
  relayPointName?: string;
  relayStreet?: string;
  relayPostalCode?: string;
  relayCity?: string;
  // Champs legacy (poste) — conservés pour les commandes d'avant.
  shippingAddress?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  shippingCountry?: ShippingCountryCode;
  deliveryDate?: string;
  cardMessage?: string;
};
```

Calcul du forfait + insert (remplacer lignes 180-203). Le forfait s'applique dès que ce n'est pas un retrait ; pour `mondial_relay`, l'adresse du relais est stockée dans les colonnes `shipping*` :

```ts
  const subtotalCents = resolved.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const isRelay = customer.fulfillment === "mondial_relay";
  const isPoste = customer.fulfillment === "poste";
  const deliveryFeeCents =
    customer.fulfillment === "retrait" ? 0 : MONDIAL_RELAY_FEE_CENTS;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        number: generateOrderNumber(),
        status: "pending",
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone || null,
        fulfillment: customer.fulfillment,
        shippingAddress: isRelay
          ? (customer.relayStreet ?? null)
          : isPoste
            ? (customer.shippingAddress ?? null)
            : null,
        shippingPostalCode: isRelay
          ? (customer.relayPostalCode ?? null)
          : isPoste
            ? (customer.shippingPostalCode ?? null)
            : null,
        shippingCity: isRelay
          ? (customer.relayCity ?? null)
          : isPoste
            ? (customer.shippingCity ?? null)
            : null,
        shippingCountry: isRelay ? "FR" : isPoste ? (customer.shippingCountry ?? null) : null,
        relayPointId: isRelay ? (customer.relayPointId ?? null) : null,
        relayPointName: isRelay ? (customer.relayPointName ?? null) : null,
        deliveryDate: customer.deliveryDate || null,
        cardMessage: customer.cardMessage || null,
        subtotalCents,
        deliveryFeeCents,
        totalCents: subtotalCents + deliveryFeeCents,
      })
      .returning();
```

`setTrackingNumber` (ligne 490) : autoriser `mondial_relay` :

```ts
import { inArray } from "drizzle-orm"; // déjà importé
// ...
    .where(and(eq(orders.id, orderId), inArray(orders.fulfillment, ["poste", "mondial_relay"])))
```

Message d'erreur (ligne 494) : « Commande introuvable ou sans expédition. »

- [ ] **Step 4: Modifier `app/checkout/actions.ts`**

`CheckoutSchema` : téléphone requis, champs relais requis, fulfillment forcé `mondial_relay`, garde FR. Remplacer le schéma (lignes 30-86) :

```ts
const CheckoutSchema = z.object({
  name: z.string().trim().min(1, { error: "Votre nom est requis." }).max(120),
  email: z.email({ error: "Adresse email invalide." }),
  phone: z.string().trim().min(6, { error: "Téléphone requis (notification du point relais)." }).max(25),
  relayPointId: z.string().trim().min(1, { error: "Choisissez un point relais." }).max(20),
  relayPointName: z.string().trim().min(1).max(120),
  relayStreet: z.string().trim().min(1).max(200),
  relayPostalCode: z.string().trim().regex(/^\d{5}$/, { error: "Code postal du relais invalide." }),
  relayCity: z.string().trim().min(1).max(100),
  relayCountry: z.literal("FR", { error: "Mondial Relay : France uniquement." }),
  deliveryDate: z.union([z.literal(""), z.iso.date({ error: "Date invalide." })]).optional(),
  cardMessage: z.string().trim().max(300, { error: "300 caractères max." }).optional(),
});
```

Dans `startCheckout`, remplacer le `safeParse` (lignes 101-112) par la lecture des champs relais :

```ts
  const parsed = CheckoutSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    relayPointId: formData.get("relayPointId") ?? "",
    relayPointName: formData.get("relayPointName") ?? "",
    relayStreet: formData.get("relayStreet") ?? "",
    relayPostalCode: formData.get("relayPostalCode") ?? "",
    relayCity: formData.get("relayCity") ?? "",
    relayCountry: formData.get("relayCountry") ?? "",
    deliveryDate: formData.get("deliveryDate") ?? "",
    cardMessage: formData.get("cardMessage") ?? "",
  });
```

Et l'appel `createPendingOrder` (lignes 120-137) :

```ts
    const { order, items: orderLines } = await createPendingOrder(
      db,
      {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        fulfillment: "mondial_relay",
        relayPointId: parsed.data.relayPointId,
        relayPointName: parsed.data.relayPointName,
        relayStreet: parsed.data.relayStreet,
        relayPostalCode: parsed.data.relayPostalCode,
        relayCity: parsed.data.relayCity,
        deliveryDate: parsed.data.deliveryDate || undefined,
        cardMessage: parsed.data.cardMessage,
      },
      items,
    );
```

Ligne Stripe du port (lignes 163-174) : renommer le produit :

```ts
                  product_data: { name: "Livraison Mondial Relay — point relais" },
```

Nettoyer les imports devenus inutiles (`isShippingCountry`, `ShippingCountryCode`) si plus référencés.

- [ ] **Step 5: Lancer → succès attendu**

Run: `npm test -- orders`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add lib/orders.ts app/checkout/actions.ts tests/unit/orders.test.ts
git commit -m "feat(checkout): commande Mondial Relay (point relais, forfait, FR, tél requis)"
```

---

### Task 7: `RelayPicker` + refonte `checkout-form.tsx`

**Files:**
- Create: `components/relay-picker.tsx`
- Modify: `components/checkout-form.tsx`

**Interfaces:**
- Consumes: `MONDIAL_RELAY_FEE_CENTS` (Task 2), action `startCheckout` (Task 6).
- Produces: champs cachés `relayPointId`, `relayPointName`, `relayStreet`, `relayPostalCode`, `relayCity`, `relayCountry` (=`FR`) renseignés par la sélection ; `<RelayPicker onSelect={...} value={...} />`.

- [ ] **Step 1: Lire le guide Next pour `next/script`**

Lire `node_modules/next/dist/docs/` (section Script / `next/script`) pour la bonne API de chargement de script tiers dans cette version de Next.

- [ ] **Step 2: Écrire `components/relay-picker.tsx`**

Composant client qui charge jQuery + le plugin officiel, initialise le widget en `FR` et remonte la sélection via le callback `OnParcelShopSelected`.

```tsx
"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

export type RelaySelection = {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
};

declare global {
  interface JQuery {
    MR_ParcelShopPicker(opts: Record<string, unknown>): void;
  }
  interface Window {
    jQuery?: (selector: string | HTMLElement) => JQuery;
  }
}

const BRAND = process.env.NEXT_PUBLIC_MONDIAL_RELAY_BRAND ?? "BDTEST";

export function RelayPicker({
  value,
  onSelect,
}: {
  value: RelaySelection | null;
  onSelect: (s: RelaySelection) => void;
}) {
  const ready = useRef(false);

  function init() {
    const $ = window.jQuery;
    if (!$ || ready.current) return;
    ready.current = true;
    $("#mr-widget").MR_ParcelShopPicker({
      Target: "#mr-relay-id",
      Brand: BRAND,
      Country: "FR",
      AllowedCountries: "FR",
      EnableGeolocalisatedSearch: true,
      OnParcelShopSelected: (data: Record<string, string>) => {
        onSelect({
          id: data.ID,
          name: data.Nom ?? data.name ?? "",
          street: data.Adresse1 ?? data.Adresse ?? "",
          postalCode: data.CP ?? "",
          city: data.Ville ?? "",
        });
      },
    });
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relay-picker">
      <Script
        src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"
        strategy="afterInteractive"
        onLoad={init}
      />
      <Script
        src="https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js"
        strategy="afterInteractive"
        onLoad={init}
      />
      <div id="mr-widget" />
      <input type="hidden" id="mr-relay-id" />
      {value && (
        <p className="relay-picker__selected" data-testid="relay-selected">
          Point relais : <strong>{value.name}</strong> — {value.street}, {value.postalCode} {value.city}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Refondre `components/checkout-form.tsx`**

Remplacer le choix retrait/poste + l'adresse domicile par le `RelayPicker`. Changements clés :

- Imports : retirer `SHIPPING_COUNTRY_CODES/LABELS`, `Fulfillment`, `ShippingCountryCode` ; importer `MONDIAL_RELAY_FEE_CENTS` et `RelayPicker, type RelaySelection`.
- État : `const [relay, setRelay] = useState<RelaySelection | null>(null);` (supprimer `fulfillment`/`country`).
- `feeCents = MONDIAL_RELAY_FEE_CENTS` (toujours).
- Téléphone : ajouter `required`.
- Remplacer le `<fieldset>` « Retrait ou envoi postal » par :

```tsx
        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Livraison en point relais</legend>
          <p className="body">
            Vos achats sont livrés en point relais <strong>Mondial Relay</strong> (France) —{" "}
            {formatEuros(MONDIAL_RELAY_FEE_CENTS)}.
          </p>
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
          <label className="form-field">
            <span>
              Date de livraison souhaitée <em>(optionnel — sous réserve)</em>
            </span>
            <input type="date" name="deliveryDate" min={tomorrowISO()} />
          </label>
          <label className="form-field">
            <span>Message pour la carte <em>(optionnel)</em></span>
            <textarea name="cardMessage" rows={2} maxLength={300} placeholder="Joyeux anniversaire…" />
          </label>
        </fieldset>
```

- Récapitulatif : la ligne port affiche toujours « Livraison (point relais) » + `formatEuros(feeCents)`.
- Bouton submit : `disabled={pending || !relay}` ; texte si pas de relais : « Choisissez un point relais ».

- [ ] **Step 4: Vérifs locales**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/relay-picker.tsx components/checkout-form.tsx
git commit -m "feat(checkout): widget point relais Mondial Relay (France), suppression retrait/poste"
```

---

### Task 8: Branchements paiement → `ensureRelayShipment` (webhook + page de confirmation)

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `app/commande/confirmee/page.tsx`
- Modify: `tests/unit/webhook.test.ts` (commande mondial_relay, pas d'appel réseau car env MR absente)

**Interfaces:**
- Consumes: `ensureRelayShipment` (Task 5), `markOrderPaidBySession`.

- [ ] **Step 1: Adapter le test webhook (échouera si régression)**

Dans `tests/unit/webhook.test.ts`, ajouter un cas : une commande `mondial_relay` payée via webhook reste payée et ne lève pas (l'env MR est absente en test → `ensureRelayShipment` saute). Modifier `makePendingOrder` pour accepter le fulfillment, ou ajouter :

```ts
it("traite une commande mondial_relay sans env MR (skip étiquette)", async () => {
  const db = await getDb();
  const { order } = await createPendingOrder(db, {
    name: "Camille", email: "c@x.fr", phone: "+33612345678",
    fulfillment: "mondial_relay", relayPointId: "012345", relayPointName: "T",
    relayStreet: "1 rue X", relayPostalCode: "17000", relayCity: "La Rochelle",
  }, [{ slug: "rivage", qty: 1 }]);
  await attachStripeSession(db, order.id, "cs_test_wh_mr");
  const payload = checkoutCompletedPayload("cs_test_wh_mr");
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  expect((await post(payload, signature)).status).toBe(200);
  const after = await getOrderBySessionId(db, "cs_test_wh_mr");
  expect(after?.order.status).toBe("paid");
  expect(after?.order.relayShipmentNumber).toBeNull(); // pas d'env MR → skip
});
```

- [ ] **Step 2: Lancer → échec attendu (import `createPendingOrder` manquant dans le test, ou route inchangée)**

Run: `npm test -- webhook`
Expected: FAIL (ou le cas n'existe pas encore).

- [ ] **Step 3: Modifier `app/api/stripe/webhook/route.ts`**

Importer et appeler `ensureRelayShipment` après le marquage payé, en avalant l'erreur :

```ts
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";
// ...
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const order = await markOrderPaidBySession(
          db,
          session.id,
          paymentIntentId(session.payment_intent),
        );
        if (order) {
          try {
            await ensureRelayShipment(db, order.id);
          } catch (err) {
            console.error("[mondial-relay] étiquette non générée (webhook)", err);
          }
        }
      }
      break;
    }
```

- [ ] **Step 4: Modifier `app/commande/confirmee/page.tsx`**

Après le `markOrderPaidBySession` (lignes 35-43), tenter l'étiquette (best-effort) :

```ts
      if (session.payment_status === "paid") {
        const paid = await markOrderPaidBySession(
          db,
          sessionId,
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
        );
        if (paid) {
          try {
            const { ensureRelayShipment } = await import("@/lib/mondial-relay/ensure-shipment");
            await ensureRelayShipment(db, paid.id);
          } catch (err) {
            console.error("[mondial-relay] étiquette non générée (confirmation)", err);
          }
        }
      }
```

Mettre à jour la copie (lignes 95-100) : remplacer le ternaire poste/retrait par « Votre commande partira en point relais Mondial Relay très vite. »

- [ ] **Step 5: Lancer → succès attendu**

Run: `npm test -- webhook`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add app/api/stripe/webhook/route.ts app/commande/confirmee/page.tsx tests/unit/webhook.test.ts
git commit -m "feat(mondial-relay): génération auto de l'étiquette au paiement (webhook + confirmation)"
```

---

### Task 9: Admin — affichage point relais, génération d'étiquette, lien PDF, libellés

**Files:**
- Modify: `app/(admin)/admin/(panel)/commandes/actions.ts` (action `generateRelayLabel`)
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/page.tsx` (affichage + bouton + lien PDF)
- Create: `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`
- Modify: `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx` (placeholder)
- Modify: `app/(admin)/admin/(panel)/commandes/orders-table.tsx:54` et `kanban-board.tsx:135` (libellé)

**Interfaces:**
- Consumes: `ensureRelayShipment` (Task 5), `getMondialRelayClient`.
- Produces: action `generateRelayLabel(orderId: string): Promise<StatusActionState>`.

- [ ] **Step 1: Ajouter l'action `generateRelayLabel`**

Dans `app/(admin)/admin/(panel)/commandes/actions.ts` :

```ts
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";
// ...
export async function generateRelayLabel(orderId: string): Promise<StatusActionState> {
  await verifySession();
  if (!z.uuid().safeParse(orderId).success) return { error: "Requête invalide." };
  try {
    const db = await getDb();
    const res = await ensureRelayShipment(db, orderId);
    if (!res) {
      return { error: "Étiquette non générée (déjà créée, point relais manquant, ou API Mondial Relay non configurée)." };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur Mondial Relay." };
  }
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}
```

- [ ] **Step 2: Créer le bouton client `label-button.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { generateRelayLabel, type StatusActionState } from "../actions";

export function LabelButton({ orderId, hasLabel }: { orderId: string; hasLabel: boolean }) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(
    async () => generateRelayLabel(orderId),
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-wine px-3.5 py-2 text-sm font-semibold text-linen transition hover:bg-wine-dark disabled:opacity-60"
      >
        {pending ? "Génération…" : hasLabel ? "Régénérer l'étiquette" : "Générer l'étiquette"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Adapter `[id]/page.tsx`**

- Import : `import { LabelButton } from "./label-button";`
- Bloc fulfillment (lignes 112-148) : remplacer la branche `poste` par l'affichage du point relais + l'étiquette. Remplacer le contenu par :

```tsx
              <p className="mb-1 font-medium">
                {order.fulfillment === "mondial_relay"
                  ? "Point relais Mondial Relay"
                  : order.fulfillment === "poste"
                    ? "Envoi par la poste"
                    : "Retrait atelier"}
              </p>
              {(order.fulfillment === "mondial_relay" || order.fulfillment === "poste") && (
                <p className="whitespace-pre-line text-stone-600">
                  {order.relayPointName && <><strong>{order.relayPointName}</strong><br /></>}
                  {order.shippingAddress}
                  {(order.shippingPostalCode || order.shippingCity) && (
                    <><br />{order.shippingPostalCode} {order.shippingCity}</>
                  )}
                  {order.relayPointId && <><br /><span className="text-xs text-stone-400">ID relais : {order.relayPointId}</span></>}
                </p>
              )}
```

- Sous le bloc, pour `mondial_relay`, ajouter étiquette + suivi (remplace le bloc `poste`-only lignes 140-148) :

```tsx
            {order.fulfillment === "mondial_relay" && (
              <div className="mt-4 border-t border-stone-200 pt-4">
                <p className="mb-2 font-medium">Étiquette Mondial Relay</p>
                <LabelButton orderId={order.id} hasLabel={!!order.relayLabelUrl} />
                {order.relayLabelUrl && (
                  <p className="mt-2">
                    <a href={order.relayLabelUrl} target="_blank" rel="noopener noreferrer" className="text-wine hover:underline">
                      Télécharger l'étiquette (PDF)
                    </a>
                  </p>
                )}
                <div className="mt-3">
                  <p className="mb-2 font-medium">N° de suivi</p>
                  <TrackingForm orderId={order.id} trackingNumber={order.trackingNumber} />
                </div>
              </div>
            )}
```

- Ligne 80 (résumé port) : « Retrait atelier — offert » → afficher `formatEuros(order.deliveryFeeCents)` sinon « offert » (le ternaire existant `order.deliveryFeeCents > 0 ? formatEuros(...) : "..."` suffit ; remplacer le texte du sinon par « offert »).

- [ ] **Step 4: Renommer le placeholder de suivi**

`tracking-form.tsx:25` : `placeholder="N° de suivi Colissimo"` → `placeholder="N° de suivi Mondial Relay"`.

- [ ] **Step 5: Libellés liste + kanban**

`orders-table.tsx:54` et `kanban-board.tsx:135` : remplacer
`{order.fulfillment === "poste" ? "Envoi postal" : "Retrait"}` par
`{order.fulfillment === "retrait" ? "Retrait" : "Mondial Relay"}`.

- [ ] **Step 6: Vérifs + commit**

```bash
npm run typecheck && npm run lint
git add "app/(admin)"
git commit -m "feat(admin): point relais, génération d'étiquette Mondial Relay, libellés"
```

---

### Task 10: Variables d'environnement + e2e

**Files:**
- Modify: `.env.example`, `.env.local`
- Modify: `tests/e2e/05-checkout.spec.ts`
- Modify: `playwright.config.ts` — neutraliser explicitement l'env MR côté serveur e2e.

- [ ] **Step 1: Ajouter les variables d'env**

Dans `.env.example` (et `.env.local` avec les valeurs sandbox), ajouter :

```bash
# Mondial Relay — widget (public) + API Connect (serveur)
NEXT_PUBLIC_MONDIAL_RELAY_BRAND=BDTEST
MONDIAL_RELAY_API_URL=https://connect-api-sandbox.mondialrelay.com
MONDIAL_RELAY_API_LOGIN=BDTEST@business-api.mondialrelay.com
MONDIAL_RELAY_API_PASSWORD=2crtPDo0ZL7Q*3kLumB
MONDIAL_RELAY_CUSTOMER_ID=BDTEST
```

- [ ] **Step 2: Neutraliser l'env MR dans `playwright.config.ts`**

Dans le bloc `webServer.env` (à côté de `DATABASE_URL: ""`), forcer l'absence des
identifiants MR côté serveur e2e pour que `ensureRelayShipment` saute (pas d'appel
sandbox en CI) quelle que soit la sémantique de merge de Playwright :

```ts
      DATABASE_URL: "",
      // Pas d'appel Mondial Relay réel en e2e → ensureRelayShipment saute.
      MONDIAL_RELAY_API_URL: "",
      MONDIAL_RELAY_API_LOGIN: "",
      MONDIAL_RELAY_API_PASSWORD: "",
      MONDIAL_RELAY_CUSTOMER_ID: "",
```

- [ ] **Step 3: Adapter l'e2e checkout — stub du widget + sélection simulée**

Dans `tests/e2e/05-checkout.spec.ts`, premier test : avant `page.goto("/checkout")`, router le script du widget vers un stub déterministe (FR), puis remplacer le bloc « envoi postal » par la sélection de relais.

Stub du plugin (au début du test, sur la `page`) :

```ts
await page.route("**/parcelshop-picker/**", async (route) => {
  await route.fulfill({
    contentType: "application/javascript",
    body: `window.jQuery = window.jQuery || ((sel) => ({ MR_ParcelShopPicker: (o) => {
      const data = { ID: "012345", Nom: "Tabac de la Gare", Adresse1: "1 rue des Lilas", CP: "17000", Ville: "La Rochelle" };
      setTimeout(() => o.OnParcelShopSelected(data), 50);
    }}));`,
  });
});
// Neutraliser le chargement de jQuery CDN (le stub fournit window.jQuery).
await page.route("**/jquery*.js", (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
```

Remplacer les lignes de formulaire « Envoi par la poste » + adresse (lignes 73-83 actuelles) par :

```ts
  // Sélection automatique du point relais (widget stubé)
  await expect(page.getByTestId("relay-selected")).toContainText("Tabac de la Gare");
  // total = sous-total (92€) + forfait
  await expect(page.getByTestId("checkout-total")).toBeVisible();
```

Le second test (admin) : remplacer les assertions « Envoi postal »/adresse domicile par « Mondial Relay » et l'affichage du point relais ; le placeholder devient « N° de suivi Mondial Relay ». La commande reste payée même sans étiquette (env MR absente en e2e). Ajuster les montants attendus au nouveau forfait `MONDIAL_RELAY_FEE_CENTS`.

- [ ] **Step 4: Lancer la suite e2e**

Run: `npm run test:e2e -- 05-checkout`
Expected: PASS (parcours panier → relais → Stripe test → confirmation → admin).

- [ ] **Step 5: Vérification finale + commit**

```bash
npm run typecheck && npm run lint && npm test
git add .env.example tests/e2e/05-checkout.spec.ts
git commit -m "feat(e2e): parcours checkout Mondial Relay + variables d'env (sandbox)"
```

---

## Auto-revue du plan (effectuée)

- **Couverture spec** : §1 schéma → T1 ; §2 picker → T7 ; §3 tarif/FR → T2,T6 ; §4 API Connect → T3,T4,T5 ; §5 admin → T9 ; §6 env → T10,T4(sandbox) ; §7 tests → présents dans chaque task + T10 ; §9 risques : contrat (T4 step sandbox), frais (hors-code, à confirmer métier), 0003/0004 (T1 step 1), jQuery/Next (T7 step 1).
- **Pas de placeholder** : chaque step de code fournit le code réel. La seule incertitude (noms d'éléments de réponse XML) est traitée par le step de vérification sandbox de T4, derrière l'interface `MondialRelayClient`.
- **Cohérence des types** : `RelayShipmentInput`/`RelayShipmentResult`/`MondialRelayClient` définis en T3 et consommés tels quels en T4/T5 ; `MONDIAL_RELAY_FEE_CENTS` défini en T2 et consommé en T6/T7/T9 ; champs `relay*` de `CheckoutCustomerInput` (T6) alignés sur les hidden inputs (T7) et la lecture `formData` (T6).

## Points hors-code à traiter en parallèle

- **Compte Pro Mondial Relay + identifiants prod** (cf. spec §6 « Comment obtenir ces identifiants »). La sandbox `BDTEST` permet de tout développer sans attendre.
- **Décision métier** : produits « frais » expédiables en point relais ? (cf. spec §9.2)
- **Adresse expéditeur réelle** : compléter `SENDER` dans `lib/mondial-relay/config.ts` (T3).
