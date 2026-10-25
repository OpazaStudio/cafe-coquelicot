# Stock limité par taille — design

Date : 2026-10-24. Statut : en attente de validation. Rien n'est codé.

## Intention

Certains bouquets existent en quantité limitée : il y a huit exemplaires d'un
modèle, pas une infinité. Aujourd'hui la boutique vend sans compter, donc rien
n'empêche de vendre dix fois le même bouquet unique. On veut un compteur qui
refuse la vente au-delà du stock réel, sans alourdir le catalogue existant où
presque tout reste illimité.

## Décision produit confirmée

Le stock se compte **par taille** : un Petit et un Grand sont physiquement deux
bouquets différents. Les **coloris ne portent jamais de stock** — ils restent
un attribut cosmétique, comme aujourd'hui pour le prix.

## Objectifs

- Un bouquet limité ne peut pas être survendu, même sous deux paiements simultanés.
- Le catalogue illimité (vases, séchées, tout l'existant) n'est pas affecté.
- Un paiement abandonné rend le bouquet à la vente sans intervention manuelle.
- Céline règle le stock depuis la fiche produit, sans savoir ce qu'est une migration.

## Non-objectifs

- Pas d'inventaire des matières premières (tiges, vases, emballages).
- Pas de réassort automatique ni de commande fournisseur.
- Pas de compteur affiché en temps réel sur les pages publiques en cache.
- Pas de gestion des remboursements Stripe (le code n'en fait aucun aujourd'hui).

## Anti-objectifs

Ce qui ferait de cette feature un échec même si elle « marche » :

- **Encaisser sans pouvoir livrer.** Un client débité pour un bouquet déjà vendu
  est pire que la survente silencieuse d'aujourd'hui : avant, Céline composait un
  bouquet de plus ; après, le client a payé et le compteur dit non.
- **Un bouquet bloqué à zéro sans commande payable.** Une réservation qui fuit
  retire le produit de la vente pour toujours, sans que personne ne s'en aperçoive.
- **Un client qui se verrouille lui-même** hors du bouquet qu'il essaie d'acheter.
- **Un compteur que Céline doit corriger à la main chaque semaine** parce qu'une
  sauvegarde de fiche l'écrase.

## Contraintes

- Next.js 16.2.9, Drizzle 0.45.2, Postgres via le pooler Supabase en mode
  transaction (`prepare: false`), PGlite en local et en tests.
- `/`, `/boutique` et `/boutique/[slug]` sont en ISR `revalidate = 3600`.
  `/panier` et `/checkout` sont dynamiques.
- Le panier vit en `localStorage` ; les prix sont déjà revalidés en base au checkout.
- La commande `pending` est créée **avant** la redirection Stripe.
- Aucun commentaire dans le code livré (règle projet).
- Les migrations 0009 à 0015 ne sont **pas appliquées en prod** et `db:migrate`
  sortait en erreur. Bloquant pour cette feature.

## Ce que la revue a changé dans la proposition initiale

Quatre points de la première esquisse étaient faux ou insuffisants :

1. **Le prédicat d'UPDATE rendait tout le catalogue inachetable.**
   `WHERE stock_qty IS NOT NULL AND stock_qty >= $n` avec « 0 ligne = épuisé »
   traite `NULL` (illimité) exactement comme une rupture. Après la migration,
   toutes les colonnes valent `NULL` : plus aucune vente. Corrigé ci-dessous.
2. **La clé de libération ne peut pas être déduite de `order_items`.**
   `order_items.size_id` est en `onDelete: "set null"` et `syncChildren` supprime
   les tailles retirées du formulaire. Une libération qui relit `size_id` crédite
   le mauvais compteur, ou rien. Il faut persister ce qui a réellement été
   décrémenté.
3. **La garde d'idempotence « libérer seulement si l'UPDATE a renvoyé une ligne »
   ne garde rien sur le chemin admin**, parce que `updateOrderStatus` fait son
   UPDATE sans prédicat de statut.
4. **Les trois fuites identifiées ne suffisent pas.** Il en manquait une
   (mort du process entre le commit et `sessions.create`), et l'une des
   compensations prévues n'aurait jamais tourné (voir phase 0).

## Architecture

> **Révisé le 2026-10-24** contre le code réel d'après la phase 0, par une
> cartographie en quatre lentilles (55 écarts, chacun réfuté par un second
> agent). La version initiale décrivait un code qui n'existe plus.

### 1. Schéma — migration 0016

```sql
ALTER TABLE "products" ADD COLUMN "stock_qty" integer;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD COLUMN "stock_qty" integer;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_qty_nonneg" CHECK ("stock_qty" IS NULL OR "stock_qty" >= 0);--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_stock_qty_nonneg" CHECK ("stock_qty" IS NULL OR "stock_qty" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_reserved_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_reserved_size_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_reserved_product_id" uuid;
```

`stock_qty NULL` = illimité. Résolution identique à celle du prix : si le produit
a des tailles **actives**, le compteur de la taille fait foi ; sinon celui du
produit. Les deux `stock_reserved_*_id` sont **sans clé étrangère**, pour survivre
à la suppression d'une taille. Invariant : si `stock_reserved_qty > 0`, exactement
l'une des deux est renseignée.

La migration est générée par `npm run db:generate`, jamais déposée à la main.
`generate` fixe le `when` du journal à `Date.now()` : vérifier que l'horloge de la
machine dépasse 1789914243063 (celui de 0015), sinon la migration serait sautée
sans bruit.

**Piège de la résolution à deux niveaux.** Si Céline désactive la dernière taille
active d'un produit, l'autorité retombe sur `products.stock_qty`, `NULL` par
défaut : un produit épuisé redeviendrait illimité. Le formulaire doit donc refuser
de désactiver ou supprimer la dernière taille active d'un produit dont une taille
porte un compteur fini.

### 2. Réserver — la commande `pending` est la réservation

Dans la transaction de `createPendingOrder` (inchangée par la phase 0), **avant**
l'INSERT des `order_items`, un UPDATE gardé par clé de stock, clés triées :

```sql
UPDATE product_sizes SET stock_qty = stock_qty - $n
 WHERE id = $sizeId AND product_id = $productId AND active = true
   AND (stock_qty IS NULL OR stock_qty >= $n)
 RETURNING stock_qty
```

`NULL - $n` reste `NULL`. **0 ligne** = rupture, taille retirée ou désactivée →
`CheckoutError`, rollback de toute la commande. `RETURNING stock_qty` dit si un
décrément a réellement eu lieu : non `NULL` → les trois colonnes
`stock_reserved_*` sont écrites **dans le `values` de l'INSERT**, jamais par un
UPDATE ultérieur ; `NULL` → rien à rendre plus tard.

Le prédicat porte `active = true` et `product_id` parce que les trois `SELECT` de
résolution sont hors transaction : l'UPDATE est sa propre autorité.

**Trier les clés globalement** (table puis id) est la seule précaution de
correction : elle évite l'interblocage entre deux transactions. L'agrégation par
clé avant l'UPDATE est un confort — exécutés en séquence dans la même transaction,
le second UPDATE voit l'écriture du premier et refuse correctement, sans survente
et sans se bloquer lui-même. Elle ne sert qu'à produire un message juste. **Ni
`FOR UPDATE` ni `SERIALIZABLE` ne sont nécessaires**, et on reste en
`READ COMMITTED`.

Le tri ne protège pas contre le formulaire produit, qui verrouille les tailles
dans l'ordre de soumission : voir §4.

### 3. Libérer — rejouer ce qui a été écrit, dans une transaction

```sql
UPDATE product_sizes SET stock_qty = stock_qty + $reservedQty
 WHERE id = $reservedSizeId AND stock_qty IS NOT NULL
```

Sans filtre `active`, sans jointure : on rejoue les colonnes persistées. Ligne
disparue ou compteur repassé à `NULL` → no-op, et c'est correct.

**Chaque chemin d'annulation ouvre sa propre transaction** autour du couple
(compare-and-set du statut + libération). C'est le point que la phase 0 a changé :
seul `updateOrderStatus` en avait une.

- `cancelOrderBySession` fait aujourd'hui deux UPDATE en autocommit. Les deux
  branches — par session, puis le repli par `metadata.orderId` — passent dans une
  seule `db.transaction`, et le crédit n'a lieu que si le CAS a renvoyé une ligne.
  Garder son `.update(orders)` **inline** : le test d'invariant de source exige
  qu'elle reste détectée comme écrivain de statut.
- `abandonPendingOrder` appelle `setOrderStatusIfUnchanged(db, …)` hors
  transaction et jette le résultat. L'appel Stripe `expireSessionForCancel` reste
  **hors** de la transaction ; celle-ci ne couvre que le CAS et le crédit.
- Le **webhook ne doit pas avaler** l'exception de la libération : un échec doit
  remonter en 500 pour que Stripe rejoue. Sinon une coupure entre le commit du
  statut et le crédit laisse une commande annulée dont le bouquet n'est jamais
  rendu — et le rejeu ne rattrape rien, puisque la commande n'est plus `pending`.

**La garde de libération n'est pas « l'UPDATE a renvoyé une ligne ».** Dans
`updateOrderStatus`, la lecture verrouillée plus le CAS font que toute transition
autorisée renvoie une ligne, `paid → cancelled` et `preparing → cancelled`
comprises. Le discriminant est `order.status === "pending" && to === "cancelled"`
sur la **lecture verrouillée**, dans la même transaction.

**Aucun verdict de `reconcilePaidSession` n'écrit le stock.** `paid_on_cancelled`
signifie qu'une commande annulée a encaissé : son origine réaliste est « Marquer
payée à la main puis annuler », auquel cas l'unité est toujours retenue. C'est un
cas à résolution humaine.

`expires_at` **revient dans le périmètre** : la phase 0 l'avait explicitement
reporté ici. `Math.floor(Date.now() / 1000) + 35 * 60` (plage 30 min – 24 h,
`node_modules/stripe/esm/resources/Checkout/Sessions.d.ts`), cinq minutes de marge
parce que Stripe horodate à la réception. **Sans lui, un panier abandonné retient
le bouquet jusqu'à 24 h**, et tout le reste du design — le libellé « Épuisé », la
durée du cookie, le JSON-LD — suppose les 35 minutes.

**Le client ne doit pas se verrouiller lui-même**, et le correctif prévu
initialement ne suffisait pas. Un cookie `httpOnly` posé dans `startCheckout` avec
l'id de la commande, relu au `startCheckout` suivant pour expirer, annuler et
libérer l'ancienne commande avant de réserver — mais le client qui revient par le
lien de retour de Stripe atterrit sur `/panier` (`cancel_url`), y voit sa propre
ligne « Épuisé » et un CTA désactivé : **il n'atteint jamais `startCheckout`**.
Donc `/panier` et `/checkout`, qui sont `force-dynamic`, lisent eux aussi ce
cookie et réintègrent dans la disponibilité les unités retenues par la commande
`pending` du visiteur. Les trois pages ISR ne le lisent **jamais** : `cookies()`
les rendrait dynamiques et annulerait `revalidate = 3600`.

### 4. Éditer le stock depuis le back-office

`syncChildren` renvoie toutes les tailles à chaque sauvegarde, avec les valeurs
chargées à l'ouverture de la page, et fait un `.set(values)` absolu. Mettre
`stockQty` dans `values` écraserait les réservations en cours.

1. `stock_qty` n'entre **jamais** dans `values` ni dans le `...rest` ; il est
   déstructuré hors de `parsed.data`, comme `price`.
2. Le formulaire envoie, pour chaque taille, la valeur **saisie** et la valeur
   **initiale** chargée (champ non éditable).
3. Saisie identique à l'initiale (comparées **après parse numérique**, `"07"` =
   `"7"`) → aucune écriture.
4. Saisie différente → une seule instruction **relative** :
   `stock_qty = GREATEST(0, stock_qty + (saisie - initiale))`. Quand l'une des
   trois valeurs est `NULL`, le delta n'a pas de sens : valeur absolue. Attention,
   `GREATEST(0, NULL + n)` vaut `NULL`, pas 0 — traiter le cas explicitement.
5. Nouvelle taille → valeur insérée telle quelle.
6. **Refuser la suppression** d'une taille qui porte une réservation `pending`
   (`stock_reserved_size_id` dans les tailles retirées et `stock_reserved_qty > 0`),
   avec un message nommant la taille et le nombre de commandes. Même garde dans
   `deleteProduct`.

**Trois états de saisie**, et les idiomes zod du dépôt les confondent tous :
`z.coerce.number()` transforme `""` en `0` (illimité devient épuisé) et le
`preprocess` existant transforme une clé absente en `null`. Écrire un schéma
dédié : `z.string().trim().regex(/^\d{0,4}$/).optional()` pour la saisie et
l'initiale ; `formData.get("stockQty") ?? undefined`, **jamais `?? ""`** ; un
`superRefine` exige l'initiale dès que la saisie est présente sur une taille
existante. Le message d'erreur doit citer la taille, puisque seule la première
issue est affichée. Le brouillon reste une **chaîne**, `type="text"
inputMode="numeric"`, aucune conversion côté client.

L'**ordre de verrouillage** du checkout ne protège pas contre le formulaire, qui
verrouille les tailles dans l'ordre de soumission. Le formulaire doit donc écrire
ses deltas dans le même ordre trié que la réservation.

Ce que Céline doit voir : un champ « Disponible à la vente » par taille ; en
lecture seule **« dont N en attente de paiement »** — prérequis, pas confort,
puisque c'est la seule visibilité sur les unités retenues ; « Épuisé » / « n
restants » dans la liste produits ; la taille et le coloris dans le détail de
commande.

### 5. Afficher

`ShopSize` et `ShopProduct` reçoivent un booléen dérivé `soldOut`, **jamais le
compteur** : tout champ de `ShopProduct` est sérialisé dans le HTML et le flight
RSC. L'invariant exact est « jamais le compteur **dans une page en cache ISR** ».

Surfaces où une taille est proposée à l'achat, toutes à traiter : carte boutique,
home, page produit, panier, checkout, **et `VaseSuggestions`**, oublié de la liste
initiale. `aria-disabled` **ne bloque pas le clic** : la garde vit dans `handleAdd`
et dans le `onClick` de `VaseSuggestions`, avant `add()` et `trackAddToCart`.

- Produit épuisé = toutes ses tailles actives à 0 (ou produit nu à 0).
- Le prix « dès X » se calcule sur les tailles **disponibles**, et retombe sur
  toutes si tout est épuisé.
- Première taille **disponible** présélectionnée ; tailles épuisées visibles mais
  inactives ; CTA « Épuisé » ; pas de seuil « derniers exemplaires » (stock typique 1).
- `productJsonLd` dérive `availability` par offre.
- Pas de classe CSS « épuisé » dans `app/globals.css` : elle est à créer.

**Le serveur ne voit jamais le panier.** La disponibilité de `/panier` et
`/checkout` ne peut donc pas être une table globale : une **Server Action** appelée
une fois le panier `ready` répond pour les seuls couples (slug, sizeId) du panier
et renvoie un plafond par ligne, calculé sur le total agrégé par taille (deux
coloris = deux lignes). Cela ne supprime pas la course restante : le message de
`startCheckout` reste l'oracle.

### 6. Cache

`revalidate = 3600` reste le filet. On revalide par **chemin littéral** — `/`,
`/boutique`, `/boutique/${slug}` — quand la disponibilité bascule, dans les deux
sens. `revalidatePath('/boutique/[slug]', 'page')` invaliderait toutes les pages
produit.

La phase 0 a multiplié les écrivains. Les appels vivent chez les **appelants**,
jamais dans `lib/orders.ts` (ces fonctions tournent pendant le rendu de la page de
confirmation) : dans `startCheckout` **hors du `try`**, après chaque
`abandonPendingOrder`, dans le webhook sur les deux événements d'expiration et
**dans son propre `try/catch`** pour garder le 200, et dans `changeOrderStatus`
quand `to` vaut `cancelled`. La **réservation réussie** bascule elle aussi la
disponibilité. Les fonctions de `lib/orders` ne renvoient pas de slugs : un helper
côté appelant les retrouve depuis l'id de commande (`order_items` → `products.slug`,
en ignorant `product_id` nul). Le hook e2e doit revalider lui aussi, sinon aucune
spec ne peut asserter l'affichage.

## Phase 0 — LIVRÉE le 2026-10-24 (commit b26e737)

> Cette section est de l'histoire : les quatre défauts décrits ci-dessous sont
> corrigés et committés. Elle est conservée parce que le code du stock s'appuie
> sur les primitives qu'elle a introduites.

Ces quatre défauts existent **aujourd'hui**, sans stock. Ils sont pour l'instant
peu coûteux. La réservation les transforme en pertes d'argent, parce qu'ils
libèrent du stock deux fois ou vendent un bouquet déjà payé.

**P0-1 — `updateOrderStatus` est un check-then-act hors transaction.**
Le statut est lu hors transaction, `canTransition` est évalué sur cette lecture,
puis l'UPDATE filtre sur `orders.id` **seul**, sans prédicat de statut, et
`RETURNING` renvoie donc toujours une ligne. Deux conséquences : une annulation
admin peut écraser un `paid` que le webhook vient de commiter (paiement perdu),
et deux déclenchements concurrents libèrent le stock deux fois.
Correctif : `UPDATE orders SET status = $to WHERE id = $id AND status = $from RETURNING *`
dans la même transaction que la lecture. 0 ligne → relire et lever
« Transition impossible ». Cette règle vaut pour **tout** chemin qui écrit
`orders.status`.

**P0-2 — annuler une `pending` depuis le BO n'expire pas la session Stripe.**
La session reste `open` et payable jusqu'à son `expires_at`. Le client peut payer
après l'annulation ; `markOrderPaidBySession` ne matche plus (statut ≠ `pending`)
et le repli exige `stripe_session_id` nul, donc il renvoie `null`. Le client est
débité, sa commande reste `cancelled` dans un état terminal.
Correctif : la règle expire-puis-annule de la section 3.

**P0-3 — un paiement reçu sur une commande `cancelled` est abandonné en silence.**
`markOrderPaidBySession` renvoie `null` aussi bien pour un rejeu légitime que
pour une commande annulée que Stripe a pourtant encaissée. Le webhook et la page
de confirmation traitent les deux cas pareil : aucun log, aucune alerte, 200
renvoyé donc Stripe ne rejoue pas. Et sur la page de confirmation, une commande
`cancelled` retombe dans la branche « en attente » : le client débité voit
« en attente de paiement » indéfiniment.
Correctif : quand `markOrderPaidBySession` renvoie `null`, relire la commande.
Si `paid` → rejeu, ignorer. Si `cancelled` alors que la session est payée →
alerter (log + e-mail à Céline) et traiter le cas explicitement côté page.

**P0-4 — la compensation prévue ne tournerait pas, et il manque une fuite.**
Dans `app/checkout/actions.ts`, le `return { error }` du cas `!session.url` sort
du `try` **sans passer par le `catch`** : une compensation placée dans le `catch`
ne couvrirait pas ce chemin. Et entre le commit de `createPendingOrder` et le
`catch`, rien ne garantit l'exécution de quoi que ce soit : timeout de la
fonction serverless pendant `sessions.create`, arrêt du process, coupure DB. Dans
ce cas il n'existe aucune session Stripe, donc **aucun** `checkout.session.expired`
ne viendra jamais et le repli `metadata.orderId` n'a rien à lire.
Correctif : compenser sur les trois sorties (`!session.url`, échec
`attachStripeSession`, exception), et prévoir le balayage paresseux de la
section 3 pour le cas où le process meurt.

À vérifier côté Dashboard Stripe de prod, hors code : que l'endpoint est bien
abonné à `checkout.session.expired` **et** `checkout.session.async_payment_failed`.
Toute la libération automatique en dépend. Les paiements asynchrones
(`completed` avec `payment_status: "unpaid"`) retiennent le stock plusieurs jours
sans que rien ne le signale.

Enfin, `startCheckout` n'a **aucun limiteur** (`lib/rate-limit.ts` ne définit que
`loginLimiter` et `contactLimiter`), `ItemsSchema` autorise 50 lignes et `qty`
jusqu'à 99, et une Server Action est appelable directement. Un script qui appelle
`startCheckout` en boucle met tout le stock fini à zéro et le maintient en
réarmant toutes les 35 minutes, sans une seule vente. Plafonner `qty` au stock
disponible, ajouter un limiteur par IP sur le modèle de `contactLimiter`, garder
`expires_at` court, et appliquer la règle d'une seule réservation active par
navigateur.

## Tests

Les erreurs Postgres arrivent en `DrizzleQueryError` : `err.code` est `undefined`,
le vrai code est dans `err.cause.code` (`23514` pour un `CHECK`, `40P01` pour un
deadlock — ce dernier désormais observé).

**PGlite est mono-connexion.** Ce qu'un test y prouve : le prédicat (`NULL`, `>=`,
0 ligne), le refus au second appel séquentiel, le rollback de toute la commande
quand une ligne échoue, la rejouabilité de la libération, la clé persistée qui
survit à la suppression de la taille, la forme des erreurs, et des entrelacements
d'**état** déterministes injectés hors transaction. Ce qu'il ne prouvera
**jamais** : l'exclusion mutuelle entre transactions, la ré-évaluation du prédicat
après attente de verrou, l'interblocage, le comportement du pooler Supavisor.
**Un test de concurrence sur PGlite est vert même pour une implémentation naïve
qui survend en production** : nommer ces tests « (logique, sans concurrence
réelle) » dans leur `describe`.

**Quatre invariants de source**, dans `tests/unit/orders-write-invariants.test.ts` :
les deux existants, plus (3) tout `.update(productSizes)` / `.update(products)`
dont le `.set()` touche `stockQty` doit vivre dans une liste blanche de fonctions
nommées — `.insert(productSizes)` reste libre ; et (4) toute fonction qui peut
produire `cancelled` doit aussi appeler la libération. Attention à la résolution
d'alias : prendre la déclaration **la plus proche avant** l'appel, à cause des
trois `const values` du fichier admin.

Unitaires : résolution à deux niveaux · décrément (`qty <= stock`, `>` refusé sans
ligne `orders` ni `order_items`, 0 refusé, `NULL` accepté et toujours `NULL`) ·
agrégation deux coloris · multi-lignes atomique · libération sur **chacun** des
quatre chemins (`updateOrderStatus`, `cancelOrderBySession` avec et sans
`fallbackOrderId`, `abandonPendingOrder`, webhook `expired` et
`async_payment_failed`), rejeu sans double crédit · taille supprimée qui ne
crédite pas le produit · formulaire (payload sans clé → inchangé ; saisie égale à
l'initiale après un décrément concurrent → compteur courant conservé ; `""` →
`NULL` ; `"0"` → 0 ; `abc`, `1.5`, `-1` → erreur de champ nommant la taille ;
suppression d'une taille réservée refusée) · `startCheckout` (Stripe qui lève,
sans URL, `attachStripeSession` qui lève → stock rendu).

Dans les cinq fichiers qui partagent la base via `getDb()`, chaque test insère son
propre produit à slug unique, ou le fichier adopte le `vi.mock` de
`@/lib/db/client` de `sync-children.test.ts`. Dans les tests de refus, asserter le
**message exact et l'état en base**, jamais seulement la classe d'erreur.

**Le hook e2e** ne peut pas créer de commande sur un produit à tailles :
`BodySchema` ne déclare que `{ slug, qty }` et zod retire le reste. Il doit
accepter `sizeLabel`/`colorLabel` (résolus côté serveur, pas d'uuid exposé),
renvoyer **409** sur `CheckoutError`, et annuler par le chemin qui libère. Dans le
**même commit**, retirer l'exemption `E2E_HOOK` de l'invariant de source, devenue
inutile et qui ferait échouer le test une fois le hook corrigé. Les statuts non
terminaux restent posés par CAS direct depuis `pending`, `canTransition` ne les
autorisant pas.

Seuls `*.test.*`, `*.spec.*` et `__tests__` sont ignorés par `next build` : tout
helper de test partagé hors de ces noms doit rester strictement typé. Cinq
fixtures typées (`soldOut`, `stockQty`) casseront `npm run typecheck` et sont à
corriger dans le commit qui change les types.

**15 tests échouent déjà** : 11 dus au seed incomplet, 4 à des tests de contenu —
et non « 15 du seed ». Ne pas toucher à `seed-data.ts`.

## Invariant de sécurité — le cookie de réservation (ajouté le 2026-10-25)

Un examen de sécurité automatique a classé `abandonReservedOrder` en IDOR moyen : le cookie `coquelicot.reservation` ne porte qu'un id de commande, non signé, et cet id autorise à expirer la session Stripe de cette commande puis à l'annuler. Le correctif suggéré était une colonne `reservation_token` aléatoire, ou un cookie signé en HMAC.

**Constat vérifié le 2026-10-25 : non exploitable en l'état, et le correctif n'a pas été appliqué.** L'attaque exige de posséder l'UUID d'une commande `pending` d'autrui, et aucune surface visible d'un visiteur n'en divulgue un :

- les id de commande viennent de `uuid().primaryKey().defaultRandom()`, donc `gen_random_uuid()` — UUID v4, 122 bits, inénumérables ;
- la vue de confirmation ne rend aucun id de commande ;
- les mails impriment `order.number` et jamais l'UUID ;
- le hook e2e est gardé trois fois (`E2E_TEST_HOOKS=1`, `DATABASE_URL` vide, absence de plateforme d'hébergement) et ne rend que les id des commandes qu'il crée lui-même ;
- le cookie est `httpOnly`, `sameSite: "lax"`, et `secure` en production : illisible depuis un autre site.

Autrement dit, l'UUID de la commande **est déjà** le jeton aléatoire que le correctif proposait d'ajouter. Le refus de migrer est un arbitrage : la colonne demanderait une migration de plus sur un projet dont le journal de migrations vient d'être réparé, et la variante HMAC demanderait un secret serveur, donc une variable d'environnement de plus avant mise en production.

**Invariant à tenir, sous peine de rendre la faille vivante en silence.** L'id technique d'une commande ne doit jamais atteindre une surface visible d'un visiteur : ni rendu dans une page, ni imprimé dans un mail, ni placé dans une URL, ni exposé par une Server Action à un client. `order.number` existe précisément pour cela et c'est lui qui sert de référence humaine. Le jour où ce besoin apparaît — un lien « suivre ma commande », une référence au support — il faut **d'abord** introduire le jeton de réservation, puis seulement exposer l'id.

## Prérequis de déploiement

**La migration doit être appliquée avant le déploiement du code.** Drizzle liste
toutes les colonnes dans ses `select()` : le code qui lit `stock_qty` plante
partout tant que la colonne manque — même mécanisme que `0015/image_frame`.

**Établi le 2026-10-24 par requête sur la prod, puis par lecture du code du
migrateur.** La table `drizzle.__drizzle_migrations` ne contient que **10 lignes**
(0000 à 0009, `max(created_at) = 1786546185140`) alors que le schéma de prod porte
**bel et bien tous les objets de 0010 à 0015**, vérifiés un par un : les quatre
tables, `products.image_frame`, `products.description_rich`,
`product_images.color_id`, et `products.tag` rendu nullable.

**Conséquence, contre-intuitive : `npm run db:migrate` échoue, en silence.**
`drizzle-kit` délègue à `drizzle-orm/postgres-js/migrator`
(`node_modules/drizzle-kit/bin.cjs`), qui ne lit qu'**une** ligne — celle au
`created_at` le plus grand — et applique dans **une seule transaction** toute
entrée du journal postérieure (`pg-core/dialect.js:56-71`). Il tente donc 0010,
dont la première instruction est un `CREATE TABLE "settings"` nu : erreur 42P07,
rollback de tout. Et le CLI masque l'erreur avant de sortir en code 1
(`bin.cjs`, `renderWithTask7` : `terminal.reject(err)` puis `process.exit(1)`).

**Donc 0016 ne s'appliquera jamais tant que le trou n'est pas comblé.** Et comme
tous les `select()` de Drizzle énumèrent les colonnes, déployer le code du stock
avant la colonne casse toute la boutique.

**La réparation** est dans `docs/db/2026-10-24-reparation-journal-migrations.sql` :
elle n'applique aucun DDL, elle enregistre les 6 lignes de comptabilité manquantes
(`hash` = sha256 du texte brut de chaque `.sql`, comme `migrator.js:15-23` ;
`created_at` = le `when` du journal) derrière un bloc `DO` qui refuse de
s'exécuter si l'état diffère de celui diagnostiqué — y compris si les **migrations
de données** de 0012 et 0013 n'ont pas tourné. À lancer par le propriétaire de la
base, avant `db:generate` puis `db:migrate`.

**La règle « ne jamais insérer à la main » devient conditionnelle :** ne jamais
enregistrer une migration dont les objets n'existent pas — cela la sauterait
définitivement. Enregistrer 0010 à 0015 **après vérification** est la réparation,
pas la faute. La ligne de 0016, elle, doit rester l'œuvre du migrateur.

## Points laissés au constructeur

- La forme exacte du helper de lecture `err.cause?.code` et de son retry.
- Le découpage en commits et l'ordre d'implémentation à l'intérieur de chaque phase.
- Le libellé définitif des champs et messages, sous la contrainte Playwright
  ci-dessus.
- L'emplacement du cookie de réservation et sa durée (alignée sur `expires_at`).
- La forme du log et de l'alerte pour P0-3.
- **Protection contre l'accaparement : mon choix, pas une question.** Limiteur en
  mémoire sur le modèle de `contactLimiter`, plafond de `qty` au stock disponible,
  `expires_at` court, cookie de réservation unique par navigateur. Aucun de ces
  moyens ne ferme vraiment le scénario du script qui réarme toutes les 35 minutes :
  le limiteur est par instance serverless et le cookie s'ignore. Risque résiduel
  **accepté** — c'est une boutique de fleuriste, pas une vente de baskets en série
  limitée. Si une protection durable est voulue (store partagé, donc une table),
  elle doit entrer dans 0016 : changer d'avis plus tard coûte une 0017 sur une pile
  de migrations fragile.

## À trancher — état au 2026-10-24

**Tranché.** Le stock se compte **par taille** ; les coloris n'en portent jamais.
La **phase 0 est livrée seule d'abord** (b26e737). Le **journal de migrations de
prod est réparé** et vérifié : `db:migrate` peut désormais appliquer une 0016.

**Mes décisions, à renverser à la lecture du plan.**

1. **Remise en stock sur `paid → cancelled` : jamais automatique**, case explicite
   dans le BO, et rien sur `preparing → cancelled` (bouquet déjà composé, étiquette
   Mondial Relay éventuellement créée). **Coût caché** : la chaîne n'a aujourd'hui
   aucun canal pour porter ce drapeau — `changeOrderStatus(orderId, to)` ne prend
   que `to`, le formulaire n'envoie que `to`, et `StatusActionState` ne sait pas
   dire un succès. La case demande donc d'élargir les trois. Si tu préfères « pas
   de remise en stock du tout sur une commande payée », tout ce travail disparaît.
2. **`products.stock_qty` est conservé** même si un bouquet limité a toujours des
   tailles : une colonne nullable jamais utilisée ne coûte rien, alors que l'ajouter
   après coup coûte une 0017. L'indice du seed penche pour « pas toujours des
   tailles » (`rivage`, `gabut`, `estran`, `mistral` sont vendus nus). **Mais** la
   réponse change le plan e2e : le hook de test ne sait pas créer de commande sur un
   produit à tailles, donc si tous les bouquets limités en ont, il faut l'étendre.

**Reste à vérifier par toi, hors code.**

3. **Moyens de paiement asynchrones dans le Dashboard Stripe.**
   `sessions.create` ne fixe pas `payment_method_types`. Une session `completed`
   avec `payment_status: "unpaid"` retiendrait le stock plusieurs jours sans aucun
   signal. Soit on accepte, soit on restreint à la carte quand le panier contient
   un article limité. À vérifier avec l'abonnement du webhook de prod à
   `checkout.session.expired` **et** `checkout.session.async_payment_failed`, dont
   dépend toute la libération automatique.
4. **Droit d'écriture de la clé `rk_` sur les Checkout Sessions**, hérité de la
   phase 0 : sans lui, aucune commande `pending` ne peut plus être annulée depuis
   le BO.

## Ce qui a été écarté

- **Table `reservations` avec TTL et cron.** La commande `pending` le fait déjà.
  Un balayeur naïf annule une commande dont la session Stripe est encore ouverte :
  le client paie, l'appli ne reconnaît plus la commande, l'argent est encaissé et
  le bouquet revendu.
- **Décrément au `paid` seulement.** Survente offerte : deux clients paient le
  dernier bouquet.
- **Journal de mouvements de stock.** `order_items` et les statuts reconstituent
  déjà l'historique pour une fleuriste.
- **`SERIALIZABLE` ou une colonne de version.** Le verrou de ligne Postgres et un
  UPDATE conditionnel suffisent.
- **Compteur exact sur les pages en cache.** Il obligerait à rendre la page
  produit dynamique, ce qui se paie sur chaque visite, pour une information que le
  checkout revalide de toute façon.
