# UI

> **Navigation aid.** Component inventory and prop signatures extracted via AST. Read the source files before adding props or modifying component logic.

**114 components** (react)

## Client Components

- **AdminNav** — `app/(admin)/admin/(panel)/admin-nav.tsx`
- **AdminSidebar** — `app/(admin)/admin/(panel)/admin-sidebar.tsx`
- **LabelButton** — props: orderId, hasLabel — `app/(admin)/admin/(panel)/commandes/[id]/label-button.tsx`
- **StatusActions** — props: orderId, status, fulfillment — `app/(admin)/admin/(panel)/commandes/[id]/status-actions.tsx`
- **TrackingForm** — props: orderId, trackingNumber, fulfillment — `app/(admin)/admin/(panel)/commandes/[id]/tracking-form.tsx`
- **KanbanBoard** — props: orders — `app/(admin)/admin/(panel)/commandes/kanban-board.tsx`
- **PasswordForm** — `app/(admin)/admin/(panel)/compte/password-form.tsx`
- **ContentEditor** — props: page, initial, action — `app/(admin)/admin/(panel)/contenu/content-editor.tsx`
- **ContentFields** — props: fields, value, onChange, idPrefix — `app/(admin)/admin/(panel)/contenu/content-fields.tsx`
- **ImageField** — props: id, label, hint, value, onChange — `app/(admin)/admin/(panel)/contenu/image-field.tsx`
- **PreviewFrame** — props: src, onLoad, ref — `app/(admin)/admin/(panel)/contenu/preview-frame.tsx`
- **ImageGallery** — props: images, sizes, colors, onChange, nextKey, frame, onFrameChange — `app/(admin)/admin/(panel)/produits/image-gallery.tsx`
- **ImageUpload** — props: value, bgColor, onChange, fallback, label, size — `app/(admin)/admin/(panel)/produits/image-upload.tsx`
- **ProductForm** — props: action, product, initialSizes, initialColors, initialImages, submitLabel — `app/(admin)/admin/(panel)/produits/product-form.tsx`
- **RichEditor** — props: value, onChange — `app/(admin)/admin/(panel)/produits/rich-editor.tsx`
- **RevenueChartImpl** — props: points — `app/(admin)/admin/(panel)/revenue-chart-impl.tsx`
- **RevenueChart** — props: data — `app/(admin)/admin/(panel)/revenue-chart.tsx`
- **SettingsForm** — props: initial, groups, submit, savedLabel — `app/(admin)/admin/(panel)/settings-form.tsx`
- **LoginForm** — `app/(admin)/admin/login/login-form.tsx`
- **BgTweakGate** — `components/bg-tweak/gate.tsx`
- **BgTweakPanel** — `components/bg-tweak/panel.tsx`
- **BoutiqueShop** — props: catalogue, copy — `components/boutique.tsx`
- **CartLink** — props: onClick — `components/cart-link.tsx`
- **CartView** — props: copy — `components/cart-view.tsx`
- **CheckoutForm** — props: fees — `components/checkout-form.tsx`
- **ClearCart** — `components/clear-cart.tsx`
- **CookieBanner** — `components/consent/cookie-banner.tsx`
- **ManageCookiesButton** — `components/consent/manage-cookies-button.tsx`
- **ContactForm** — `components/contact-form.tsx`
- **Effects** — `components/effects.tsx`
- **MobileMenu** — props: nav — `components/mobile-menu.tsx`
- **ProductDetail** — props: product — `components/product-detail.tsx`
- **PurchaseTracking** — props: transactionId, valueCents, shippingCents, items — `components/purchase-tracking.tsx`
- **RelayPicker** — props: value, onSelect — `components/relay-picker.tsx`
- **VaseSuggestions** — props: vases, copy — `components/vase-suggestions.tsx`
- **BoutiqueView** — props: content, chrome, catalogue — `components/views/boutique-view.tsx`
- **CheckoutView** — props: content, chrome, fees — `components/views/checkout-view.tsx`
- **ConfirmationView** — props: content, chrome, state, vars — `components/views/confirmation-view.tsx`
- **HomeView** — props: content, chrome, products — `components/views/home-view.tsx`
- **PanierView** — props: content, chrome, vases — `components/views/panier-view.tsx`
- **CartProvider** — `lib/cart/cart-context.tsx`

## Components

- **CommandeDetailPage** — props: params — `app/(admin)/admin/(panel)/commandes/[id]/page.tsx`
- **CommandesLoading** — `app/(admin)/admin/(panel)/commandes/loading.tsx`
- **OrdersTable** — props: orders — `app/(admin)/admin/(panel)/commandes/orders-table.tsx`
- **CommandesPage** — props: searchParams — `app/(admin)/admin/(panel)/commandes/page.tsx`
- **StatusBadge** — props: status — `app/(admin)/admin/(panel)/commandes/status-badge.tsx`
- **ComptePage** — `app/(admin)/admin/(panel)/compte/page.tsx`
- **ContenuPage** — props: params — `app/(admin)/admin/(panel)/contenu/[page]/page.tsx`
- **ContenuIndex** — `app/(admin)/admin/(panel)/contenu/page.tsx`
- **EmailsPage** — `app/(admin)/admin/(panel)/emails/page.tsx`
- **AdminLayout** — `app/(admin)/admin/(panel)/layout.tsx`
- **AdminDashboardPage** — `app/(admin)/admin/(panel)/page.tsx`
- **ParametresPage** — `app/(admin)/admin/(panel)/parametres/page.tsx`
- **EditProduitPage** — props: params — `app/(admin)/admin/(panel)/produits/[id]/page.tsx`
- **NouveauProduitPage** — `app/(admin)/admin/(panel)/produits/nouveau/page.tsx`
- **ProduitsPage** — `app/(admin)/admin/(panel)/produits/page.tsx`
- **SoumissionsPage** — `app/(admin)/admin/(panel)/soumissions/page.tsx`
- **Panel** — props: title, className — `app/(admin)/admin/(panel)/ui.tsx`
- **Pill** — props: tone — `app/(admin)/admin/(panel)/ui.tsx`
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
- **ConsentDefaultScript** — `components/consent/consent-default-script.tsx`
- **ContentImage** — props: image, fallback, fallbackAlt, sizes, className — `components/content/content-image.tsx`
- **Lines** — props: text — `components/content/text.tsx`
- **Paragraphs** — props: text, className — `components/content/text.tsx`
- **HeroStorefront** — props: className — `components/illustrations.tsx`
- **Bouquet** — props: variant, className — `components/illustrations.tsx`
- **Vase** — props: variant, className — `components/illustrations.tsx`
- **ProductFigure** — props: category, variant, imagePath, imageBgColor, alt, className, sizes, priority — `components/illustrations.tsx`
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
- **RichText** — props: doc, fallback, className — `components/rich-text.tsx`
- **SiteHeader** — props: nav — `components/sections.tsx`
- **Hero** — props: bg, content — `components/sections.tsx`
- **Shop** — props: bg, content, products — `components/sections.tsx`
- **Gallery** — props: bg, content — `components/sections.tsx`
- **Prestations** — props: bg, content — `components/sections.tsx`
- **AtelierStrip** — props: bg, content — `components/sections.tsx`
- **About** — props: bg, content — `components/sections.tsx`
- **Contact** — props: bg, content — `components/sections.tsx`
- **SiteFooter** — props: footer — `components/sections.tsx`

---
_Back to [overview.md](./overview.md)_