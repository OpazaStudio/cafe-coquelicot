# Dependency Graph

## Most Imported Files (change these carefully)

- `app/(admin)/admin/(panel)/ui.tsx` — imported by **11** files
- `tests/e2e/helpers.ts` — imported by **8** files
- `components/illustrations.tsx` — imported by **6** files
- `lib/db/schema.ts` — imported by **6** files
- `tests/helpers/db.ts` — imported by **6** files
- `app/(admin)/admin/(panel)/commandes/actions.ts` — imported by **4** files
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` — imported by **4** files
- `app/(admin)/admin/(panel)/produits/actions.ts` — imported by **4** files
- `lib/db/client.ts` — imported by **4** files
- `lib/mondial-relay/types.ts` — imported by **3** files
- `app/(admin)/admin/login/actions.ts` — imported by **2** files
- `app/(admin)/admin/(panel)/produits/product-form.tsx` — imported by **2** files
- `lib/db/seed-data.ts` — imported by **2** files
- `lib/mondial-relay/config.ts` — imported by **2** files
- `app/(admin)/admin/(panel)/admin-nav.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/commandes/kanban-board.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/commandes/orders-table.tsx` — imported by **1** files

## Import Map (who imports what)

- `app/(admin)/admin/(panel)/ui.tsx` ← `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`, `app/(admin)/admin/(panel)/commandes/orders-table.tsx` +6 more
- `tests/e2e/helpers.ts` ← `tests/e2e/02-cart.spec.ts`, `tests/e2e/03-admin-auth.spec.ts`, `tests/e2e/04-admin-products.spec.ts`, `tests/e2e/05-checkout.spec.ts`, `tests/e2e/06-admin-kanban.spec.ts` +3 more
- `components/illustrations.tsx` ← `components/boutique.tsx`, `components/cart-view.tsx`, `components/checkout-form.tsx`, `components/contact-form.tsx`, `components/product-detail.tsx` +1 more
- `lib/db/schema.ts` ← `lib/categories.ts`, `lib/db/client.ts`, `lib/db/seed-data.ts`, `lib/order-status.ts`, `lib/prep-status.ts` +1 more
- `tests/helpers/db.ts` ← `tests/unit/ensure-relay-shipment.test.ts`, `tests/unit/orders.test.ts`, `tests/unit/products.test.ts`, `tests/unit/schema-relay.test.ts`, `tests/unit/seed-missing.test.ts` +1 more
- `app/(admin)/admin/(panel)/commandes/actions.ts` ← `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`, `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` ← `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`, `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`, `app/(admin)/admin/(panel)/commandes/orders-table.tsx`, `app/(admin)/admin/(panel)/page.tsx`
- `app/(admin)/admin/(panel)/produits/actions.ts` ← `app/(admin)/admin/(panel)/produits/[id]/page.tsx`, `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`, `app/(admin)/admin/(panel)/produits/page.tsx`, `app/(admin)/admin/(panel)/produits/product-form.tsx`
- `lib/db/client.ts` ← `lib/orders.ts`, `lib/products.ts`, `lib/stats.ts`, `scripts/seed.ts`
- `lib/mondial-relay/types.ts` ← `lib/mondial-relay/client.ts`, `lib/mondial-relay/config.ts`, `lib/mondial-relay/ensure-shipment.ts`
