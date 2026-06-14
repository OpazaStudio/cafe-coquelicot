# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**14 library files** across 12 modules

## Auth (2 files)

- `lib/auth/dal.ts` — verifySession, checkCredentials, createSession, destroySession, getSession
- `lib/auth/session.ts` — encryptSession, decryptSession, SessionPayload, SESSION_COOKIE, SESSION_DURATION_MS

## Db (2 files)

- `lib/db/client.ts` — seedIfEmpty, getDb, Db
- `lib/db/seed-data.ts` — buildChildSeedRows, SEED_PRODUCTS, HOME_PICKS

## Cart (1 files)

- `lib/cart/cart.ts` — addItem, removeItem, setQty, cartCount, cartSubtotalCents, sanitizeCart, …

## Money.ts (1 files)

- `lib/money.ts` — formatEuros, formatFromPrice, parsePriceToCents

## Order-status.ts (1 files)

- `lib/order-status.ts` — isShippingCountry, statusTransitions, canTransition, ShippingCountryCode, SHIPPING_FEE_CENTS, SHIPPING_COUNTRY_CODES, …

## Orders.ts (1 files)

- `lib/orders.ts` — generateOrderNumber, createPendingOrder, attachStripeSession, markOrderPaidBySession, cancelOrderBySession, getOrderBySessionId, …

## Prep-status.ts (1 files)

- `lib/prep-status.ts` — isPrepStatus, derivePrepStatus, isOnBoard, PREP_ORDER, PREP_LABELS, DONE_RETENTION_MS, …

## Products.ts (1 files)

- `lib/products.ts` — toShopProduct, getAllProductRows, getProductRow, ShopProduct, getActiveProducts, getHomeProducts, …

## Proxy.ts (1 files)

- `proxy.ts` — proxy, config

## Slug.ts (1 files)

- `lib/slug.ts` — slugify

## Stats.ts (1 files)

- `lib/stats.ts` — getKpis, getRevenueByDay, getTopProducts, getRecentOrders, Kpis, DayPoint, …

## Stripe.ts (1 files)

- `lib/stripe.ts` — getStripe, getSiteUrl

---
_Back to [overview.md](./overview.md)_