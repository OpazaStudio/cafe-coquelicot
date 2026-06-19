# Design — Mondial Relay comme seule méthode de livraison

**Date :** 2026-06-19
**Statut :** validé

## Contexte

Aujourd'hui le checkout (`components/checkout-form.tsx` → `app/checkout/actions.ts`)
propose deux modes via l'enum `fulfillment` (`retrait` | `poste`). « poste »
collecte une adresse personnelle (`shippingAddress/PostalCode/City/Country`) et
applique un forfait Colissimo (`SHIPPING_FEE_CENTS = 790`, `lib/order-status.ts`)
poussé comme `line_item` Stripe « Envoi postal — Colissimo ».

Le paiement passe par **Stripe Checkout hébergé** (redirection) : panier
(localStorage) → `/checkout` (formulaire maison) → `createPendingOrder`
(`lib/orders.ts`, statut `pending`) → création d'une `checkout.sessions` →
redirection Stripe → retour `/commande/confirmee` + webhook
(`app/api/stripe/webhook/route.ts`) qui passe `pending → paid`. Le webhook est
générique : aucune adresse n'est collectée côté Stripe (`shipping_address_collection`
absent), aucun `shipping_options` Stripe.

Mondial Relay devient **la seule façon de recevoir une commande** : le retrait en
boutique est retiré, l'envoi postal est remplacé par la livraison en point relais,
avec génération automatique de l'étiquette via l'API Connect.

## Décisions

- **Périmètre :** Mondial Relay **uniquement**. Le retrait en boutique disparaît
  de l'UI. L'étiquette est générée automatiquement.
- **Périmètre géographique : France (`FR`) uniquement.** Aucune expédition à
  l'étranger. Verrouillé à trois niveaux : widget restreint à `FR`, garde de
  validation côté serveur (rejet de tout point relais non-`FR`), pays forcé à
  `FR` dans le payload `createShipment`.
- **API :** intégration **complète** — Connect **REST v2** côté serveur (création
  d'expédition + étiquette + n° de suivi), déclenchée à la commande payée.
- **Tarif :** **forfait unique** (constante configurable).
- **Picker :** **widget jQuery officiel** Mondial Relay (gratuit, maintenu par MR,
  recherche intégrée), encapsulé dans un composant client React. Alternative écartée :
  wrapper `@frontboi/mondial-relay` (dépendance tierce dans le chemin critique).
- **Déclenchement étiquette :** **automatique** (webhook + filet `/commande/confirmee`),
  **idempotent**, avec **bouton admin de secours** si l'appel API échoue.

## Architecture / flux

```
Panier ─▶ /checkout ─────────────────────────────────────┐
          (nom, email, téléphone + RelayPicker)           │
          le client choisit son point relais (widget MR)  │
          ▼                                                │
   server action startCheckout                            │
     └─ createPendingOrder  (orders: pending,             │
        fulfillment=mondial_relay, relayPointId + adresse  │
        relais, forfait livraison)                         │
     └─ Stripe checkout.sessions.create                    │
          line_item produits + line_item « Livraison       │
          Mondial Relay — point relais »                   │
          ▼                                                │
   Redirection Stripe (hébergé) ─▶ paiement ─▶ /commande/confirmee
          ▼
   checkout.session.completed (webhook)  ─┐
   filet /commande/confirmee              ─┴─▶ markOrderPaid (pending→paid)
                                              └─▶ ensureRelayShipment(orderId)  [idempotent]
                                                    └─ Connect REST v2 createShipment
                                                    └─ stocke relayShipmentNumber,
                                                       relayLabelUrl, trackingNumber
```

## 1. Modèle de données (`lib/db/schema.ts` + migration `0005`)

> **Prérequis bloquant :** les migrations **0003 et 0004** doivent être appliquées
> sur Supabase avant 0005 (`npm run db:migrate`). À vérifier en premier (voir §9).

Migration **additive** (pas de migration destructive — les anciennes commandes
`retrait`/`poste` restent valides) :

- Enum `fulfillment` : ajout de la valeur **`mondial_relay`**. Le checkout ne crée
  plus que celle-ci ; `retrait`/`poste` conservées pour l'historique.
- Sur `orders`, les colonnes existantes `shippingAddress`, `shippingPostalCode`,
  `shippingCity`, `shippingCountry` sont **réutilisées** pour porter l'adresse du
  **point relais** (et non plus une adresse personnelle).
- Nouvelles colonnes nullable :

| Colonne | Type | Rôle |
|---|---|---|
| `relayPointId` | text | identifiant MR du point relais (ex. `FR-012345`) |
| `relayPointName` | text | nom du point relais (ex. « Tabac de la Gare ») |
| `relayShipmentNumber` | text | n° d'expédition renvoyé par Connect |
| `relayLabelUrl` | text | URL du PDF de l'étiquette (hébergé par MR) |

- `trackingNumber` (existante) : réutilisée pour le n° de suivi Mondial Relay.
- `customerPhone` : devient **requis** côté formulaire (Mondial Relay notifie le
  client par SMS à l'arrivée au relais). La colonne reste techniquement nullable
  (anciennes commandes), la contrainte est appliquée à la validation Zod.

## 2. Sélection du point relais — `RelayPicker` (`/checkout`)

- Composant **client** `components/relay-picker.tsx` qui charge le widget officiel
  via `next/script` (`https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js`,
  + jQuery si non présent) et l'initialise en `useEffect` :
  `$("#zone-widget").MR_ParcelShopPicker({ Target: "#relais-id", Brand, Country: "FR", ... })`.
- **France uniquement** : `Country: "FR"` figé, **aucun sélecteur de pays** dans
  l'UI ; le widget ne propose que des points relais français.
- À la sélection, le widget renseigne l'ID du point relais ; on récupère l'ID + le
  nom + l'adresse (rue, CP, ville, pays) et on les pousse dans l'état React + des
  champs cachés lus par le server action.
- `components/checkout-form.tsx` :
  - **Supprime** le choix retrait/poste et les champs d'adresse personnelle.
  - Conserve `name`, `email`, **`phone` (requis)**, `deliveryDate`, `cardMessage`.
  - Intègre `RelayPicker`. Le formulaire ne se soumet pas tant qu'aucun point
    relais n'est sélectionné.
  - Récapitulatif : « Livraison en point relais (Mondial Relay) — {forfait} ».

## 3. Tarif (`lib/order-status.ts`)

- `SHIPPING_FEE_CENTS = 790` remplacé par `MONDIAL_RELAY_FEE_CENTS` (forfait unique,
  configurable, à caler sur le contrat MR).
- `SHIPPING_COUNTRY_CODES` réduit à **`["FR"]`** (France uniquement). La fonction
  `isShippingCountry` ne valide donc plus que `FR` ; `app/checkout/actions.ts`
  rejette toute commande dont le pays du point relais n'est pas `FR`.
- `app/checkout/actions.ts` : `line_item` Stripe renommé
  « Livraison Mondial Relay — point relais ».
- Transitions de statut : `mondial_relay` se comporte comme un envoi → statut
  terminal `shipped`. `picked_up` devient un statut d'historique (anciennes
  commandes). La garde dans `setTrackingNumber` (`eq(orders.fulfillment, 'poste')`)
  est étendue à `mondial_relay`.

## 4. API Connect REST v2 (`lib/mondial-relay/`)

Module isolé et **mockable** (aucun appel réseau en test) :

- `types.ts` — interface `MondialRelayClient` (seam injectable) :
  `createShipment(input: RelayShipmentInput): Promise<RelayShipmentResult>` où
  `RelayShipmentResult = { shipmentNumber: string; labelUrl: string; trackingNumber: string }`.
- `client.ts` — implémentation réelle. Contrat **vérifié** (cf. doc officielle
  `web-service-dual-carrier-v-271.pdf`) :
  - `POST {MONDIAL_RELAY_API_URL}/api/shipment`, `Content-Type: application/xml`.
  - **Auth = bloc `<Context>` dans le corps XML** (Login, Password, CustomerId,
    `Culture` `fr-FR`, `VersionAPI` `1.0`) — pas de header Authorization.
  - Corps : `ShipmentCreationRequest` → `OutputOptions` (`OutputFormat` `A4`,
    `OutputType` `PdfUrl`) → `ShipmentsList/Shipment` : `OrderNo` (= n° commande,
    ≤15 `[0-9A-Z_-]`), `ParcelCount` 1, `CollectionMode Mode="CCC"`,
    `DeliveryMode Mode="24R" Location="FR-{relayPointId}"`, `Parcels/Parcel`
    (`Weight Value` en grammes), `Sender/Address` (boutique, cf. `config.ts`),
    `Recipient/Address` (nom/tél/email **client** + adresse du **point relais**).
  - Réponse (PDF inline) : n° d'expédition (`ShipmentNumber`) + URL du PDF
    (`Label/Output`) ; le n° d'expédition **est** le n° de suivi.
  - *Fallback documenté* : si la sandbox refuse le XML, variante JSON +
    Basic Auth sur `/api/shipments` (même interface `MondialRelayClient`, seule la
    sérialisation change — isolée dans ce module).
- `config.ts` — adresse **expéditeur** (boutique) en constantes + `DEFAULT_PARCEL_WEIGHT_GR`
  (poids forfaitaire, l'API exige un poids mais les produits n'en ont pas) + lecture
  des identifiants/URL depuis l'env. URL par défaut : **sandbox** en dev.
- `ensure-relay-shipment.ts` — `ensureRelayShipment(db, orderId)` :
  - **idempotent** : ne fait rien si `relayShipmentNumber` déjà présent ;
  - appelle `createShipment`, persiste `relayShipmentNumber`, `relayLabelUrl`,
    `trackingNumber` sur la commande ;
  - en cas d'échec API : **ne lève pas** dans le contexte webhook (le paiement est
    déjà acquis) — logge l'erreur, laisse la commande `paid` sans étiquette.

**Déclenchement :**
1. `app/api/stripe/webhook/route.ts` : après `markOrderPaidBySession`, appelle
   `ensureRelayShipment`. Une erreur MR n'invalide pas la réponse 200 au webhook.
2. `app/commande/confirmee/page.tsx` : après le filet `markOrderPaidBySession`,
   appelle aussi `ensureRelayShipment` (couvre le dev sans webhook). L'idempotence
   évite la double création.
3. Admin : bouton **« Générer / régénérer l'étiquette »** → server action appelant
   `ensureRelayShipment` (relance manuelle si l'auto a échoué).

## 5. Admin

- `app/(admin)/admin/(panel)/commandes/[id]/page.tsx` : afficher **nom + adresse du
  point relais** + `relayPointId` (au lieu de l'adresse perso), bouton
  **« Générer / régénérer l'étiquette »**, lien **« Télécharger l'étiquette (PDF) »**
  (`relayLabelUrl`).
- `tracking-form.tsx` : placeholder « N° de suivi Colissimo » → **« N° de suivi
  Mondial Relay »** (le n° est prérempli automatiquement par `ensureRelayShipment`).
- `orders-table.tsx` / `kanban-board.tsx` : libellé « Envoi postal » → **« Mondial
  Relay »**.

## 6. Config & variables d'environnement

| Variable | Côté | Usage |
|---|---|---|
| `NEXT_PUBLIC_MONDIAL_RELAY_BRAND` | client | code enseigne pour le widget (`BDTEST` en dev) |
| `MONDIAL_RELAY_API_URL` | serveur | base API — sandbox en dev (`https://connect-api-sandbox.mondialrelay.com`), prod (`https://connect-api.mondialrelay.com`) |
| `MONDIAL_RELAY_API_LOGIN` | serveur | Login API (`…@business-api.mondialrelay.com`) → `<Context><Login>` |
| `MONDIAL_RELAY_API_PASSWORD` | serveur | mot de passe API → `<Context><Password>` |
| `MONDIAL_RELAY_CUSTOMER_ID` | serveur | CustomerId → `<Context><CustomerId>` (souvent = code enseigne, `BDTEST` en dev) |

À ajouter dans `.env.example` et `.env.local`. L'adresse expéditeur (boutique) est
en constantes (`lib/mondial-relay/config.ts`), pas en env.

### Comment obtenir ces identifiants (à faire demain)

Mondial Relay a **deux générations d'API** avec **deux jeux d'identifiants** ; notre
design utilise un de chaque.

**Prérequis — compte Pro.** Il faut un **compte professionnel Mondial Relay**. S'il
n'existe pas encore : créer/activer un compte Pro (signature du contrat
transporteur) ; sans contrat Pro, pas de code enseigne ni de clé privée. En
**développement**, on peut tout câbler **sans compte** avec le code de test
**`BDTEST`** pour le widget.

**Identifiants A — widget point relais (côté client) :**
- Connexion à l'espace pro **`connect.mondialrelay.com`** (mêmes identifiants que
  « Mon Profil » sur mondialrelay.fr : email + mot de passe).
- **Mon Profil → « Mes paramètres de connexion »** : on y trouve le **code
  enseigne**, le **code marque** et la **clé privée**.
- Le widget n'a besoin que du **code enseigne** → `NEXT_PUBLIC_MONDIAL_RELAY_BRAND`.
  Valeur de dev : `BDTEST`.

**Identifiants B — API Connect REST v2 (côté serveur) :**
- Toujours sur **`connect.mondialrelay.com`**, aller dans la section **« Accès API »**
  du tableau de bord, puis cliquer sur **« Générer des identifiants API »**.
- On obtient : **Brand ID / CustomerId**, **Login API** (format
  `XXXX@business-api.mondialrelay.com`) et **API Password**.
- Mapping : `MONDIAL_RELAY_API_LOGIN` ← Login API, `MONDIAL_RELAY_API_PASSWORD` ←
  API Password, `MONDIAL_RELAY_CUSTOMER_ID` ← Brand ID / CustomerId.
- Authentification : identifiants placés dans un bloc **`<Context>` du corps XML**
  (Login + Password + CustomerId), `Content-Type: application/xml` — pas de header
  Authorization.
- **Sandbox (dev, fonctionne sans contrat)** : `MONDIAL_RELAY_API_URL` =
  `https://connect-api-sandbox.mondialrelay.com`, `MONDIAL_RELAY_CUSTOMER_ID` =
  `BDTEST`, `MONDIAL_RELAY_API_LOGIN` = `BDTEST@business-api.mondialrelay.com`,
  `MONDIAL_RELAY_API_PASSWORD` = `2crtPDo0ZL7Q*3kLumB`. Génère de vraies étiquettes
  sans débit ; le suivi de colis ne fonctionne pas en sandbox (pas de vrai colis).

> Le wording exact de l'onglet « Accès API » peut varier ; le mode d'emploi
> ci-dessus reflète l'organisation actuelle de l'espace Connect. Les identifiants
> sandbox `BDTEST` ci-dessus permettent de tout développer/tester **dès aujourd'hui**,
> avant même d'avoir le compte Pro.

## 7. Tests

- E2E isolés sur **PGlite** (`DATABASE_URL: ""`, inchangé).
- Le client MR est **injecté/mocké** → aucun appel réseau en test.
- **Unitaires** : builder de payload `createShipment` (mode 24R + relais) ;
  **idempotence** de `ensureRelayShipment` (2 appels = 1 expédition) ; gestion de
  l'échec API (commande reste `paid`, sans étiquette) ; forfait appliqué ; garde
  `setTrackingNumber` étendue à `mondial_relay`.
- **E2E checkout** (`tests/e2e/05-checkout.spec.ts`) : on **simule** la sélection
  d'un point relais (injection dans l'état / champs cachés, sans charger le widget
  externe) ; téléphone requis ; total avec forfait ; pas de champ d'adresse perso ;
  pas de choix retrait.

## 8. Hors périmètre (YAGNI)

- Tarif au poids / par zone (forfait unique ; un barème pourra s'ajouter).
- Suivi automatisé du colis (polling/webhook MR) — on stocke et on lie le n° de suivi.
- Emails d'expédition automatiques.
- Toute expédition hors France (contrainte verrouillée — voir Décisions).
- Casier (locker) / livraison à domicile MR — seulement le point relais (24R).

## 9. Risques / points à vérifier (1ʳᵉ étape d'implémentation)

1. **Contrat Connect v2** : structure vérifiée (corps XML, `<Context>` d'auth,
   `DeliveryMode 24R`, PDF inline — cf. §4 ; pas d'adresse perso requise pour le 24R).
   **Incertitude résiduelle** : noms exacts des éléments de la **réponse** XML, et
   choix XML (`/api/shipment`) vs JSON+Basic Auth (`/api/shipments`). → confirmer en
   tapant la **sandbox** (`BDTEST`) tôt dans la tâche client, ajuster parseur/fixture
   si besoin. Le client étant isolé derrière `MondialRelayClient`, le reste du système
   n'en dépend pas.
2. **Produits « frais »** : expédier des fleurs fraîches en point relais (colis en
   attente 1–2 j) est risqué — à confirmer côté métier si toutes les catégories sont
   expédiables.
3. **Migrations 0003/0004** non appliquées sur Supabase (voir §1) — `db:migrate`
   avant 0005.
4. **jQuery dans Next App Router** : le widget officiel est jQuery ; l'encapsuler
   proprement dans un composant client (chargement de script, init en `useEffect`,
   nettoyage) et garder une simulation pour les tests.
