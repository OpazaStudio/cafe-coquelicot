# UI

> **Navigation aid.** Component inventory and prop signatures extracted via AST. Read the source files before adding props or modifying component logic.

**68 components** (react)

## Client Components

- **AdminNav** — `app/(admin)/admin/(panel)/admin-nav.tsx`
- **AdminSidebar** — `app/(admin)/admin/(panel)/admin-sidebar.tsx`
- **LabelButton** — props: orderId, hasLabel — `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`
- **StatusActions** — props: orderId, status, fulfillment — `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`
- **TrackingForm** — props: orderId, trackingNumber — `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`
- **KanbanBoard** — props: orders — `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`
- **ProductForm** — props: action, product, initialSizes, initialColors, submitLabel — `app/(admin)/admin/(panel)/produits/product-form.tsx`
- **RevenueChartImpl** — props: points — `app/(admin)/admin/(panel)/revenue-chart-impl.tsx`
- **RevenueChart** — props: data — `app/(admin)/admin/(panel)/revenue-chart.tsx`
- **LoginForm** — `app/(admin)/admin/login/login-form.tsx`
- **BoutiqueShop** — props: catalogue — `components/boutique.tsx`
- **CartLink** — `components/cart-link.tsx`
- **CartView** — `components/cart-view.tsx`
- **CheckoutForm** — `components/checkout-form.tsx`
- **ClearCart** — `components/clear-cart.tsx`
- **CookieBanner** — `components/consent/cookie-banner.tsx`
- **ManageCookiesButton** — `components/consent/manage-cookies-button.tsx`
- **ContactForm** — `components/contact-form.tsx`
- **Effects** — `components/effects.tsx`
- **ProductDetail** — props: product — `components/product-detail.tsx`
- **PurchaseTracking** — props: transactionId, valueCents, shippingCents, items — `components/purchase-tracking.tsx`
- **RelayPicker** — props: value, onSelect — `components/relay-picker.tsx`
- **VaseSuggestions** — props: vases — `components/vase-suggestions.tsx`
- **CartProvider** — `lib/cart/cart-context.tsx`

## Components

- **CommandeDetailPage** — props: params — `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`
- **CommandesLoading** — `app/(admin)/admin/(panel)/commandes/loading.tsx`
- **OrdersTable** — props: orders — `app/(admin)/admin/(panel)/commandes/orders-table.tsx`
- **CommandesPage** — props: searchParams — `app/(admin)/admin/(panel)/commandes/page.tsx`
- **StatusBadge** — props: status — `app/(admin)/admin/(panel)/commandes/status-badge.tsx`
- **AdminLayout** — `app/(admin)/admin/(panel)/layout.tsx`
- **AdminDashboardPage** — `app/(admin)/admin/(panel)/page.tsx`
- **EditProduitPage** — props: params — `app/(admin)/admin/(panel)/produits/[id]/page.tsx`
- **NouveauProduitPage** — `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`
- **ProduitsPage** — `app/(admin)/admin/(panel)/produits/page.tsx`
- **Panel** — props: title, className — `app/(admin)/admin/(panel)/ui.tsx`
- **Pill** — props: tone — `app/(admin)/admin/(panel)/ui.tsx`
- **LoginPage** — `app/(admin)/admin/login/page.tsx`
- **ProduitPage** — props: params — `app/boutique/[slug]/page.tsx`
- **BoutiquePage** — `app/boutique/page.tsx`
- **CheckoutPage** — `app/checkout/page.tsx`
- **ConfirmationPage** — props: searchParams — `app/commande/confirmee/page.tsx`
- **RootLayout** — `app/layout.tsx`
- **Home** — `app/page.tsx`
- **PanierPage** — `app/panier/page.tsx`
- **ConsentDefaultScript** — `components/consent/consent-default-script.tsx`
- **HeroStorefront** — props: className — `components/illustrations.tsx`
- **Bouquet** — props: variant, className — `components/illustrations.tsx`
- **Vase** — props: variant, className — `components/illustrations.tsx`
- **ProductFigure** — props: category, variant, className — `components/illustrations.tsx`
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
- **SiteHeader** — `components/sections.tsx`
- **Hero** — props: bg — `components/sections.tsx`
- **Shop** — props: bg, products — `components/sections.tsx`
- **Gallery** — props: bg — `components/sections.tsx`
- **Prestations** — props: bg — `components/sections.tsx`
- **AtelierStrip** — props: bg — `components/sections.tsx`
- **About** — props: bg — `components/sections.tsx`
- **Contact** — props: bg — `components/sections.tsx`
- **SiteFooter** — `components/sections.tsx`

---
_Back to [overview.md](./overview.md)_