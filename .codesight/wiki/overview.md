# cafe-coquelicot — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**cafe-coquelicot** is a typescript project built with next-app, using drizzle for data persistence.

## Scale

2 API routes · 5 database models · 68 UI components · 24 library files · 25 environment variables

## Subsystems

- **[Payments](./payments.md)** — 1 routes — touches: auth, payment
- **[Route](./route.md)** — 1 routes — touches: db

**Database:** drizzle, 5 models — see [database.md](./database.md)

**UI:** 68 components (react) — see [ui.md](./ui.md)

**Libraries:** 24 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `app/(admin)/admin/(panel)/ui.tsx` — imported by **11** files
- `tests/e2e/helpers.ts` — imported by **8** files
- `components/illustrations.tsx` — imported by **6** files
- `lib/db/schema.ts` — imported by **6** files
- `tests/helpers/db.ts` — imported by **6** files
- `app/(admin)/admin/(panel)/commandes/actions.ts` — imported by **4** files

## Required Environment Variables

- `CI` — `playwright.config.ts`
- `E2E_TEST_HOOKS` — `app/api/e2e/orders/route.ts`
- `NODE_ENV` — `app/contact/actions.ts`
- `PGLITE_DATA_DIR` — `lib/db/client.ts`

---
_Back to [index.md](./index.md) · Generated 2026-07-13_