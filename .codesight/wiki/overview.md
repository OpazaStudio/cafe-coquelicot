# cafe-coquelicot — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**cafe-coquelicot** is a typescript project built with next-app, using drizzle for data persistence.

## Scale

3 API routes · 10 database models · 113 UI components · 46 library files · 6 middleware layers · 29 environment variables

## Subsystems

- **[Payments](./payments.md)** — 1 routes — touches: auth, payment
- **[Admin](./admin.md)** — 1 routes — touches: auth, payment, upload
- **[Route](./route.md)** — 1 routes — touches: auth, db

**Database:** drizzle, 10 models — see [database.md](./database.md)

**UI:** 113 components (react) — see [ui.md](./ui.md)

**Libraries:** 46 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `app/(admin)/admin/(panel)/ui.tsx` — imported by **18** files
- `tests/e2e/helpers.ts` — imported by **13** files
- `tests/helpers/db.ts` — imported by **13** files
- `lib/content/fields.ts` — imported by **8** files
- `lib/db/schema.ts` — imported by **7** files
- `lib/db/client.ts` — imported by **7** files

## Required Environment Variables

- `CI` — `playwright.config.ts`
- `E2E_TEST_HOOKS` — `app/api/e2e/orders/route.ts`
- `NETLIFY` — `app/api/e2e/orders/route.ts`
- `NODE_ENV` — `app/contact/actions.ts`
- `PGLITE_DATA_DIR` — `lib/db/client.ts`
- `RENDER` — `app/api/e2e/orders/route.ts`
- `VERCEL` — `app/api/e2e/orders/route.ts`

---
_Back to [index.md](./index.md) · Generated 2026-09-20_