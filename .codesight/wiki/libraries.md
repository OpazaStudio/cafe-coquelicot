# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**37 library files** across 27 modules

## Mondial-relay (5 files)

- `lib/mondial-relay/types.ts` — MondialRelayError, MondialRelayClient, RelayShipmentInput, RelayShipmentResult, SenderAddress, MondialRelayConfig
- `lib/mondial-relay/client.ts` — createMondialRelayClient, getMondialRelayClient
- `lib/mondial-relay/config.ts` — getMondialRelayConfig, DEFAULT_PARCEL_WEIGHT_GR
- `lib/mondial-relay/xml.ts` — buildShipmentXml, parseShipmentResponse
- `lib/mondial-relay/ensure-shipment.ts` — ensureRelayShipment

## Db (3 files)

- `lib/db/admin-users.ts` — normalizeEmail, findAdminByEmail, findAdminById, setAdminPassword, seedAdminUser, MIN_PASSWORD_LENGTH
- `lib/db/client.ts` — seedIfEmpty, seedMissingProducts, getDb, Db, Tx
- `lib/db/seed-data.ts` — buildChildSeedRows, SEED_PRODUCTS, HOME_PICKS

## Email (3 files)

- `lib/email/contact.ts` — parseContactForm, buildShopEmail, buildAckEmail, ContactInput, ContactParse, EmailContent, …
- `lib/email/templates.ts` — escapeHtml, headerSafe, fillText, fillHtml, paragraphsHtml, EmailTemplates, …
- `lib/email/resend.ts` — getMailer, ContactMailer

## Analytics (2 files)

- `lib/analytics/gtag.ts` — toGaItem, trackAddToCart, trackBeginCheckout, trackPurchase, GaItem, GA_MEASUREMENT_ID, …
- `lib/analytics/consent.ts` — readConsent, applyConsent, saveConsent, ConsentChoice, CONSENT_STORAGE_KEY, CONSENT_REOPEN_EVENT

## Auth (2 files)

- `lib/auth/dal.ts` — verifySession, checkCredentials, createSession, destroySession, getSession, getCurrentUser
- `lib/auth/session.ts` — encryptSession, decryptSession, SessionPayload, Session, SESSION_COOKIE, SESSION_DURATION_MS

## Bg-tweak (1 files)

- `lib/bg-tweak/state.ts` — isHex, isBgName, isSectionKey, decodeState, encodeState, contrastRatio, …

## Cart (1 files)

- `lib/cart/cart.ts` — cartItemKey, addItem, removeItem, setQty, cartCount, cartSubtotalCents, …

## Content (1 files)

- `lib/content/template.ts` — fillTemplate

## Item-label.ts (1 files)

- `lib/item-label.ts` — composeItemName

## Money.ts (1 files)

- `lib/money.ts` — formatEuros, formatFromPrice, parsePriceToCents

## Order-status.ts (1 files)

- `lib/order-status.ts` — parseFeeInput, formatFeeInput, shippingFeeFor, isShippingCountry, statusTransitions, canTransition, …

## Orders.ts (1 files)

- `lib/orders.ts` — generateOrderNumber, createPendingOrder, attachStripeSession, markOrderPaidBySession, cancelOrderBySession, getOrderBySessionId, …

## Prep-status.ts (1 files)

- `lib/prep-status.ts` — isPrepStatus, derivePrepStatus, isOnBoard, PREP_ORDER, PREP_LABELS, DONE_RETENTION_MS, …

## Product-image.ts (1 files)

- `lib/product-image.ts` — productImageUrl, validateImageFile, sniffImageType, AllowedImageType, ImageValidation, BUCKET, …

## Products.ts (1 files)

- `lib/products.ts` — queryActiveProducts, queryActiveVases, queryProductBySlug, getAllProductRows, getProductRow, getProductWithVariants, …

## Proxy.ts (1 files)

- `proxy.ts` — proxy, config

## Rate-limit.ts (1 files)

- `lib/rate-limit.ts` — createRateLimiter, RateLimitResult, RateLimiter, LOGIN_ATTEMPT_LIMIT, CONTACT_MESSAGE_LIMIT, loginLimiter, …

## Request-ip.ts (1 files)

- `lib/request-ip.ts` — getRequestIp

## Security-headers.ts (1 files)

- `lib/security-headers.ts` — securityHeaders, HttpHeader

## Seo.ts (1 files)

- `lib/seo.ts` — buildRobots, buildSitemap, jsonLdString, productJsonLd, localBusinessJsonLd, SitemapProduct, …

## Settings-fields.ts (1 files)

- `lib/settings-fields.ts` — fieldMaxLength, fieldsForGroups, keysForGroups, readSettingsForm, emailTemplatesFromSettings, shippingFeesFromSettings, …

## Settings.ts (1 files)

- `lib/settings.ts` — querySettings, saveSettings, getSettings

## Slug.ts (1 files)

- `lib/slug.ts` — slugify

## Stats.ts (1 files)

- `lib/stats.ts` — getKpis, getRevenueByDay, getTopProducts, getRecentOrders, Kpis, DayPoint, …

## Storage.ts (1 files)

- `lib/storage.ts` — storageConfigured, uploadImage, deleteImage

## Stripe.ts (1 files)

- `lib/stripe.ts` — getStripe, getSiteUrl

## Uuid.ts (1 files)

- `lib/uuid.ts` — isUuid

---
_Back to [overview.md](./overview.md)_