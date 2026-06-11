# Coquelicot — Fleuriste · La Rochelle

Boutique en ligne + back-office d'un atelier-boutique de fleurs fraîches &
séchées à La Rochelle. Next.js (App Router) · Supabase (Postgres) · Drizzle ·
Stripe Checkout.

## Direction visuelle

- **Display** : Bagel Fat One (chunky rétro, façon flyer Rivage)
- **Script** : Caveat (accents manuscrits)
- **Corps** : DM Sans
- **Palette** : burgundy `#870c20` · linen `#f3ebe2` · pale-oak `#e0caaf` · coffee-bean `#6d4d36` · coffee-bean-2 `#130105`
- Illustrations SVG au trait (`currentColor`, héritent du `--fg` de chaque section)
- Grain papier en overlay, animations reveal au scroll
- Le back-office (`/admin`) a sa propre peau utilitaire (Tailwind v4 **sans
  preflight**, scopé `.admin-root`) — la CSS de marque reste intacte.

## Structure

- `app/page.tsx`, `app/boutique/` — vitrine (catalogue lu en base, rendu dynamique)
- `app/panier/`, `app/checkout/`, `app/commande/confirmee/` — tunnel d'achat
- `app/api/stripe/webhook/` — webhook Stripe (signature vérifiée, pending → paid)
- `app/(admin)/admin/` — back-office : login, produits (CRUD), commandes (statuts), dashboard (KPIs + graphe)
- `proxy.ts` — garde optimiste de `/admin` (la vérité reste dans `lib/auth/dal.ts`)
- `lib/db/` — schéma Drizzle (`products`, `orders`, `order_items`), client, migrations, seed
- `lib/` — `orders.ts` (cycle de vie), `stats.ts` (agrégats SQL), `cart/` (panier localStorage), `auth/` (session jose + bcrypt), `stripe.ts`, `money.ts`
- `components/` — sections de la vitrine, cartes produit, panier, checkout

## Base de données

`DATABASE_URL` absente → l'app utilise **PGlite** (Postgres embarqué) dans
`.data/pglite`, migré et seedé automatiquement : `npm run dev` fonctionne sans
aucune configuration.

Avec Supabase (production) :

1. Dashboard Supabase → Connect → **Transaction pooler** → copier l'URL dans
   `DATABASE_URL` (`.env.local` / variables Vercel).
2. `npm run db:migrate` puis `npm run db:seed` (insère les 14 produits si la
   table est vide).

Le schéma évolue avec `npm run db:generate` (nouvelle migration depuis
`lib/db/schema.ts`).

## Variables d'environnement

Voir `.env.example`. En résumé : `DATABASE_URL`, `STRIPE_RESTRICTED_KEY` (ou
`STRIPE_SECRET_KEY`), `STRIPE_WEBHOOK_SECRET`, `SESSION_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, `NEXT_PUBLIC_SITE_URL`.
(`ADMIN_PASSWORD` en clair dans `.env.local` ne sert qu'aux tests e2e locaux.)

## Stripe

- Paiement par **Stripe Checkout** (session créée côté serveur, prix relus en
  base — jamais ceux du client).
- Le **webhook** (`/api/stripe/webhook`) passe la commande `pending → paid` ;
  la page de confirmation fait le même marquage en filet de sécurité
  (idempotent) pour le dev local.
- En production : créer le endpoint dans le Dashboard Stripe
  (`https://votre-domaine/api/stripe/webhook`, événements
  `checkout.session.completed`, `checkout.session.expired`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`) et copier le secret `whsec_…` dans
  `STRIPE_WEBHOOK_SECRET`.
- En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Back-office

`/admin` — compte unique (Léa), session JWT signée (jose) en cookie httpOnly,
mot de passe hashé bcrypt. Régénérer le hash :
`node -e "console.log(require('bcryptjs').hashSync('nouveau-mdp',10))"`
(échapper les `$` en `\$` dans `.env.local`).

## Développement

```bash
npm run dev          # http://localhost:3000 (PGlite auto si pas de DATABASE_URL)
npm run build        # build de production (Turbopack)
npm run lint         # eslint
npm run typecheck    # next typegen + tsc --noEmit
```

## Tests

```bash
npm test             # 43 tests unitaires Vitest (logique panier, commandes,
                     # stats SQL sur PGlite, webhook signé, session, money, slug)
npm run test:e2e     # 14 tests Playwright contre le build de production :
                     # vitrine, panier, auth admin, CRUD produits, et un
                     # paiement Stripe RÉEL en mode test (carte 4242) jusqu'au
                     # dashboard. Nécessite le réseau + clés Stripe test.
```

Les e2e démarrent leur propre serveur (port 3105) sur une base PGlite dédiée
(`.data/pglite-e2e`, purgée à chaque campagne).

## Déploiement (Vercel)

1. Renseigner les variables d'environnement (voir `.env.example`) —
   `DATABASE_URL` = pooler Supabase, `NEXT_PUBLIC_SITE_URL` = URL publique.
2. `npm run db:migrate && npm run db:seed` une fois contre la base de prod.
3. Créer le webhook Stripe (ci-dessus) et passer les clés live le moment venu.
