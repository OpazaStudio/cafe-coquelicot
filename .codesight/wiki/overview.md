# cafe-coquelicot — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**cafe-coquelicot** is a typescript project built with next-app, using drizzle for data persistence.

## Scale

1 API routes · 3 database models · 50 UI components · 13 library files · 15 environment variables

## Subsystems

- **[Payments](./payments.md)** — 1 routes — touches: auth, payment

**Database:** drizzle, 3 models — see [database.md](./database.md)

**UI:** 50 components (react) — see [ui.md](./ui.md)

**Libraries:** 13 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `lib/db/schema.ts` — imported by **6** files
- `app/(admin)/admin/(panel)/produits/actions.ts` — imported by **4** files
- `components/illustrations.tsx` — imported by **4** files
- `lib/db/client.ts` — imported by **4** files
- `tests/e2e/helpers.ts` — imported by **4** files
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` — imported by **3** files

## Required Environment Variables

- `CI` — `playwright.config.ts`
- `NODE_ENV` — `lib/auth/dal.ts`
- `PGLITE_DATA_DIR` — `lib/db/client.ts`

---
_Back to [index.md](./index.md) · Generated 2026-06-11_