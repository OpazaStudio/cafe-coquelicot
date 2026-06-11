# Design — Retrait en boutique ou envoi postal

**Date :** 2026-06-11
**Statut :** validé (approche A)

## Contexte

Le checkout propose aujourd'hui deux modes : « Retrait atelier » (gratuit) et
« Livraison à vélo — La Rochelle » (9 €). La livraison à vélo est abandonnée :
les commandes sont soit retirées en boutique, soit envoyées par la poste
(Colissimo, France métropolitaine). Il n'existe que ces deux cas.

Le mode de récupération n'est actuellement pas stocké en base — il est inféré
de la présence d'une adresse. Le statut terminal unique `delivered` ne
distingue pas une commande expédiée d'une commande retirée.

## Décisions

- **Frais postaux :** tarif fixe provisoire, constante configurable dans le
  code (montant réel inconnu à ce jour).
- **Adresse :** champs structurés (rue, code postal, ville), France
  métropolitaine uniquement.
- **Date souhaitée :** conservée pour les deux modes, libellé contextuel.
- **Statuts :** statuts terminaux distincts en base (`shipped` / `picked_up`),
  mode stocké explicitement, numéro de suivi optionnel côté admin.

## 1. Modes de récupération

- `type Fulfillment = "retrait" | "poste"` (remplace `"livraison"`).
- Checkout : « Envoi par la poste » remplace « Livraison à vélo », avec la
  description « Colissimo, France métropolitaine — 7,90 € ».
- `SHIPPING_FEE_CENTS = 790` dans `lib/order-status.ts` (remplace
  `DELIVERY_FEE_CENTS = 900`). Valeur provisoire, à ajuster.
- Le retrait reste gratuit.
- Ligne Stripe pour les frais : « Envoi postal — Colissimo ».

## 2. Formulaire checkout (`components/checkout-form.tsx`)

- Mode « poste » sélectionné → trois champs requis remplacent le textarea :
  - **Adresse** (rue + numéro), max 200 caractères ;
  - **Code postal**, validé `^\d{5}$` ;
  - **Ville**, max 100 caractères.
- Mode « retrait » → aucun champ d'adresse (inchangé).
- Champ date conservé pour les deux modes, optionnel, libellé contextuel :
  - retrait : « Date de retrait souhaitée » ;
  - poste : « Date d'expédition souhaitée » ;
  - toujours suivi de « (optionnel — sous réserve de confirmation) ».
- Le récapitulatif affiche « Envoi postal » et les frais correspondants ;
  « offert » pour le retrait.

## 3. Base de données (`lib/db/schema.ts` + migration Drizzle)

Sur `orders` :

- Nouvelle colonne `fulfillment` : enum Postgres `fulfillment`
  (`retrait` | `poste`), `not null`.
- `delivery_address` remplacée par trois colonnes nullable :
  `shipping_address`, `shipping_postal_code`, `shipping_city`
  (renseignées uniquement pour `poste`).
- Nouvelle colonne `tracking_number` (text, nullable).
- `delivery_date` et `delivery_fee_cents` conservées telles quelles
  (le nom de colonne ne change pas pour limiter le churn).

Enum `order_status` : `delivered` remplacé par `shipped` et `picked_up`.
Valeurs finales : `pending`, `paid`, `preparing`, `shipped`, `picked_up`,
`cancelled`.

Migration des données existantes (dev uniquement) :

- `fulfillment` ← `poste` si `delivery_address` non nulle, sinon `retrait` ;
- `delivered` → `shipped` si adresse présente, sinon `picked_up` ;
- `delivery_address` recopiée dans `shipping_address` avant suppression.

## 4. Machine d'états (`lib/order-status.ts`, `lib/orders.ts`)

Transitions :

| Depuis      | Vers                                |
|-------------|-------------------------------------|
| `pending`   | `paid`, `cancelled`                 |
| `paid`      | `preparing`, `cancelled`            |
| `preparing` | `shipped`, `picked_up`, `cancelled` |
| `shipped`   | — (terminal)                        |
| `picked_up` | — (terminal)                        |

Contrainte de cohérence dans `updateOrderStatus` : `shipped` autorisé
uniquement si `fulfillment = "poste"`, `picked_up` uniquement si
`fulfillment = "retrait"`. Violation → erreur explicite.

Libellés : `shipped` → « Expédiée », `picked_up` → « Retirée ».

## 5. Admin

- Badge de statut : nouveaux libellés et couleurs pour `shipped` /
  `picked_up`.
- Page détail commande : seul le bouton terminal cohérent avec le mode est
  proposé (« Marquer expédiée » ou « Marquer retirée »).
- Pour les commandes `poste` : champ « N° de suivi Colissimo » optionnel,
  éditable sur la page détail (server action dédiée), affiché dans le détail.
- Affichage du mode de récupération et de l'adresse structurée dans la liste
  et le détail.
- Stats : `REVENUE_STATUSES = ["paid", "preparing", "shipped", "picked_up"]`.

## 6. Hors périmètre

- Calcul des frais au poids ou par transporteur.
- Suivi Colissimo automatisé / emails d'expédition.
- Livraison internationale ou DOM-TOM.
- Affichage du numéro de suivi côté client.

## 7. Tests

- **Unitaires** (`tests/unit/orders.test.ts`, `stats.test.ts`,
  `webhook.test.ts`) : adaptation aux nouveaux statuts et au champ
  `fulfillment` ; cohérence statut/mode dans `updateOrderStatus` ; frais
  postaux appliqués pour `poste`, nuls pour `retrait`.
- **E2E** (`tests/e2e/05-checkout.spec.ts`) :
  - mode poste → champs adresse/CP/ville visibles et requis, total avec
    frais ;
  - mode retrait → pas de champs adresse, total sans frais ;
  - validation du code postal (5 chiffres).
