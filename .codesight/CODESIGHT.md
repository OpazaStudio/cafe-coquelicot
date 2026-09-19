# cafe-coquelicot — AI Context Map

> **Stack:** next-app | drizzle | react | typescript

> 3 routes | 7 models | 95 components | 36 lib files | 29 env vars | 6 middleware | 50% test coverage
> **Token savings:** this file is ~6,900 tokens. Without it, AI exploration would cost ~59,000 tokens. **Saves ~52,100 tokens per conversation.**
> **Last scanned:** 2026-09-19 17:17 — re-run after significant changes

---

# Routes

- `POST` `/api/admin/product-image` → out: { error } [auth, payment, upload]
- `POST` `/api/e2e/orders` → out: { error } [auth, db] ✓
- `POST` `/api/stripe/webhook` [auth, payment]

---

# Schema

### products
- id: uuid (pk)
- slug: text (unique, required)
- name: text (required)
- tag: text (required)
- description: text (required)
- priceCents: integer (required)
- category: productCategory (required)
- badge: text
- illustrationVariant: integer (default, required)
- imagePath: text
- imageBgColor: text
- active: boolean (default, required)

### product_sizes
- id: uuid (pk)
- productId: uuid (fk, required)
- label: text (required)
- priceCents: integer (required)
- sortOrder: integer (default, required)
- active: boolean (default, required)
- _relations_: productId -> products.id

### product_colors
- id: uuid (pk)
- productId: uuid (fk, required)
- label: text (required)
- illustrationVariant: integer (default, required)
- imagePath: text
- imageBgColor: text
- sortOrder: integer (default, required)
- active: boolean (default, required)
- _relations_: productId -> products.id

### orders
- id: uuid (pk)
- number: text (unique, required)
- status: orderStatus (default, required)
- customerName: text (required)
- customerEmail: text (required)
- customerPhone: text
- fulfillment: fulfillmentEnum (required)
- shippingAddress: text
- shippingPostalCode: text
- shippingCity: text
- shippingCountry: text
- relayPointId: text (fk)
- relayPointName: text
- relayShipmentNumber: text
- relayLabelUrl: text
- trackingNumber: text
- prepStatus: prepStatusEnum (default, required)
- prepDoneAt: timestamp
- deliveryDate: date
- cardMessage: text
- subtotalCents: integer (required)
- deliveryFeeCents: integer (default, required)
- cardFeeCents: integer (default, required)
- totalCents: integer (required)
- stripeSessionId: text (unique, fk)
- stripePaymentIntent: text

### order_items
- id: uuid (pk)
- orderId: uuid (fk, required)
- productId: uuid (fk)
- nameSnapshot: text (required)
- priceCentsSnapshot: integer (required)
- qty: integer (required)
- preparedQty: integer (default, required)
- sizeId: uuid (fk)
- colorId: uuid (fk)
- sizeLabelSnapshot: text
- colorLabelSnapshot: text
- _relations_: orderId -> orders.id, productId -> products.id, sizeId -> productSizes.id, colorId -> productColors.id

### admin_users
- id: uuid (pk)
- email: text (unique, required)
- passwordHash: text (required)
- passwordChangedAt: timestamp (default, required)

### settings
- key: text (pk)
- value: text (default, required)

---

# Components

- **AdminNav** [client] — `app/(admin)/admin/(panel)/admin-nav.tsx`
- **AdminSidebar** [client] — `app/(admin)/admin/(panel)/admin-sidebar.tsx`
- **LabelButton** [client] — props: orderId, hasLabel — `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`
- **CommandeDetailPage** — props: params — `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`
- **StatusActions** [client] — props: orderId, status, fulfillment — `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`
- **TrackingForm** [client] — props: orderId, trackingNumber, fulfillment — `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`
- **KanbanBoard** [client] — props: orders — `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`
- **CommandesLoading** — `app/(admin)/admin/(panel)/commandes/loading.tsx`
- **OrdersTable** — props: orders — `app/(admin)/admin/(panel)/commandes/orders-table.tsx`
- **CommandesPage** — props: searchParams — `app/(admin)/admin/(panel)/commandes/page.tsx`
- **StatusBadge** — props: status — `app/(admin)/admin/(panel)/commandes/status-badge.tsx`
- **ComptePage** — `app/(admin)/admin/(panel)/compte/page.tsx`
- **PasswordForm** [client] — `app/(admin)/admin/(panel)/compte/password-form.tsx`
- **EmailsPage** — `app/(admin)/admin/(panel)/emails/page.tsx`
- **AdminLayout** — `app/(admin)/admin/(panel)/layout.tsx`
- **AdminDashboardPage** — `app/(admin)/admin/(panel)/page.tsx`
- **ParametresPage** — `app/(admin)/admin/(panel)/parametres/page.tsx`
- **EditProduitPage** — props: params — `app/(admin)/admin/(panel)/produits/[id]/page.tsx`
- **ImageUpload** [client] — props: value, bgColor, onChange, fallback, label, size — `app/(admin)/admin/(panel)/produits/image-upload.tsx`
- **NouveauProduitPage** — `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`
- **ProduitsPage** — `app/(admin)/admin/(panel)/produits/page.tsx`
- **ProductForm** [client] — props: action, product, initialSizes, initialColors, submitLabel — `app/(admin)/admin/(panel)/produits/product-form.tsx`
- **RevenueChartImpl** [client] — props: points — `app/(admin)/admin/(panel)/revenue-chart-impl.tsx`
- **RevenueChart** [client] — props: data — `app/(admin)/admin/(panel)/revenue-chart.tsx`
- **SettingsForm** [client] — props: initial, groups, submit, savedLabel — `app/(admin)/admin/(panel)/settings-form.tsx`
- **Panel** — props: title, className — `app/(admin)/admin/(panel)/ui.tsx`
- **Pill** — props: tone — `app/(admin)/admin/(panel)/ui.tsx`
- **LoginForm** [client] — `app/(admin)/admin/login/login-form.tsx`
- **LoginPage** — `app/(admin)/admin/login/page.tsx`
- **ProduitPage** — props: params — `app/boutique/[slug]/page.tsx`
- **BoutiquePage** — `app/boutique/page.tsx`
- **Page** — `app/cgv/page.tsx`
- **CheckoutPage** — `app/checkout/page.tsx`
- **ConfirmationPage** — props: searchParams — `app/commande/confirmee/page.tsx`
- **Page** — `app/confidentialite/page.tsx`
- **RootLayout** — `app/layout.tsx`
- **Page** — `app/livraison-retours/page.tsx`
- **Page** — `app/mentions-legales/page.tsx`
- **OpengraphImage** — `app/opengraph-image.tsx`
- **Home** — `app/page.tsx`
- **PanierPage** — `app/panier/page.tsx`
- **BgTweakGate** [client] — `components/bg-tweak/gate.tsx`
- **BgTweakPanel** [client] — `components/bg-tweak/panel.tsx`
- **BoutiqueShop** [client] — props: catalogue — `components/boutique.tsx`
- **CartLink** [client] — `components/cart-link.tsx`
- **CartView** [client] — `components/cart-view.tsx`
- **CheckoutForm** [client] — props: fees — `components/checkout-form.tsx`
- **ClearCart** [client] — `components/clear-cart.tsx`
- **ConsentDefaultScript** — `components/consent/consent-default-script.tsx`
- **CookieBanner** [client] — `components/consent/cookie-banner.tsx`
- **ManageCookiesButton** [client] — `components/consent/manage-cookies-button.tsx`
- **ContactForm** [client] — `components/contact-form.tsx`
- **Effects** [client] — `components/effects.tsx`
- **HeroStorefront** — props: className — `components/illustrations.tsx`
- **Bouquet** — props: variant, className — `components/illustrations.tsx`
- **Vase** — props: variant, className — `components/illustrations.tsx`
- **ProductFigure** — props: category, variant, imagePath, imageBgColor, alt, className, sizes — `components/illustrations.tsx`
- **IconWedding** — props: className — `components/illustrations.tsx`
- **IconEvent** — props: className — `components/illustrations.tsx`
- **IconSubscription** — props: className — `components/illustrations.tsx`
- **IconWorkshop** — props: className — `components/illustrations.tsx`
- **IconCorporate** — props: className — `components/illustrations.tsx`
- **IconDelivery** — props: className — `components/illustrations.tsx`
- **MapDoodle** — props: className — `components/illustrations.tsx`
- **ArrowRight** — props: size — `components/illustrations.tsx`
- **ArrowDiag** — props: size — `components/illustrations.tsx`
- **AboutFlorist** — props: className — `components/illustrations.tsx`
- **JsonLd** — props: data — `components/json-ld.tsx`
- **CgvContent** — props: settings — `components/legal/cgv.tsx`
- **ConfidentialiteContent** — props: settings — `components/legal/confidentialite.tsx`
- **LegalPage** — props: crumb, title, script — `components/legal/legal-page.tsx`
- **LegalNav** — props: current — `components/legal/legal-page.tsx`
- **ShopName** — props: settings — `components/legal/legal-page.tsx`
- **ShopAddress** — props: settings — `components/legal/legal-page.tsx`
- **ShopEmail** — props: settings — `components/legal/legal-page.tsx`
- **ShopPhone** — props: settings — `components/legal/legal-page.tsx`
- **Mediator** — props: settings — `components/legal/legal-page.tsx`
- **LegalValue** — props: value, label — `components/legal/legal-value.tsx`
- **LivraisonRetoursContent** — props: settings — `components/legal/livraison-retours.tsx`
- **MentionsLegalesContent** — props: settings — `components/legal/mentions-legales.tsx`
- **Logo** — props: className — `components/logo.tsx`
- **ProductDetail** [client] — props: product — `components/product-detail.tsx`
- **PurchaseTracking** [client] — props: transactionId, valueCents, shippingCents, items — `components/purchase-tracking.tsx`
- **RelayPicker** [client] — props: value, onSelect — `components/relay-picker.tsx`
- **SiteHeader** — `components/sections.tsx`
- **Hero** — props: bg — `components/sections.tsx`
- **Shop** — props: bg, products — `components/sections.tsx`
- **Gallery** — props: bg — `components/sections.tsx`
- **Prestations** — props: bg — `components/sections.tsx`
- **AtelierStrip** — props: bg — `components/sections.tsx`
- **About** — props: bg — `components/sections.tsx`
- **Contact** — props: bg — `components/sections.tsx`
- **SiteFooter** — `components/sections.tsx`
- **VaseSuggestions** [client] — props: vases — `components/vase-suggestions.tsx`
- **CartProvider** [client] — `lib/cart/cart-context.tsx`

---

# Libraries

- `lib/analytics/consent.ts`
  - function readConsent: () => ConsentChoice | null
  - function applyConsent: (choice) => void
  - function saveConsent: (choice) => void
  - type ConsentChoice
  - const CONSENT_STORAGE_KEY
  - const CONSENT_REOPEN_EVENT
- `lib/analytics/gtag.ts`
  - function toGaItem: (i) => GaItem
  - function trackAddToCart: (item) => void
  - function trackBeginCheckout: (items, totalCents) => void
  - function trackPurchase: (purchase) => void
  - type GaItem
  - const GA_MEASUREMENT_ID
  - _...1 more_
- `lib/auth/dal.ts`
  - function verifySession: () => Promise<AdminUserRow>
  - function checkCredentials: (email, password) => Promise<AdminUserRow | null>
  - function createSession: (userId) => Promise<void>
  - function destroySession: () => Promise<void>
  - const getSession
  - const getCurrentUser
- `lib/auth/session.ts`
  - function encryptSession: (payload, expiresAt, issuedAt) => void
  - function decryptSession: (token) => Promise<Session | null>
  - type SessionPayload
  - type Session
  - const SESSION_COOKIE
  - const SESSION_DURATION_MS
- `lib/bg-tweak/state.ts`
  - function isHex: (value) => value is string
  - function isBgName: (value) => value is BgName
  - function isSectionKey: (value) => value is string
  - function decodeState: (source) => TweakState
  - function encodeState: (state) => URLSearchParams
  - function contrastRatio: (a, b) => number
  - _...7 more_
- `lib/cart/cart.ts`
  - function cartItemKey: (slug, sizeId?, colorId?) => string
  - function addItem: (cart, item, qty) => Cart
  - function removeItem: (cart, key) => Cart
  - function setQty: (cart, key, qty) => Cart
  - function cartCount: (cart) => number
  - function cartSubtotalCents: (cart) => number
  - _...5 more_
- `lib/db/admin-users.ts`
  - function normalizeEmail: (email) => string
  - function findAdminByEmail: (db, email) => Promise<AdminUserRow | undefined>
  - function findAdminById: (db, id) => Promise<AdminUserRow | undefined>
  - function setAdminPassword: (db, email, password) => Promise<"created" | "updated">
  - function seedAdminUser: (db) => Promise<boolean>
  - const MIN_PASSWORD_LENGTH
- `lib/db/client.ts`
  - function seedIfEmpty: (db) => Promise<boolean>
  - function seedMissingProducts: (db) => Promise<string[]>
  - function getDb: () => Promise<Db>
  - type Db
  - type Tx
- `lib/db/seed-data.ts`
  - function buildChildSeedRows: (idBySlug, string>) => void
  - const SEED_PRODUCTS: NewProductRow[]
  - const HOME_PICKS
- `lib/email/contact.ts`
  - function parseContactForm: (formData) => ContactParse
  - function buildShopEmail: (input, templates) => EmailContent
  - function buildAckEmail: (name, templates) => EmailContent
  - type ContactInput
  - type ContactParse
  - type EmailContent
  - _...2 more_
- `lib/email/resend.ts` — function getMailer: () => ContactMailer | null, type ContactMailer
- `lib/email/templates.ts`
  - function escapeHtml: (value) => string
  - function headerSafe: (value) => string
  - function fillText: (template, name) => string
  - function fillHtml: (template, name) => string
  - function paragraphsHtml: (template, name, style) => string
  - type EmailTemplates
  - _...2 more_
- `lib/item-label.ts` — function composeItemName: (name, sizeLabel?, colorLabel?) => string
- `lib/mondial-relay/client.ts` — function createMondialRelayClient: (config, fetchImpl) => MondialRelayClient, function getMondialRelayClient: () => MondialRelayClient | null
- `lib/mondial-relay/config.ts` — function getMondialRelayConfig: () => MondialRelayConfig | null, const DEFAULT_PARCEL_WEIGHT_GR
- `lib/mondial-relay/ensure-shipment.ts` — function ensureRelayShipment: (db, orderId, client) => void
- `lib/mondial-relay/types.ts`
  - class MondialRelayError
  - interface MondialRelayClient
  - type RelayShipmentInput
  - type RelayShipmentResult
  - type SenderAddress
  - type MondialRelayConfig
- `lib/mondial-relay/xml.ts` — function buildShipmentXml: (input, config) => string, function parseShipmentResponse: (xml) => RelayShipmentResult
- `lib/money.ts`
  - function formatEuros: (cents) => string
  - function formatFromPrice: (cents) => string
  - function parsePriceToCents: (price) => number
- `lib/order-status.ts`
  - function parseFeeInput: (raw) => number | null
  - function formatFeeInput: (cents) => string
  - function shippingFeeFor: (fulfillment, fees) => number
  - function isShippingCountry: (code) => code is ShippingCountryCode
  - function statusTransitions: (from, fulfillment) => OrderStatus[]
  - function canTransition: (from, to, fulfillment) => boolean
  - _...11 more_
- `lib/orders.ts`
  - function generateOrderNumber: (now) => void
  - function createPendingOrder: (db, customer, items, fees) => Promise<
  - function attachStripeSession: (db, orderId, stripeSessionId) => Promise<void>
  - function markOrderPaidBySession: (db, stripeSessionId, stripePaymentIntent?, fallbackOrderId?) => Promise<OrderRow | null>
  - function cancelOrderBySession: (db, stripeSessionId) => Promise<void>
  - function getOrderBySessionId: (db, stripeSessionId) => Promise<
  - _...11 more_
- `lib/prep-status.ts`
  - function isPrepStatus: (value) => value is PrepStatus
  - function derivePrepStatus: (preparedTotal, totalQty) => Extract<PrepStatus, "todo" | "in_progress" | "ready">
  - function isOnBoard: (order, now) => boolean
  - const PREP_ORDER
  - const PREP_LABELS: Record<PrepStatus, string>
  - const DONE_RETENTION_MS
  - _...1 more_
- `lib/product-image.ts`
  - function productImageUrl: (path) => string
  - function validateImageFile: (file) => ImageValidation
  - function sniffImageType: (bytes) => AllowedImageType | null
  - type AllowedImageType
  - type ImageValidation
  - const BUCKET
  - _...2 more_
- `lib/products.ts`
  - function queryActiveProducts: (db) => Promise<ShopProduct[]>
  - function queryActiveVases: (db) => Promise<ShopProduct[]>
  - function queryProductBySlug: (db, slug) => Promise<ShopProduct | null>
  - function getAllProductRows: () => Promise<ProductRow[]>
  - function getProductRow: (id) => Promise<ProductRow | null>
  - function getProductWithVariants: (db, id) => Promise<
  - _...10 more_
- `lib/rate-limit.ts`
  - function createRateLimiter: ({...}, windowMs, }) => RateLimiter
  - type RateLimitResult
  - type RateLimiter
  - const LOGIN_ATTEMPT_LIMIT
  - const CONTACT_MESSAGE_LIMIT
  - const loginLimiter: RateLimiter
  - _...1 more_
- `lib/request-ip.ts` — function getRequestIp: () => Promise<string>
- `lib/security-headers.ts` — function securityHeaders: (isProduction) => HttpHeader[], type HttpHeader
- `lib/seo.ts`
  - function buildRobots: (siteUrl) => MetadataRoute.Robots
  - function buildSitemap: (siteUrl, products) => MetadataRoute.Sitemap
  - function jsonLdString: (data) => string
  - function productJsonLd: (input) => JsonLd
  - function localBusinessJsonLd: (siteUrl, s) => JsonLd
  - type SitemapProduct
  - _...5 more_
- `lib/settings-fields.ts`
  - function fieldMaxLength: (field) => number
  - function fieldsForGroups: (groups) => SettingField[]
  - function keysForGroups: (groups) => SettingKey[]
  - function readSettingsForm: (formData, keys) => SettingsFormResult
  - function emailTemplatesFromSettings: (values) => EmailTemplates
  - function shippingFeesFromSettings: (values) => ShippingFees
  - _...13 more_
- `lib/settings.ts`
  - function querySettings: (db) => Promise<Settings>
  - function saveSettings: (db, values) => Promise<void>
  - const getSettings
- `lib/slug.ts` — function slugify: (input) => string
- `lib/stats.ts`
  - function getKpis: (db) => Promise<Kpis>
  - function getRevenueByDay: (db, days) => Promise<DayPoint[]>
  - function getTopProducts: (db, limit) => Promise<TopProduct[]>
  - function getRecentOrders: (db, limit) => void
  - type Kpis
  - type DayPoint
  - _...2 more_
- `lib/storage.ts`
  - function storageConfigured: () => boolean
  - function uploadImage: (file) => Promise<
  - function deleteImage: (path) => Promise<void>
- `lib/stripe.ts` — function getStripe: () => Stripe, function getSiteUrl: () => string
- `lib/uuid.ts` — function isUuid: (value) => value is string
- `proxy.ts` — function proxy: (request) => void, const config

---

# Config

## Environment Variables

- `ADMIN_EMAIL` (has default) — .env.local
- `ADMIN_PASSWORD` (has default) — .env.local
- `ADMIN_PASSWORD_HASH` (has default) — .env.local
- `CI` **required** — playwright.config.ts
- `CONTACT_FROM` (has default) — .env.local
- `CONTACT_TO` (has default) — .env.local
- `DATABASE_URL` (has default) — .env.local
- `E2E_TEST_HOOKS` **required** — app/api/e2e/orders/route.ts
- `MONDIAL_RELAY_API_LOGIN` (has default) — .env.local
- `MONDIAL_RELAY_API_PASSWORD` (has default) — .env.local
- `MONDIAL_RELAY_API_URL` (has default) — .env.local
- `MONDIAL_RELAY_CUSTOMER_ID` (has default) — .env.local
- `NETLIFY` **required** — app/api/e2e/orders/route.ts
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (has default) — .env.local
- `NEXT_PUBLIC_MONDIAL_RELAY_BRAND` (has default) — .env.local
- `NEXT_PUBLIC_SITE_URL` (has default) — .env.local
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (has default) — .env.local
- `NEXT_PUBLIC_SUPABASE_URL` (has default) — .env.local
- `NODE_ENV` **required** — app/contact/actions.ts
- `PGLITE_DATA_DIR` **required** — lib/db/client.ts
- `RENDER` **required** — app/api/e2e/orders/route.ts
- `RESEND_API_KEY` (has default) — .env.local
- `SESSION_SECRET` (has default) — .env.local
- `STRIPE_PUBLIC_KEY` (has default) — .env.local
- `STRIPE_RESTRICTED_KEY` (has default) — .env.local
- `STRIPE_SECRET_KEY` (has default) — .env.local
- `STRIPE_WEBHOOK_SECRET` (has default) — .env.local
- `SUPABASE_SECRET_KEY` (has default) — .env.local
- `VERCEL` **required** — app/api/e2e/orders/route.ts

## Config Files

- `.env.example`
- `drizzle.config.ts`
- `next.config.ts`
- `tsconfig.json`

## Key Dependencies

- @supabase/supabase-js: ^2.110.3
- drizzle-orm: ^0.45.2
- next: 16.2.9
- react: 19.2.4
- resend: ^6.16.0
- stripe: ^22.2.0
- zod: ^4.4.3

---

# Middleware

## rate-limit
- rate-limit — `lib/rate-limit.ts`
- contact-rate-limit.test — `tests/unit/contact-rate-limit.test.ts`
- login-rate-limit.test — `tests/unit/login-rate-limit.test.ts`
- rate-limit.test — `tests/unit/rate-limit.test.ts`

## auth
- auth-dal.test — `tests/unit/auth-dal.test.ts`
- e2e-hooks-guard.test — `tests/unit/e2e-hooks-guard.test.ts`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `app/(admin)/admin/(panel)/ui.tsx` — imported by **14** files
- `tests/e2e/helpers.ts` — imported by **11** files
- `tests/helpers/db.ts` — imported by **10** files
- `lib/db/schema.ts` — imported by **7** files
- `components/illustrations.tsx` — imported by **6** files
- `lib/db/client.ts` — imported by **6** files
- `app/(admin)/admin/(panel)/commandes/actions.ts` — imported by **4** files
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` — imported by **4** files
- `app/(admin)/admin/(panel)/settings-form.tsx` — imported by **4** files
- `app/(admin)/admin/(panel)/produits/actions.ts` — imported by **4** files
- `components/legal/legal-value.tsx` — imported by **4** files
- `components/legal/legal-page.tsx` — imported by **4** files
- `lib/uuid.ts` — imported by **3** files
- `lib/mondial-relay/types.ts` — imported by **3** files
- `app/(admin)/admin/login/actions.ts` — imported by **2** files
- `app/(admin)/admin/(panel)/produits/product-form.tsx` — imported by **2** files
- `lib/db/seed-data.ts` — imported by **2** files
- `lib/db/admin-users.ts` — imported by **2** files
- `lib/mondial-relay/config.ts` — imported by **2** files
- `lib/settings-fields.ts` — imported by **2** files

## Import Map (who imports what)

- `app/(admin)/admin/(panel)/ui.tsx` ← `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`, `app/(admin)/admin/(panel)/commandes/orders-table.tsx` +9 more
- `tests/e2e/helpers.ts` ← `tests/e2e/02-cart.spec.ts`, `tests/e2e/03-admin-auth.spec.ts`, `tests/e2e/04-admin-products.spec.ts`, `tests/e2e/05-checkout.spec.ts`, `tests/e2e/06-admin-kanban.spec.ts` +6 more
- `tests/helpers/db.ts` ← `tests/unit/admin-users.test.ts`, `tests/unit/ensure-relay-shipment.test.ts`, `tests/unit/orders.test.ts`, `tests/unit/product-image-columns.test.ts`, `tests/unit/products.test.ts` +5 more
- `lib/db/schema.ts` ← `lib/categories.ts`, `lib/db/admin-users.ts`, `lib/db/client.ts`, `lib/db/seed-data.ts`, `lib/order-status.ts` +2 more
- `components/illustrations.tsx` ← `components/boutique.tsx`, `components/cart-view.tsx`, `components/checkout-form.tsx`, `components/contact-form.tsx`, `components/product-detail.tsx` +1 more
- `lib/db/client.ts` ← `lib/db/admin-users.ts`, `lib/orders.ts`, `lib/products.ts`, `lib/stats.ts`, `scripts/admin-set-password.ts` +1 more
- `app/(admin)/admin/(panel)/commandes/actions.ts` ← `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`, `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` ← `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`, `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`, `app/(admin)/admin/(panel)/commandes/orders-table.tsx`, `app/(admin)/admin/(panel)/page.tsx`
- `app/(admin)/admin/(panel)/settings-form.tsx` ← `app/(admin)/admin/(panel)/emails/actions.ts`, `app/(admin)/admin/(panel)/emails/page.tsx`, `app/(admin)/admin/(panel)/parametres/actions.ts`, `app/(admin)/admin/(panel)/parametres/page.tsx`
- `app/(admin)/admin/(panel)/produits/actions.ts` ← `app/(admin)/admin/(panel)/produits/[id]/page.tsx`, `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`, `app/(admin)/admin/(panel)/produits/page.tsx`, `app/(admin)/admin/(panel)/produits/product-form.tsx`

---

# Test Coverage

> **50%** of routes and models are covered by tests
> 62 test files found

## Covered Routes

- POST:/api/e2e/orders

## Covered Models

- products
- orders
- admin_users
- settings

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_