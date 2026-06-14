# cafe-coquelicot — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**cafe-coquelicot** is a typescript project built with next-app, using drizzle for data persistence.

## Scale

2 API routes · 5 database models · 52 UI components · 15 library files · 16 environment variables

## Subsystems

- **[Payments](./payments.md)** — 1 routes — touches: auth, payment
- **[Route](./route.md)** — 1 routes — touches: db

**Database:** drizzle, 5 models — see [database.md](./database.md)

**UI:** 52 components (react) — see [ui.md](./ui.md)

**Libraries:** 15 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `lib/db/schema.ts` — imported by **6** files
- `tests/e2e/helpers.ts` — imported by **5** files
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` — imported by **4** files
- `app/(admin)/admin/(panel)/produits/actions.ts` — imported by **4** files
- `components/illustrations.tsx` — imported by **4** files
- `lib/db/client.ts` — imported by **4** files

## Required Environment Variables

- `CI` — `playwright.config.ts`
- `E2E_TEST_HOOKS` — `app/api/e2e/orders/route.ts`
- `NODE_ENV` — `lib/auth/dal.ts`
- `PGLITE_DATA_DIR` — `lib/db/client.ts`

---
_Back to [index.md](./index.md) · Generated 2026-06-14_