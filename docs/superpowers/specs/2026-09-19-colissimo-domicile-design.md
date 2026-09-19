# Design — Colissimo à domicile en parallèle de Mondial Relay

**Date :** 2026-09-19
**Statut :** validé

## Contexte

Depuis la spec du 2026-06-19, Mondial Relay est la seule façon de recevoir une
commande : widget de choix du relais dans `components/checkout-form.tsx`, création
automatique de l'étiquette via l'API Connect (`lib/mondial-relay/`), bouton admin
de secours. Le mode « poste » (Colissimo à domicile, spec du 2026-06-11) a été retiré
de l'interface mais la valeur `poste` de l'enum `fulfillment`, les colonnes d'adresse
de `orders` et une partie de la logique de `createPendingOrder` (`lib/orders.ts`)
sont toujours là.

La cliente veut redonner le choix : point relais Mondial Relay **ou** livraison à
domicile par Colissimo. L'étiquette Colissimo est **manuelle** (imprimée depuis
l'espace La Poste Pro ou au bureau de poste), le n° de suivi est saisi dans l'admin
comme aujourd'hui. Les deux forfaits doivent être **modifiables dans l'admin**.

## Décisions

- **Colissimo = étiquette manuelle.** Aucune API Colissimo, aucun identifiant, aucune
  dépendance externe. Le n° de suivi est posé à la main dans la fiche commande.
- **Périmètre géographique : France métropolitaine uniquement**, comme Mondial Relay.
  Codes postaux à 5 chiffres, préfixes `97` et `98` refusés (DOM-TOM), la Corse (`20`)
  passe. Pays forcé à `FR` côté serveur.
- **Réutilisation de l'enum `poste`** pour Colissimo (il désignait déjà Colissimo
  historiquement). Pas de nouvelle valeur d'enum, donc **aucune migration**. Seuls les
  libellés changent : « Colissimo » partout dans l'UI.
- **Forfaits éditables** dans `/admin/parametres`, groupe « Livraison », via la table
  `settings` existante (clé/valeur texte). Défauts : Mondial Relay 4,90 €, Colissimo
  7,90 €. Les constantes actuelles deviennent des valeurs par défaut.
- **Mode sélectionné par défaut** au checkout : Mondial Relay.
- **Source de vérité du frais : le serveur.** Le client affiche le frais reçu du
  serveur, `createPendingOrder` recalcule depuis les paramètres. Un changement de
  tarif pendant qu'un client est sur `/checkout` peut créer un écart d'affichage,
  accepté (cas marginal, le montant facturé est celui recalculé au moment du paiement).

## Architecture / flux

```
/checkout (server component)
  └─ getSettings() ─▶ shippingFeesFromSettings() ─▶ { mondialRelay, colissimo } (cents)
  └─ <CheckoutForm fees={…} />
        radio « Mode de livraison »
          ├─ mondial_relay ─▶ RelayPicker (inchangé) + champs cachés relais
          └─ poste ─────────▶ adresse, code postal, ville
        récap + total + GA4 begin_checkout avec le frais du mode choisi
        ▼
  startCheckout (server action)
    └─ Zod : union discriminée sur `fulfillment`
    └─ getSettings() ─▶ fees
    └─ createPendingOrder(db, customer, items, fees)
         frais = retrait 0 | mondial_relay fees.mondialRelay | poste fees.colissimo
    └─ Stripe line_item « Livraison Mondial Relay — point relais »
                       ou « Livraison Colissimo — à domicile »
        ▼
  paiement ─▶ webhook / confirmation ─▶ markOrderPaid
    └─ ensureRelayShipment : inchangé, ne fait rien pour `poste` (pas de relayPointId)
```

## 1. Modèle de données

Aucune migration. Rappel de ce qui est réutilisé sur `orders` :

| Colonne | mondial_relay | poste (Colissimo) |
|---|---|---|
| `shippingAddress` | rue du relais | n° et rue du client |
| `shippingPostalCode` / `shippingCity` | relais | client |
| `shippingCountry` | `FR` | `FR` |
| `relayPointId` / `relayPointName` | renseignés | `null` |
| `relayShipmentNumber` / `relayLabelUrl` | posés par l'API | `null` |
| `trackingNumber` | posé par l'API (modifiable admin) | saisi par l'admin |

## 2. Frais éditables (`lib/settings-fields.ts`, `lib/order-status.ts`)

### Nouvelles clés de paramètres

| Clé | Libellé | Groupe | Type | Défaut |
|---|---|---|---|---|
| `shipping_fee_mondial_relay` | Frais Mondial Relay (€) | shipping | `price` | `4,90` |
| `shipping_fee_colissimo` | Frais Colissimo (€) | shipping | `price` | `7,90` |
| `shipping_delay_colissimo` | Délai d'acheminement Colissimo | shipping | text | `""` |

Le libellé de `shipping_delay` devient « Délai d'acheminement Mondial Relay »
(déjà le cas) et sa hint reste. Les deux nouveaux champs de frais portent la hint
« Ex. 4,90 — appliqué aux nouvelles commandes ».

### Type de champ `price`

- `SettingField.kind` gagne la valeur `"price"`.
- Validation Zod dans `fieldSchema` : vide autorisé (repli sur le défaut), sinon
  `^\d{1,4}([.,]\d{1,2})?$`. Message : « {label} : montant invalide (ex. 4,90). »
- Rendu dans `SettingsForm` : `<input type="text" inputMode="decimal">` (pas
  `type="number"`, pour accepter la virgule française).

### Conversion en centimes

Dans `lib/order-status.ts` (module pur, importable côté client) :

```ts
export const MONDIAL_RELAY_FEE_CENTS = 490;   // défaut
export const COLISSIMO_FEE_CENTS = 790;       // défaut
export type ShippingFees = { mondialRelay: number; colissimo: number };
export const DEFAULT_SHIPPING_FEES: ShippingFees = { … };
export function parsePriceToCents(raw: string): number | null;
export function shippingFeeFor(fulfillment: Fulfillment, fees: ShippingFees): number;
```

- `parsePriceToCents("7,90") → 790`, `"7.9" → 790`, `"" → null`, `"abc" → null`.
- `shippingFeeFor("retrait") → 0`.

Dans `lib/settings-fields.ts` :

```ts
export function shippingFeesFromSettings(values: Settings): ShippingFees
```

repli sur `DEFAULT_SHIPPING_FEES` clé par clé quand la valeur est vide ou invalide.
`DEFAULT_SETTINGS` porte `"4,90"` et `"7,90"` (formatés depuis les constantes).

### Sauvegarde

`updateSettings` (`app/(admin)/admin/(panel)/parametres/actions.ts`) ajoute
`revalidatePath("/checkout")` et `revalidatePath("/panier")` aux revalidations
existantes.

## 3. Checkout — `app/checkout/page.tsx` + `components/checkout-form.tsx`

- La page devient un **server component async** : `getSettings()` →
  `shippingFeesFromSettings` → `<CheckoutForm fees={fees} />`. `export const dynamic
  = "force-dynamic"` comme les pages légales (la page est déjà `noindex`).
- `CheckoutForm` reçoit `fees: ShippingFees`. Nouvel état
  `mode: "mondial_relay" | "poste"`, défaut `mondial_relay`.
- Un bloc radio réutilise les classes CSS existantes `.checkout-fulfillment` /
  `.checkout-choice` (toujours dans `app/globals.css`, héritées de l'ancien choix
  retrait/poste) :
  - « Point relais Mondial Relay » — « Livré dans le relais de votre choix — {fee} »
  - « À domicile par Colissimo » — « Livré à votre adresse, France métropolitaine — {fee} »
- Champ caché `fulfillment` = mode courant.
- Mode `mondial_relay` : `RelayPicker` + champs cachés relais, inchangé.
- Mode `poste` : trois champs `form-field` requis côté HTML :
  `address` (« Adresse (n° et rue) », `autoComplete="street-address"`, max 200),
  `postalCode` (« Code postal », `inputMode="numeric"`, `pattern="\d{5}"`,
  `autoComplete="postal-code"`), `city` (« Ville », `autoComplete="address-level2"`).
  Un complément d'adresse se met dans le champ adresse.
- Téléphone requis dans les deux modes (Colissimo prévient aussi par SMS).
- Récap : ligne « Livraison (point relais) » ou « Livraison (Colissimo à domicile) »
  avec `shippingFeeFor(mode, fees)`. Total et `data-testid="checkout-total"` inchangés.
- Bouton : bloqué sans relais en mode `mondial_relay` ; en mode `poste`, actif (les
  champs HTML `required` bloquent la soumission). Libellé « Payer avec Stripe ».
- GA4 : `trackBeginCheckout(items, subtotal + fees.mondialRelay)` au premier
  affichage (mode par défaut), inchangé sinon.
- Le paragraphe explicatif « Vos achats sont livrés en point relais… » disparaît au
  profit des descriptions des deux cartes radio.

## 4. Validation serveur — `app/checkout/actions.ts`

```ts
const BaseSchema = z.object({ name, email, phone, deliveryDate, cardMessage });
const RelaySchema = BaseSchema.extend({
  fulfillment: z.literal("mondial_relay"),
  relayPointId, relayPointName, relayStreet, relayPostalCode, relayCity,
  relayCountry: z.literal("FR"),
});
const ColissimoSchema = BaseSchema.extend({
  fulfillment: z.literal("poste"),
  address: z.string().trim().min(1, { error: "Votre adresse est requise." }).max(200),
  postalCode: z.string().trim()
    .regex(/^\d{5}$/, { error: "Code postal invalide." })
    .refine((cp) => !/^9[78]/.test(cp), { error: "Colissimo : France métropolitaine uniquement." }),
  city: z.string().trim().min(1, { error: "Votre ville est requise." }).max(100),
});
const CheckoutSchema = z.discriminatedUnion("fulfillment", [RelaySchema, ColissimoSchema]);
```

- Message téléphone : « Téléphone requis (suivi de livraison). » (neutre entre les
  deux transporteurs).
- `startCheckout` lit `fees` via `getSettings()` puis appelle
  `createPendingOrder(db, customer, items, fees)` avec, selon le mode, les champs
  relais ou `shippingAddress` / `shippingPostalCode` / `shippingCity` /
  `shippingCountry: "FR"`.
- Ligne Stripe : « Livraison Mondial Relay — point relais » ou
  « Livraison Colissimo — à domicile ».

## 5. `lib/orders.ts`

- `createPendingOrder(db, customer, items, fees: ShippingFees = DEFAULT_SHIPPING_FEES)`.
  Le frais devient `shippingFeeFor(customer.fulfillment, fees)`. Le commentaire
  « Seul mondial_relay est créé par le checkout… » est supprimé.
- `setTrackingNumber` : garde `inArray(["poste", "mondial_relay"])` déjà correcte,
  inchangée.
- Le re-export `MONDIAL_RELAY_FEE_CENTS` est conservé pour les imports existants.

## 6. Admin

- `orders-table.tsx`, `kanban-board.tsx` : libellé par mode via un helper partagé
  `FULFILLMENT_LABELS: Record<Fulfillment, string>` dans `lib/order-status.ts`
  (`retrait` → « Retrait », `poste` → « Colissimo », `mondial_relay` → « Mondial Relay »).
- `commandes/[id]/page.tsx` : titre du bloc livraison « Livraison à domicile —
  Colissimo » pour `poste` (au lieu de « Envoi par la poste »). Affichage de l'adresse
  déjà géré. Pas de bloc étiquette pour `poste`. Sous l'adresse, une note : « Étiquette
  à générer depuis votre espace La Poste Pro, puis saisir le n° de suivi ci-dessous. »
- `tracking-form.tsx` : reçoit `fulfillment` et adapte le placeholder
  « N° de suivi Colissimo » / « N° de suivi Mondial Relay ».
- `/admin/parametres` : les trois nouveaux champs apparaissent automatiquement dans
  le groupe « Livraison » via `SETTING_FIELDS`.

## 7. Pages client

- `app/commande/confirmee/page.tsx` : `poste` → « Votre commande partira par Colissimo
  à votre domicile très vite. »
- `components/legal/livraison-retours.tsx` : intro « …livrés en point relais Mondial
  Relay ou à domicile par Colissimo, partout en France métropolitaine. » Nouvelle
  section « Livraison à domicile par Colissimo » (délai `shipping_delay_colissimo`,
  frais depuis les paramètres, suivi communiqué à l'expédition). Frais Mondial Relay
  depuis les paramètres au lieu de la constante.
- `components/legal/cgv.tsx` : §3 liste les deux frais depuis les paramètres ;
  §4 « renseigne ses coordonnées et son mode de livraison (point relais ou adresse) » ;
  §6 mentionne les deux transporteurs et les deux délais.
- Les composants légaux reçoivent déjà `settings` : ils appellent
  `shippingFeesFromSettings(settings)` et `formatEuros`.
- Metadata `description` de `/livraison-retours` mentionne Colissimo.

## 8. Tests

**Unitaires (vitest)**

- `order-status.test.ts` : `parsePriceToCents` (virgule, point, vide, invalide, un
  seul décimal), `shippingFeeFor` par mode, `FULFILLMENT_LABELS` complet.
- `settings-fields` : `shippingFeesFromSettings` avec valeurs valides, vides et
  invalides (repli clé par clé) ; `readSettingsForm` accepte `"7,90"` et refuse
  `"abc"` / `"7,999"` sur un champ `price`.
- `orders.test.ts` : `createPendingOrder` applique `fees.colissimo` pour `poste`,
  `fees.mondialRelay` pour `mondial_relay`, `0` pour `retrait` ; persiste l'adresse
  client avec `shippingCountry = "FR"` et `relayPointId = null` pour `poste`.
- Validation checkout : extraire le schéma Zod dans `app/checkout/schema.ts` (module
  pur) pour tester le refus de `97400`, `98000`, `1234`, et l'acceptation de `20000`,
  et le refus d'un mode `poste` sans adresse.
- `legal-content.test.tsx` : la page livraison mentionne Colissimo et les deux frais
  issus des paramètres.

**E2E (Playwright, PGlite)**

- `tests/e2e/05-checkout.spec.ts` : le parcours Mondial Relay existant reste vert
  (sélection du radio par défaut implicite).
- Nouveau `tests/e2e/12-checkout-colissimo.spec.ts` :
  1. Ajout au panier → `/checkout` → radio « À domicile par Colissimo » → le total
     affiche sous-total + 7,90 € → saisie adresse/CP/ville → paiement Stripe test →
     confirmation « Colissimo à votre domicile » → dans l'admin la commande affiche
     « Colissimo », l'adresse, pas de bouton étiquette, placeholder « N° de suivi
     Colissimo ».
  2. Admin : `/admin/parametres` → « Frais Colissimo (€) » = `9,50` → enregistrer →
     `/checkout` affiche 9,50 € pour Colissimo. Remise à `7,90` en fin de test.

## 9. Config

Aucune variable d'environnement nouvelle. `.env.example` inchangé.

## 10. Hors périmètre (YAGNI)

- API Colissimo (Web Service SLS) et génération automatique d'étiquette.
- Tarif au poids ou par zone, franco de port.
- Pays limitrophes, DOM-TOM.
- Lien de suivi laposte.fr dans l'admin ou l'e-mail.
- Retour du retrait en boutique dans le checkout.
- Verrou du frais affiché vs facturé si le tarif change pendant la saisie.

## 11. Risques / points à vérifier

1. **Page checkout dynamique** : `getSettings()` touche la base à chaque affichage de
   `/checkout`. Acceptable (une requête légère, `cache()` React par requête). Si
   besoin, `revalidatePath` couvre déjà l'invalidation.
2. **CSS résiduel** `.checkout-fulfillment` / `.checkout-choice` : vérifier le rendu
   mobile (passage en une colonne à 640 px déjà prévu) et la position `absolute` de
   l'input radio (le parent `.checkout-choice` doit être `position: relative`).
3. **Anciennes commandes `poste`** (avant juin 2026) : l'admin les affichera désormais
   comme « Colissimo », ce qui correspond à la réalité de l'époque.
4. **Produits frais à domicile** : une livraison Colissimo peut prendre 2 à 3 jours,
   même question métier que pour le point relais, à confirmer côté cliente.
