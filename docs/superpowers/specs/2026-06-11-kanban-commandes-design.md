# Design — Kanban de préparation des commandes (admin)

**Date :** 2026-06-11
**Statut :** implémenté

## Contexte

L'admin liste les commandes dans une table (`/admin/commandes`) avec une
machine d'états liée au paiement et à l'expédition (`pending`, `paid`,
`preparing`, `shipped`, `picked_up`, `cancelled`). Il manque un outil
d'organisation du travail de préparation : savoir d'un coup d'œil ce qui
attend, ce qui est en cours, ce qui est fini.

Le kanban est une **dimension séparée** des statuts commande/paiement : il
suit la préparation, pas le cycle de vie de la commande. Les deux dimensions
coexistent sur chaque commande.

## Décisions

- **Statut de préparation dédié :** nouvelle colonne sur `orders`, ne
  remplace pas la machine d'états existante.
- **Colonnes du board :** « En attente », « En cours de traitement »,
  « Terminée ».
- **Entrée sur le board :** commandes payées uniquement (statut `paid` et
  au-delà, hors `cancelled`). Une commande annulée disparaît du board.
- **Couplage :** passage du statut commande à `shipped` ou `picked_up`
  → carte forcée en « Terminée ». Pas de couplage dans l'autre sens.
- **Retrait après 48h :** filtre à la lecture (aucun cron, aucune
  suppression) — une carte « Terminée » depuis plus de 48h n'apparaît plus
  sur le board mais reste dans la vue table et sa page détail.
- **Interaction :** drag-and-drop HTML5 natif + boutons sur chaque carte.
- **Emplacement :** `/admin/commandes` affiche le kanban par défaut, bascule
  vers la table actuelle via `?vue=tableau`.

## 1. Base de données (`lib/db/schema.ts` + migration Drizzle)

- Nouvel enum Postgres `prep_status` : `todo` | `in_progress` | `done`.
- Sur `orders` :
  - `prep_status` : enum, `not null`, défaut `todo` ;
  - `prep_done_at` : timestamp avec fuseau, nullable — date d'entrée dans
    `done`, base du calcul des 48h.
- Migration `0002_prep_status.sql` avec backfill : les commandes déjà
  `shipped` / `picked_up` passent à `done` avec
  `prep_done_at = created_at` (les anciennes sont donc masquées du board
  d'emblée). Les autres gardent le défaut `todo`.

## 2. Domaine (`lib/prep-status.ts`, module pur)

Même esprit que `lib/order-status.ts` : aucun import runtime serveur,
importable côté client comme côté serveur.

- `type PrepStatus = "todo" | "in_progress" | "done"` (dérivé de l'enum
  Drizzle).
- `PREP_LABELS` : `todo` → « En attente », `in_progress` → « En cours de
  traitement », `done` → « Terminée ».
- `PREP_ORDER` : ordre des colonnes du board (`todo`, `in_progress`,
  `done`), partagé entre UI et tests.
- `DONE_RETENTION_MS = 48 * 3600 * 1000`.
- `isOnBoard(order, now)` : prédicat de visibilité — statut commande
  éligible (`paid`, `preparing`, `shipped`, `picked_up`) ET
  (`prep_status ≠ done` OU `prep_done_at > now − 48h`). Un `done` sans
  `prep_done_at` reste visible (cas défensif, ne doit pas arriver).
- Les trois colonnes sont librement navigables dans les deux sens (outil
  d'organisation, pas une machine d'états stricte).

## 3. Cycle de vie (`lib/orders.ts`)

- `setPrepStatus(db, orderId, to, now)` :
  - refuse si la commande est `pending` ou `cancelled` (« pas sur le
    board ») ;
  - entrée dans `done` → `prep_done_at = now` ; sortie de `done` →
    `prep_done_at = null` ; déplacement vers la colonne courante = no-op.
- `listBoardOrders(db, now)` : commandes visibles au sens de `isOnBoard`,
  filtrées en SQL (pas en mémoire), triées par `delivery_date` croissante
  (NULLS LAST) puis `created_at` croissante — les plus urgentes en haut.
- `updateOrderStatus` (existant) : transition vers `shipped` ou `picked_up`
  → force `prep_status = done` et `prep_done_at = now` si la carte n'y est
  pas déjà.
- L'arrivée sur le board est automatique : `markOrderPaidBySession` ne
  change rien (le défaut `todo` + statut `paid` suffisent).

## 4. UI admin (`app/(admin)/admin/(panel)/commandes/`)

- **`page.tsx`** : lit `searchParams.vue` — `tableau` → table actuelle
  (inchangée, historique complet) ; toute autre valeur ou absence → kanban.
  Toggle visible en haut de page (deux liens, état actif marqué).
- **`kanban-board.tsx`** (client) : trois colonnes avec titre et compteur ;
  données passées par le server component (`listBoardOrders`).
- **Carte** : numéro, nom du client, mode (« Retrait » / « Envoi postal »),
  date de livraison souhaitée si présente, total, badge du statut commande
  (`StatusBadge` réutilisé), lien vers `/admin/commandes/[id]`.
- **Déplacement :**
  - drag-and-drop HTML5 natif (`draggable`, `onDragStart` / `onDragOver` /
    `onDrop`), zéro dépendance — suffisant pour 3 colonnes fixes ; si trop
    limité à l'usage, passage ultérieur possible à `@dnd-kit` sans toucher
    au serveur ;
  - boutons ← / → sur chaque carte (fallback clavier, cible stable pour
    Playwright), libellés explicites pour l'accessibilité.
- **`actions.ts`** : server action `changePrepStatus(orderId, to)` — même
  gabarit que `changeOrderStatus` (Zod, `verifySession`, `getDb`,
  `revalidatePath("/admin/commandes")` et page détail).
- Drop sur la colonne d'origine = no-op côté client (pas d'appel serveur).

## 5. Gestion d'erreurs

- Le serveur est la source de vérité : `setPrepStatus` rejette les
  commandes non éligibles avec un message explicite, affiché sur le board
  (`role="alert"`), état rechargé via `revalidatePath`.
- Requête invalide (UUID ou statut inconnu) → « Requête invalide. », comme
  les actions existantes.

## 6. Hors périmètre

- Ordre manuel des cartes dans une colonne (le tri est déterministe).
- Affichage ou édition du statut de préparation sur la page détail
  commande et la vue table (le kanban est le seul point de gestion).
- Purge ou archivage en base des commandes terminées (les données restent
  intactes).
- Temps réel multi-utilisateurs (un seul admin).

## 7. Tests

- **Unitaires** (`tests/unit/prep-status.test.ts`, extension de
  `tests/unit/orders.test.ts`, vitest + PGlite) :
  - `isOnBoard` : fenêtre 48h et ses bornes (47h59 visible, 48h01 masquée),
    `done` sans `prep_done_at`, statuts commande exclus ;
  - `setPrepStatus` : pose/efface `prep_done_at`, refus sur `pending` et
    `cancelled`, no-op sur colonne identique ;
  - `listBoardOrders` : filtre SQL (48h, annulées, non payées) et tri
    (`delivery_date` puis `created_at`) ;
  - `updateOrderStatus` → `shipped` / `picked_up` force `done` +
    `prep_done_at`.
- **E2E** (`tests/e2e/06-admin-kanban.spec.ts`, Playwright) :
  - une commande payée apparaît en « En attente » ;
  - déplacement par bouton → « En cours de traitement » ;
  - déplacement par drag-and-drop → « Terminée » ;
  - bascule kanban ↔ table ;
  - une commande terminée depuis plus de 48h est absente du board mais
    présente dans la table.
