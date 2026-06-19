# Config

## Environment Variables

- `ADMIN_EMAIL` (has default) — .env.local
- `ADMIN_PASSWORD` (has default) — .env.local
- `ADMIN_PASSWORD_HASH` (has default) — .env.local
- `CI` **required** — playwright.config.ts
- `DATABASE_URL` (has default) — .env.local
- `E2E_TEST_HOOKS` **required** — app/api/e2e/orders/route.ts
- `MONDIAL_RELAY_API_LOGIN` (has default) — .env.local
- `MONDIAL_RELAY_API_PASSWORD` (has default) — .env.local
- `MONDIAL_RELAY_API_URL` (has default) — .env.local
- `MONDIAL_RELAY_CUSTOMER_ID` (has default) — .env.local
- `NEXT_PUBLIC_MONDIAL_RELAY_BRAND` (has default) — .env.local
- `NEXT_PUBLIC_SITE_URL` (has default) — .env.local
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (has default) — .env.local
- `NEXT_PUBLIC_SUPABASE_URL` (has default) — .env.local
- `NODE_ENV` **required** — lib/auth/dal.ts
- `PGLITE_DATA_DIR` **required** — lib/db/client.ts
- `SESSION_SECRET` (has default) — .env.local
- `STRIPE_PUBLIC_KEY` (has default) — .env.local
- `STRIPE_RESTRICTED_KEY` (has default) — .env.local
- `STRIPE_SECRET_KEY` (has default) — .env.local
- `STRIPE_WEBHOOK_SECRET` (has default) — .env.local

## Config Files

- `.env.example`
- `drizzle.config.ts`
- `next.config.ts`
- `tsconfig.json`

## Key Dependencies

- drizzle-orm: ^0.45.2
- next: 16.2.9
- react: 19.2.4
- stripe: ^22.2.0
- zod: ^4.4.3
