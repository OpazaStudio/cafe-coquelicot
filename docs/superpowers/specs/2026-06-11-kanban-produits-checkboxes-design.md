# Design — Cartes kanban : produits, checkboxes par unité, colonne « À expédier »

**Date :** 2026-06-11
**Statut :** implémenté
**Fait évoluer :** [2026-06-11-kanban-commandes-design.md](./2026-06-11-kanban-commandes-design.md)

## Contexte

Le kanban de préparation (`/admin/commandes`) affiche des cartes trop pauvres :
numéro, client, mode, total — mais pas les produits commandés, qui sont
pourtant l'information de travail principale. Et il manque un suivi fin de la
préparation : pour une commande « 2 Rivage + 1 Minimes », l'admin veut cocher
chaque bouquet préparé et voir la carte avancer toute seule.

## Décisions

- **Produits en avant sur la carte :** la liste des articles (nom + une
  checkbox par unité) devient le cœur de la carte ; le total passe en pied.
- **Une checkbox par unité :** 2 × Rivage = 2 cases. Les unités d'un même
  produit sont interchangeables → on stocke un **compteur** par article
  (`prepared_qty`), pas un état par case. L'UI coche les `prepared_qty`
  premières cases ; un clic incrémente ou décrémente d'une unité.
- **Quatrième colonne « À expédier »** (`ready`), insérée entre « En cours de
  traitement » et « Terminée ». Flux : En attente → En cours de traitement →
  À expédier → Terminée.
- **Automatisme symétrique complet** (choix utilisateur) — appliqué à chaque
  clic sur une case, jamais lors d'un drag :
  - toutes les unités cochées → la carte passe en « À expédier » ;
  - au moins une unité cochée (mais pas toutes) → « En cours de traitement » ;
  - aucune unité cochée → retour « En attente ».
- **Le drag reste libre** entre les 4 colonnes (outil d'organisation, pas une
  machine d'états) : déplacer une carte ne touche jamais aux cases. Une carte
  posée à la main en « À expédier » avec des cases vides y reste — le prochain
  clic sur une case recalcule et peut la redescendre.
- **Colonne « Terminée » :** cases affichées mais désactivées ; le serveur
  refuse tout cochage sur une carte terminée.
- **Couplage existant conservé et complété :** passage du statut commande à
  `shipped` / `picked_up` → carte forcée en « Terminée » **et** toutes les
  cases cochées (`prepared_qty = qty` sur chaque article).

## 1. Base de données (`lib/db/schema.ts` + migration `0003`)

- Enum `prep_status` : nouvelle valeur `ready` insérée **avant** `done`
  (`ALTER TYPE "prep_status" ADD VALUE 'ready' BEFORE 'done'`). Aucune ligne
  n'utilise `ready` dans la même transaction → compatible avec le runner de
  migrations transactionnel (Postgres ≥ 12, PGlite inclus).
- Sur `order_items` : `prepared_qty` : `integer`, `not null`, défaut `0` —
  nombre d'unités préparées, borné par `qty` côté application.
- Backfill : les articles des commandes déjà `prep_status = 'done'` passent à
  `prepared_qty = qty` (cohérence avec la règle de couplage). Les autres
  gardent `0`.

## 2. Domaine (`lib/prep-status.ts`, module pur)

- `PREP_ORDER = ["todo", "in_progress", "ready", "done"]`.
- `PREP_LABELS` : ajout `ready` → « À expédier ».
- `derivePrepStatus(preparedTotal, totalQty)` → `"todo" | "in_progress" |
  "ready"` (jamais `done` : la sortie de board est l'affaire du statut
  commande) :
  - `totalQty <= 0` → `todo` (défensif, un panier vide n'existe pas) ;
  - `preparedTotal <= 0` → `todo` ;
  - `preparedTotal >= totalQty` → `ready` ;
  - sinon → `in_progress`.
- `isOnBoard`, `DONE_RETENTION_MS`, `BOARD_ORDER_STATUSES` : inchangés
  (`ready` est un statut « sur le board » comme `in_progress`).

## 3. Cycle de vie (`lib/orders.ts`)

- **`setItemPreparedQty(db, orderItemId, preparedQty)`** :
  - article introuvable → « Article introuvable. » ;
  - commande hors board (`pending` / `cancelled`) → même refus que
    `setPrepStatus` ;
  - carte en « Terminée » → « Préparation déjà terminée. » ;
  - valeur **bornée** dans `[0, qty]` (clamp silencieux, pas d'erreur) ;
  - met à jour l'article, somme `prepared_qty` et `qty` sur **tous** les
    articles de la commande, applique `derivePrepStatus` si le résultat
    diffère du statut courant. `prep_done_at` n'est jamais touché (il
    n'existe que pour `done`, inatteignable ici) ;
  - le tout dans une transaction ; retourne la commande mise à jour.
- **`listBoardOrders(db, now)`** : renvoie désormais
  `Array<{ order: OrderRow; items: OrderItemRow[] }>` — une seconde requête
  `inArray(orderId, …)` groupée en mémoire, tri des commandes inchangé.
- **`updateOrderStatus`** : transition vers `shipped` / `picked_up` → en plus
  du forçage `done` + `prep_done_at` existant, `prepared_qty = qty` sur tous
  les articles (toujours, même si la carte était déjà en « Terminée »).
- **`setPrepStatus`** : inchangé (accepte naturellement `ready` via l'enum).

## 4. UI admin (`app/(admin)/admin/(panel)/commandes/`)

- **`page.tsx`** : passe les commandes avec leurs articles au board.
- **`kanban-board.tsx`** (client) :
  - grille 4 colonnes : `grid gap-4 md:grid-cols-2 xl:grid-cols-4` ;
  - **carte** : en-tête numéro + `StatusBadge` ; client ; mode + date
    souhaitée ; puis **liste des articles** — une ligne par article : nom du
    produit (`name_snapshot`) et `qty` checkboxes ; pied de carte : total +
    boutons ←/→ existants ;
  - **checkbox** : `<input type="checkbox">` natif ; case _i_ cochée si
    `i < prepared_qty` ; cocher une case vide → `prepared_qty + 1`, décocher
    une case pleine → `prepared_qty − 1` ; `aria-label` « Nom — unité i sur
    qty » ; `data-testid` stable pour Playwright ; désactivée pendant une
    transition serveur et dans la colonne « Terminée » ;
  - clic sur une case → server action, état rechargé via `revalidatePath`
    (même gabarit que le déplacement de carte, pas d'optimistic UI).
- **`actions.ts`** : server action `setItemPrepared(orderItemId,
  preparedQty)` — Zod (`uuid` + entier ≥ 0), `verifySession`, `getDb`,
  `revalidatePath("/admin/commandes")` et page détail de la commande.

## 5. Gestion d'erreurs

- Le serveur reste la source de vérité : refus explicites de
  `setItemPreparedQty` affichés dans le bandeau `role="alert"` existant.
- Requête invalide (UUID ou quantité non entière) → « Requête invalide. ».

## 6. Hors périmètre

- Page détail commande et vue table : inchangées (pas d'affichage des cases).
- Ordre manuel des cartes dans une colonne.
- Optimistic UI sur les cases (à reconsidérer si la latence gêne à l'usage).
- Temps réel multi-utilisateurs (un seul admin).

## 7. Tests

- **Unitaires** (vitest + PGlite) :
  - `derivePrepStatus` : 0 coché, partiel, complet, `totalQty = 0` ;
  - `setItemPreparedQty` : clamp aux bornes, refus (article introuvable,
    commande `pending`/`cancelled`, carte `done`), transitions symétriques
    (todo → in_progress → ready → in_progress → todo via cases),
    `prep_done_at` jamais posé, multi-articles (le statut dérive de la somme) ;
  - `listBoardOrders` : articles joints à chaque commande, filtre et tri
    inchangés ;
  - `updateOrderStatus` → `shipped` / `picked_up` : cases toutes cochées,
    y compris si la carte était déjà `done` ;
  - drag manuel (`setPrepStatus`) vers `ready` : accepté, cases intactes.
- **E2E** (Playwright, adaptation de `tests/e2e/06-admin-kanban.spec.ts`) :
  - les 4 colonnes s'affichent, la carte montre les noms des produits et le
    bon nombre de cases ;
  - cocher une case → la carte passe en « En cours de traitement » ;
  - tout cocher → « À expédier » ; décocher une case → retour « En cours » ;
  - tout décocher → retour « En attente » ;
  - parcours boutons/drag existants mis à jour pour 4 colonnes.
