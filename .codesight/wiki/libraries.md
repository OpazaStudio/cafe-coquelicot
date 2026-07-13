# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**24 library files** across 16 modules

## Mondial-relay (5 files)

- `lib/mondial-relay/types.ts` — MondialRelayError, MondialRelayClient, RelayShipmentInput, RelayShipmentResult, SenderAddress, MondialRelayConfig
- `lib/mondial-relay/client.ts` — createMondialRelayClient, getMondialRelayClient
- `lib/mondial-relay/config.ts` — getMondialRelayConfig, DEFAULT_PARCEL_WEIGHT_GR
- `lib/mondial-relay/xml.ts` — buildShipmentXml, parseShipmentResponse
- `lib/mondial-relay/ensure-shipment.ts` — ensureRelayShipment

## Analytics (2 files)

- `lib/analytics/gtag.ts` — toGaItem, trackAddToCart, trackBeginCheckout, trackPurchase, GaItem, GA_MEASUREMENT_ID, …
- `lib/analytics/consent.ts` — readConsent, applyConsent, saveConsent, ConsentChoice, CONSENT_STORAGE_KEY, CONSENT_REOPEN_EVENT

## Auth (2 files)

- `lib/auth/dal.ts` — verifySession, checkCredentials, createSession, destroySession, getSession
- `lib/auth/session.ts` — encryptSession, decryptSession, SessionPayload, SESSION_COOKIE, SESSION_DURATION_MS

## Db (2 files)

- `lib/db/client.ts` — seedIfEmpty, seedMissingProducts, getDb, Db
- `lib/db/seed-data.ts` — buildChildSeedRows, SEED_PRODUCTS, HOME_PICKS

## Email (2 files)

- `lib/email/contact.ts` — parseContactForm, escapeHtml, buildShopEmail, buildAckEmail, ContactInput, ContactParse, …
- `lib/email/resend.ts` — getMailer, ContactMailer

## Cart (1 files)

- `lib/cart/cart.ts` — cartItemKey, addItem, removeItem, setQty, cartCount, cartSubtotalCents, …

## Item-label.ts (1 files)

- `lib/item-label.ts` — composeItemName

## Money.ts (1 files)

- `lib/money.ts` — formatEuros, formatFromPrice, parsePriceToCents

## Order-status.ts (1 files)

- `lib/order-status.ts` — isShippingCountry, statusTransitions, canTransition, ShippingCountryCode, MONDIAL_RELAY_FEE_CENTS, CARD_FEE_CENTS, …

## Orders.ts (1 files)

- `lib/orders.ts` — generateOrderNumber, createPendingOrder, attachStripeSession, markOrderPaidBySession, cancelOrderBySession, getOrderBySessionId, …

## Prep-status.ts (1 files)

- `lib/prep-status.ts` — isPrepStatus, derivePrepStatus, isOnBoard, PREP_ORDER, PREP_LABELS, DONE_RETENTION_MS, …

## Products.ts (1 files)

- `lib/products.ts` — queryActiveProducts, queryActiveVases, queryProductBySlug, getAllProductRows, getProductRow, getProductWithVariants, …

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