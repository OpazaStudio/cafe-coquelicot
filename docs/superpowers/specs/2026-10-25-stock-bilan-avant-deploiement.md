# Stock limité par taille — bilan avant déploiement

Branche `feat/stock-limite-par-taille`, 14 commits, non mergée, non poussée.
820 tests unitaires dont 805 verts et 15 rouges **préexistants** (le seed de développement n'a que 12 produits là où certains tests en attendent 15).
Suite e2e : 6 échecs préexistants, dont 5 du même seed incomplet.

---

## 1. Ce qui bloque le déploiement

### 1.1 Le droit d'écriture de la clé Stripe restreinte — à vérifier en premier

`lib/stripe.ts` préfère `STRIPE_RESTRICTED_KEY`. Si cette clé n'a pas le droit **d'écriture sur les Checkout Sessions**, `sessions.expire` échoue, `retrieve` voit la session encore `open`, et le verdict devient `unreachable`. Ce n'est pas un cas rare : c'est le **chemin normal**.

Conséquences cumulées, back-office à moitié inutilisable :
- chaque « Marquer payée » affiche un avertissement ;
- **chaque annulation d'une commande en attente est refusée** ;
- aucune unité d'une commande payée à la main ne peut être remise en stock.

Et un effet couplé : tant que cette permission manque, un vrai paiement Stripe arrivant sur une commande déjà marquée payée est absorbé en silence, **sans rattachement du paiement ni mail au client**.

**Aucun test ne peut trancher ce point**, dans aucun mode : les permissions d'une clé restreinte se configurent par clé, et `rk_live` est un objet différent de la `rk_test` locale. Seule la lecture des permissions dans le tableau de bord Stripe le peut.

**Et des paiements réussis ne le ferment pas.** C'est l'inférence naturelle, mais elle ne tient pas : encaisser prouve que la clé sait `sessions.create`, le bloquant porte sur `sessions.expire`, qui est une permission distincte sur une clé restreinte. La spécification e2e de paiement passe d'ailleurs en entier, carte comprise, sans rien dire du droit d'expirer.

**Deux vérifications, dans cet ordre.** D'abord dans Vercel : si `STRIPE_RESTRICTED_KEY` n'est **pas** définie pour la production, `getStripe()` retombe sur `STRIPE_SECRET_KEY` (`lib/stripe.ts:9`), une clé secrète a tous les droits, et **ce bloquant n'existe pas en production**. Si elle y est, alors dans Stripe en mode Live : page API keys, section *Restricted keys*, la clé correspondante, permission **Checkout Sessions** en **Write** et non Read.

### 1.2 La migration 0016 n'est pas appliquée en production

Le journal de migrations Supabase a été réparé le 2026-10-24 (10 lignes pour 16 migrations). `0016_confused_gauntlet.sql` ajoute les colonnes de stock et de réservation. À appliquer avant tout déploiement de cette branche.

### 1.3 Abonnement du webhook aux événements d'expiration

Le code traite `checkout.session.expired` et `checkout.session.async_payment_failed`. Si l'endpoint Stripe n'y est pas abonné, **aucune réservation abandonnée ne sera jamais libérée** : le stock se videra sans une seule vente.

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
