# cafe-coquelicot — AI Context Map

> **Stack:** next-app | drizzle | react | typescript

> 1 routes | 3 models | 50 components | 12 lib files | 15 env vars | 0 middleware | 50% test coverage
> **Token savings:** this file is ~3,300 tokens. Without it, AI exploration would cost ~31,900 tokens. **Saves ~28,600 tokens per conversation.**
> **Last scanned:** 2026-06-11 16:31 — re-run after significant changes

---

# Routes

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
- active: boolean (default, required)

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
- trackingNumber: text
- deliveryDate: date
- cardMessage: text
- subtotalCents: integer (required)
- deliveryFeeCents: integer (default, required)
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
- _relations_: orderId -> orders.id, productId -> products.id

---

# Components

- **AdminNav** [client] — `app/(admin)/admin/(panel)/admin-nav.tsx`
- **CommandeDetailPage** — props: params — `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`
- **StatusActions** [client] — props: orderId, status, fulfillment — `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`
- **TrackingForm** [client] — props: orderId, trackingNumber — `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`
- **CommandesPage** — `app/(admin)/admin/(panel)/commandes/page.tsx`
- **StatusBadge** — props: status — `app/(admin)/admin/(panel)/commandes/status-badge.tsx`
- **AdminLayout** — `app/(admin)/admin/(panel)/layout.tsx`
- **AdminDashboardPage** — `app/(admin)/admin/(panel)/page.tsx`
- **EditProduitPage** — props: params — `app/(admin)/admin/(panel)/produits/[id]/page.tsx`
- **NouveauProduitPage** — `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`
- **ProduitsPage** — `app/(admin)/admin/(panel)/produits/page.tsx`
- **ProductForm** [client] — props: action, product, submitLabel — `app/(admin)/admin/(panel)/produits/product-form.tsx`
- **RevenueChart** [client] — props: data — `app/(admin)/admin/(panel)/revenue-chart.tsx`
- **LoginForm** [client] — `app/(admin)/admin/login/login-form.tsx`
- **LoginPage** — `app/(admin)/admin/login/page.tsx`
- **BoutiquePage** — `app/boutique/page.tsx`
- **CheckoutPage** — `app/checkout/page.tsx`
- **ConfirmationPage** — props: searchParams — `app/commande/confirmee/page.tsx`
- **RootLayout** — `app/layout.tsx`
- **Home** — `app/page.tsx`
- **PanierPage** — `app/panier/page.tsx`
- **BoutiqueShop** [client] — props: catalogue — `components/boutique.tsx`
- **CartLink** [client] — `components/cart-link.tsx`
- **CartView** [client] — `components/cart-view.tsx`
- **CheckoutForm** [client] — `components/checkout-form.tsx`
- **ClearCart** [client] — `components/clear-cart.tsx`
- **Effects** [client] — `components/effects.tsx`
- **HeroStorefront** — props: className — `components/illustrations.tsx`
- **Bouquet** — props: variant, className — `components/illustrations.tsx`
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
- **Newsletter** [client] — `components/newsletter.tsx`
- **SiteHeader** — `components/sections.tsx`
- **Hero** — props: bg — `components/sections.tsx`
- **Shop** — props: bg, products — `components/sections.tsx`
- **Gallery** — props: bg — `components/sections.tsx`
- **Prestations** — props: bg — `components/sections.tsx`
- **AtelierStrip** — props: bg — `components/sections.tsx`
- **About** — props: bg — `components/sections.tsx`
- **Contact** — props: bg — `components/sections.tsx`
- **SiteFooter** — `components/sections.tsx`
- **CartProvider** [client] — `lib/cart/cart-context.tsx`

---

# Libraries

- `lib/auth/dal.ts`
  - function verifySession: () => Promise<SessionPayload>
  - function checkCredentials: (email, password) => Promise<boolean>
  - function createSession: (email) => Promise<void>
  - function destroySession: () => Promise<void>
  - const getSession
- `lib/auth/session.ts`
  - function encryptSession: (payload, expiresAt) => Promise<string>
  - function decryptSession: (token) => Promise<SessionPayload | null>
  - type SessionPayload
  - const SESSION_COOKIE
  - const SESSION_DURATION_MS
- `lib/cart/cart.ts`
  - function addItem: (cart, item, "qty">, qty) => Cart
  - function removeItem: (cart, slug) => Cart
  - function setQty: (cart, slug, qty) => Cart
  - function cartCount: (cart) => number
  - function cartSubtotalCents: (cart) => number
  - function sanitizeCart: (value) => Cart
  - _...3 more_
- `lib/db/client.ts`
  - function seedIfEmpty: (db) => Promise<boolean>
  - function getDb: () => Promise<Db>
  - type Db
- `lib/money.ts`
  - function formatEuros: (cents) => string
  - function formatFromPrice: (cents) => string
  - function parsePriceToCents: (price) => number
- `lib/order-status.ts`
  - function isShippingCountry: (code) => code is ShippingCountryCode
  - function statusTransitions: (from, fulfillment) => OrderStatus[]
  - function canTransition: (from, to, fulfillment) => boolean
  - type ShippingCountryCode
  - const SHIPPING_FEE_CENTS
  - const SHIPPING_COUNTRY_CODES
  - _...2 more_
- `lib/orders.ts`
  - function generateOrderNumber: (now) => void
  - function createPendingOrder: (db, customer, items) => Promise<
  - function attachStripeSession: (db, orderId, stripeSessionId) => Promise<void>
  - function markOrderPaidBySession: (db, stripeSessionId, stripePaymentIntent?) => Promise<OrderRow | null>
  - function cancelOrderBySession: (db, stripeSessionId) => Promise<void>
  - function getOrderBySessionId: (db, stripeSessionId) => Promise<
  - _...7 more_
- `lib/products.ts`
  - function toShopProduct: (row) => ShopProduct
  - function getAllProductRows: () => Promise<ProductRow[]>
  - function getProductRow: (id) => Promise<ProductRow | null>
  - type ShopProduct
  - const getActiveProducts
  - const getHomeProducts
  - _...1 more_
- `lib/slug.ts` — function slugify: (input) => string
- `lib/stats.ts`
  - function getKpis: (db) => Promise<Kpis>
  - function getRevenueByDay: (db, days) => Promise<DayPoint[]>
  - function getTopProducts: (db, limit) => Promise<TopProduct[]>
  - function getRecentOrders: (db, limit) => void
  - type Kpis
  - type DayPoint
  - _...2 more_
- `lib/stripe.ts` — function getStripe: () => Stripe, function getSiteUrl: () => string
- `proxy.ts` — function proxy: (request) => void, const config

---

# Config

## Environment Variables

- `ADMIN_EMAIL` (has default) — .env.local
- `ADMIN_PASSWORD` (has default) — .env.local
- `ADMIN_PASSWORD_HASH` (has default) — .env.local
- `CI` **required** — playwright.config.ts
- `DATABASE_URL` (has default) — .env.local
- `NEXT_PUBLIC_SITE_URL` (has default) — .env.local
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (has default) — .env.local
- `NEXT_PUBLIC_SUPABASE_URL` (has default) — .env.local
- `NODE_ENV` **required** — lib/auth/dal.ts
- `PGLITE_DATA_DIR` **required** — lib/db/client.ts
- `SESSION_SECRET` (has default) — .env.local
- `STRIPE_PUBLIC_KEY` (has default) — .env.local
- `STRIPE_RESTRICTED_KEY` (has default) — .env.local
- `STRIPE_SECRET_KEY` (has default) — .env.local
- `STRIPE_WEBHOOK_SECRET` (has default) — .env.local

## Config Files

- `.env.example`
- `drizzle.config.ts`
- `next.config.ts`
- `tsconfig.json`

## Key Dependencies

- drizzle-orm: ^0.45.2
- next: 16.2.9
- react: 19.2.4
- stripe: ^22.2.0
- zod: ^4.4.3

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `lib/db/schema.ts` — imported by **5** files
- `app/(admin)/admin/(panel)/produits/actions.ts` — imported by **4** files
- `components/illustrations.tsx` — imported by **4** files
- `lib/db/client.ts` — imported by **4** files
- `tests/e2e/helpers.ts` — imported by **4** files
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` — imported by **3** files
- `app/(admin)/admin/(panel)/commandes/actions.ts` — imported by **2** files
- `app/(admin)/admin/login/actions.ts` — imported by **2** files
- `app/(admin)/admin/(panel)/produits/product-form.tsx` — imported by **2** files
- `lib/db/seed-data.ts` — imported by **2** files
- `tests/helpers/db.ts` — imported by **2** files
- `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/admin-nav.tsx` — imported by **1** files
- `app/(admin)/admin/(panel)/revenue-chart.tsx` — imported by **1** files
- `app/(admin)/admin/login/login-form.tsx` — imported by **1** files
- `components/newsletter.tsx` — imported by **1** files
- `components/cart-link.tsx` — imported by **1** files
- `lib/money.ts` — imported by **1** files

## Import Map (who imports what)

- `lib/db/schema.ts` ← `lib/categories.ts`, `lib/db/client.ts`, `lib/db/seed-data.ts`, `lib/order-status.ts`, `lib/stats.ts`
- `app/(admin)/admin/(panel)/produits/actions.ts` ← `app/(admin)/admin/(panel)/produits/[id]/page.tsx`, `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`, `app/(admin)/admin/(panel)/produits/page.tsx`, `app/(admin)/admin/(panel)/produits/product-form.tsx`
- `components/illustrations.tsx` ← `components/boutique.tsx`, `components/cart-view.tsx`, `components/checkout-form.tsx`, `components/newsletter.tsx`
- `lib/db/client.ts` ← `lib/orders.ts`, `lib/products.ts`, `lib/stats.ts`, `scripts/seed.ts`
- `tests/e2e/helpers.ts` ← `tests/e2e/02-cart.spec.ts`, `tests/e2e/03-admin-auth.spec.ts`, `tests/e2e/04-admin-products.spec.ts`, `tests/e2e/05-checkout.spec.ts`
- `app/(admin)/admin/(panel)/commandes/status-badge.tsx` ← `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`, `app/(admin)/admin/(panel)/commandes/page.tsx`, `app/(admin)/admin/(panel)/page.tsx`
- `app/(admin)/admin/(panel)/commandes/actions.ts` ← `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`, `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`
- `app/(admin)/admin/login/actions.ts` ← `app/(admin)/admin/(panel)/layout.tsx`, `app/(admin)/admin/login/login-form.tsx`
- `app/(admin)/admin/(panel)/produits/product-form.tsx` ← `app/(admin)/admin/(panel)/produits/[id]/page.tsx`, `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`
- `lib/db/seed-data.ts` ← `lib/db/client.ts`, `lib/products.ts`

---

# Test Coverage

> **50%** of routes and models are covered by tests
> 16 test files found

## Covered Models

- products
- orders

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_