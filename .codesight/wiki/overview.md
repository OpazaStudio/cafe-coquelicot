# cafe-coquelicot — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**cafe-coquelicot** is a typescript project built with next-app, using drizzle for data persistence.

## Scale

3 API routes · 7 database models · 95 UI components · 36 library files · 6 middleware layers · 29 environment variables

## Subsystems

- **[Payments](./payments.md)** — 1 routes — touches: auth, payment
- **[Admin](./admin.md)** — 1 routes — touches: auth, payment, upload
- **[Route](./route.md)** — 1 routes — touches: auth, db

**Database:** drizzle, 7 models — see [database.md](./database.md)

**UI:** 95 components (react) — see [ui.md](./ui.md)

**Libraries:** 36 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `app/(admin)/admin/(panel)/ui.tsx` — imported by **14** files
- `tests/e2e/helpers.ts` — imported by **11** files
- `tests/helpers/db.ts` — imported by **10** files
- `lib/db/schema.ts` — imported by **7** files
- `components/illustrations.tsx` — imported by **6** files
- `lib/db/client.ts` — imported by **6** files

## Required Environment Variables

- `CI` — `playwright.config.ts`
- `E2E_TEST_HOOKS` — `app/api/e2e/orders/route.ts`
- `NETLIFY` — `app/api/e2e/orders/route.ts`
- `NODE_ENV` — `app/contact/actions.ts`
- `PGLITE_DATA_DIR` — `lib/db/client.ts`
- `RENDER` — `app/api/e2e/orders/route.ts`
- `VERCEL` — `app/api/e2e/orders/route.ts`

---
_Back to [index.md](./index.md) · Generated 2026-09-19_