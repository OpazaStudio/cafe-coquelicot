# Stock limité par taille — bilan avant déploiement

Branche `feat/stock-limite-par-taille`, 14 commits, non mergée, non poussée.
820 tests unitaires dont 805 verts et 15 rouges **préexistants** (le seed de développement n'a que 12 produits là où certains tests en attendent 15).
Suite e2e : 6 échecs préexistants, dont 5 du même seed incomplet.

---

## 1. Ce qui bloque le déploiement

**État au 2026-10-25 : plus rien ne bloque la mise en ligne.** Le point 1.1 était une erreur de ma part, le point 1.2 est résolu, et le point 1.3 — mal classé par moi — ne bloque pas le **déploiement** mais l'**activation** du stock sur un produit.

**Pourquoi la mise en ligne est sans risque tant qu'aucun compteur n'est posé.** Après la migration, tous les produits ont `stock_qty` à `NULL`, ce qui signifie illimité, et le code est alors entièrement dormant — vérifié dans le code, pas supposé :

- `reserveStock` sort par `if (decremented[0].stockQty === null) continue;` (`lib/stock/reserve.ts:121`) : sur un compteur illimité, **aucune réservation n'est enregistrée**, `stock_reserved_qty` reste à 0 ;
- l'`UPDATE` de décrément fait `stock_qty = stock_qty - n`, qui sur `NULL` rend `NULL` : le compteur ne bouge pas ;
- la disponibilité du panier rend `maxQty: null` pour un compteur `NULL` (`lib/stock/availability.ts:91`), donc aucun plafond ;
- `soldOut` vaut `stock_qty === 0`, et `NULL` n'est pas `0` : aucun badge « épuisé ».

Rien n'étant jamais retenu, il n'y a rien que le webhook doive libérer. Le déploiement est donc inerte.

### 1.1 ~~Le droit d'écriture de la clé Stripe restreinte~~ — ERREUR DE MA PART, RETIRÉ le 2026-10-25

**Ce bloquant n'a jamais existé, et je l'ai propagé pendant dix tâches sans le vérifier.**

Le raisonnement fautif : je traitais `sessions.create` et `sessions.expire` comme pouvant relever de permissions distinctes sur une clé restreinte. La documentation Stripe dit le contraire, sur deux points qui suffisent :

- les permissions d'une clé restreinte sont **par ressource** — « vous sélectionnez les ressources Stripe auxquelles la clé peut accéder ainsi que les autorisations pour chaque ressource : Lecture, Écriture ou Aucune » ;
- le niveau découle de la **méthode HTTP** : leur tableau donne `GET → lire`, `POST → écrire`, `DELETE → écrire`.

Créer une session est `POST /v1/checkout/sessions`, l'expirer est `POST /v1/checkout/sessions/:id/expire` : même ressource, même méthode, **donc la même permission d'écriture**. Des paiements réussis en production prouvent donc que la clé sait aussi expirer.

Ce que cela corrige dans tout ce document : le back-office n'est **pas** à moitié inutilisable, les annulations ne sont **pas** refusées, et le corollaire sur le paiement absorbé en silence par la branche `replay` redevient rare au lieu d'être aussi fréquent que le bloquant.

Ce qui reste vrai : le verdict `unreachable` existe toujours dans le code et son traitement est correct — mais il ne se déclenchera que pour une vraie raison transitoire (Stripe réellement injoignable, ou une session dans un état non expirable), pas pour une question de permission. C'est d'ailleurs pourquoi la reformulation de ses messages tient : ils ne doivent pas affirmer « Stripe est injoignable » alors que la cause peut être autre.

**La leçon, parce qu'elle vaut plus que le bloquant** : c'est exactement le défaut que j'ai reproché six fois aux implémenteurs de ce plan — affirmer au lieu de vérifier. L'hypothèse venait de mon propre document de conception, et personne ne l'a interrogée parce qu'aucun test ne pouvait la trancher. Il aurait fallu lire la documentation de Stripe, ce qui prenait deux minutes.

### 1.2 ~~La migration 0016 n'est pas appliquée~~ — FERMÉ le 2026-10-25

Le journal de migrations Supabase a été réparé le 2026-10-24 (10 lignes pour 16 migrations). `0016_confused_gauntlet.sql` ajoute les colonnes de stock et de réservation. À appliquer avant tout déploiement de cette branche.

**Le déploiement de prévisualisation de la PR #1 a échoué, et c'est probablement ce point.** Mécanisme : `/` et `/boutique` portent `revalidate = 3600` sans API dynamique, donc Next les prérend au build, et leurs requêtes sélectionnent désormais `stock_qty` (`lib/products.ts:92`, `:127`). Si le build tourne contre une base où `0016` n'est pas appliquée, il échoue sur une colonne manquante. Les fiches produit, elles, ne sont pas concernées : `generateStaticParams` y rend volontairement `[]`.

**Confirmé et résolu.** La migration a été appliquée à la main dans Supabase (`docs/db/2026-10-25-application-manuelle-0016.sql`), et la vérification rend les six contrôles à `true` avec 17 lignes de journal : les colonnes, les contraintes et l'enregistrement du passage de 0016 sont en place, donc `drizzle-kit migrate` ne tentera pas de la rejouer.

Le déploiement relancé sur le **même code** passe désormais, ce qui confirme le mécanisme : seule la base avait changé. La PR est verte et mergeable.

### 1.3 Abonnement du webhook — bloque l'ACTIVATION, pas le déploiement

Le code traite `checkout.session.expired` et `checkout.session.async_payment_failed`. Si l'endpoint Stripe n'y est pas abonné, **aucune réservation abandonnée ne sera jamais libérée** : chaque panier commencé puis délaissé retient son bouquet, et le compteur se vide sans une seule vente — en silence.

**Mais cela ne devient vrai qu'à partir du moment où un compteur est posé sur un produit.** La règle de sûreté est donc simple : mettre en ligne quand on veut, et **ne renseigner « Disponible à la vente » sur aucun produit avant que l'abonnement soit en place**.

Et même si un compteur était posé trop tôt, le cas resterait rattrapable à la main : annuler la commande depuis le back-office libère le stock par un chemin qui ne dépend pas du webhook. Il faudrait seulement s'en apercevoir.

---

### 1.4 Hors stock, mais le dépôt est public : une adresse personnelle est en dur dans le code

Préexistant à cette branche et déjà publié, donc à traiter pour lui-même. `lib/email/resend.ts:13` porte `const DEFAULT_BCC = ["celine.brahic@outlook.com"]`, et l'adresse apparaît aussi dans `.env.example` et dans `tests/unit/resend-bcc.test.ts`. Sur un dépôt public, c'est une donnée personnelle offerte aux moissonneurs d'adresses.

Je ne l'ai pas retirée, et volontairement : c'est un **défaut fonctionnel**, pas un commentaire. Si `CONTACT_BCC` n'est pas définie dans Vercel, la supprimer ferait silencieusement cesser la copie de tous les mails sortants vers la boutique. Le bon ordre est donc : définir `CONTACT_BCC` dans Vercel, **puis** retirer la valeur en dur du code et de `.env.example`. Retirer l'adresse de l'historique déjà publié est un autre chantier (réécriture d'historique), et sans doute disproportionné.

---

## 2. Décisions produit qui t'appartiennent

### 2.1 Un passage manuel en « Payée » doit-il prévenir le client ?

Aujourd'hui, non — sur aucun chemin, et ce n'est pas une régression de cette branche. Conséquence : si un client paie par Stripe et que tu marques la commande payée à la main avant l'arrivée du webhook, il ne reçoit **aucun mail de confirmation**.

Le remède existe et a été conçu mais pas codé : une lecture seule de la session avant l'écriture détecterait le paiement déjà abouti et passerait par la réconciliation, qui rattache le paiement et envoie les effets de bord. Coût : un aller-retour Stripe de plus sur chaque « Marquer payée ». Je ne l'ai pas pris parce qu'il décide à ta place.

### 2.2 Les moyens de paiement asynchrones

Non activés dans le tableau de bord Stripe, donc ce chemin est aujourd'hui inatteignable. Si tu les actives : une session portant un paiement asynchrone ne permet pas de distinguer « en vol » de « déjà échoué », donc le refus de remise en vente devient **définitif** pour cette commande. Contournable à la main par le champ « Disponible à la vente ».

### 2.3 Le risque de déni d'inventaire reste accepté

Un script peut maintenir le catalogue limité à « épuisé » en réarmant des réservations valides toutes les 35 minutes, sans une seule vente. Les seules atténuations réelles sont `expires_at` à 35 minutes et le cookie de réservation, contournable par un script. Un vrai limiteur demande un magasin partagé, donc une table, donc une migration : hors de cette phase.

---

## 3. Dette et points de vigilance

- **Pas de balayage paresseux.** Si la libération d'une commande sans session Stripe échoue deux fois, elle reste en attente avec son stock retenu et **rien ne réessaiera**. Journalisé bruyamment avec les clés retenues, pour une correction à la main.
- **L'inversion de verrous 40P01** entre `updateOrderStatus` et `setItemPreparedQty` est préexistante et gagne un chemin avec la remise en stock. Abandon avec message, pas corruption. C'est l'argument le plus fort recueilli pour la corriger, dans sa propre tâche.
- **Une instabilité inexpliquée**, observée une fois sur treize en e2e : après « Annuler la commande », boutons désactivés et aucun message **alors que l'annulation a bien eu lieu en base**. Cause non établie, hypothèse non prouvée d'une contention PGlite. Non exclue en production : le bon réflexe est de **recharger**, pas de recliquer.
- **Un bug de fuseau préexistant** dans `lib/stats.ts` : `getRevenueByDay` calcule ses seaux de jour en SQL dans le fuseau de session et ses clés en JS en UTC. Latent tant que le fuseau de session Supabase est UTC.
- **Le résumé du kanban** (`06-admin-kanban`) échoue déjà sur HEAD, indépendamment du stock : Next 16.2.9 avec React 19 laisse un `<div hidden id="S:0">` orphelin hors de `<main>` qui duplique le board. Un correctif devra scoper **tous** les `getByTestId` du fichier, et il n'y aura pas de rouge reproductible pour le valider.
- **Le seed de développement est incomplet** : `estran`, `galerne` et `carte-fleurie` manquent, d'où 15 échecs unitaires et 5 e2e qui n'ont rien à voir avec le stock.

---

## 4. Vérifications qui n'ont pas pu être faites

- **Aucune vérification dans un navigateur par moi** : tout l'affichage est couvert par des tests, jamais vu de mes yeux.
- **La neutralisation d'une session Stripe réelle** n'est exercée par aucun test : la commande du hook e2e n'a pas de session, donc l'annulation part en `no_session` et ne parle jamais à Stripe.
- **Le `Set-Cookie` réel sur le chemin de redirection** du checkout n'a pas pu être observé.

---

## 5. Comment le stock fonctionne, en six phrases

La réservation **est** la commande en attente : il n'y a pas de table de réservation. Un compteur `null` signifie illimité, et le stock se compte **par taille**, les coloris n'en portant jamais. La réservation fait, par clé de stock triée, un seul `UPDATE` gardé qui décrémente et refuse d'un même geste — le tri est la seule protection contre l'interblocage, et il est désormais épinglé par des tests. La libération rejoue ce qui a été écrit, sur quatre chemins, chacun dans sa transaction. Les pages produit et boutique étant en cache à une heure, sept écrivains de stock déclenchent une revalidation à la demande. Et le visiteur ne voit jamais le compteur exact ailleurs que dans son panier et son checkout.
