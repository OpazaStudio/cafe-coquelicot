# Database

> **Navigation aid.** Schema shapes and field types extracted via AST. Read the actual schema source files before writing migrations or query logic.

**drizzle** — 10 models

### products

pk: `id` (uuid)

- `id`: uuid _(pk)_
- `slug`: text _(unique, required)_
- `name`: text _(required)_
- `tag`: text
- `description`: text _(required)_
- `descriptionRich`: jsonb
- `priceCents`: integer _(required)_
- `category`: productCategory _(required)_
- `badge`: text
- `illustrationVariant`: integer _(default, required)_
- `imagePath`: text
- `imageBgColor`: text
- `imageFrame`: text _(default, required)_
- `active`: boolean _(default, required)_

### product_sizes

pk: `id` (uuid) · fk: productId

- `id`: uuid _(pk)_
- `productId`: uuid _(fk, required)_
- `label`: text _(required)_
- `priceCents`: integer _(required)_
- `sortOrder`: integer _(default, required)_
- `active`: boolean _(default, required)_
- _relations_: productId -> products.id

### product_colors

pk: `id` (uuid) · fk: productId

- `id`: uuid _(pk)_
- `productId`: uuid _(fk, required)_
- `label`: text _(required)_
- `illustrationVariant`: integer _(default, required)_
- `imagePath`: text
- `imageBgColor`: text
- `sortOrder`: integer _(default, required)_
- `active`: boolean _(default, required)_
- _relations_: productId -> products.id

### product_images

pk: `id` (uuid) · fk: productId, sizeId, colorId

- `id`: uuid _(pk)_
- `productId`: uuid _(fk, required)_
- `sizeId`: uuid _(fk)_
- `colorId`: uuid _(fk)_
- `path`: text _(required)_
- `bgColor`: text
- `alt`: text
- `sortOrder`: integer _(default, required)_
- _relations_: productId -> products.id, sizeId -> productSizes.id, colorId -> productColors.id

### orders

pk: `id` (uuid) · fk: relayPointId, stripeSessionId

- `id`: uuid _(pk)_
- `number`: text _(unique, required)_
- `status`: orderStatus _(default, required)_
- `customerName`: text _(required)_
- `customerEmail`: text _(required)_
- `customerPhone`: text
- `fulfillment`: fulfillmentEnum _(required)_
- `shippingAddress`: text
- `shippingPostalCode`: text
- `shippingCity`: text
- `shippingCountry`: text
- `relayPointId`: text _(fk)_
- `relayPointName`: text
- `relayShipmentNumber`: text
- `relayLabelUrl`: text
- `trackingNumber`: text
- `prepStatus`: prepStatusEnum _(default, required)_
- `prepDoneAt`: timestamp
- `deliveryDate`: date
- `cardMessage`: text
- `subtotalCents`: integer _(required)_
- `deliveryFeeCents`: integer _(default, required)_
- `cardFeeCents`: integer _(default, required)_
- `totalCents`: integer _(required)_
- `stripeSessionId`: text _(unique, fk)_
- `stripePaymentIntent`: text

### order_items

pk: `id` (uuid) · fk: orderId, productId, sizeId, colorId

- `id`: uuid _(pk)_
- `orderId`: uuid _(fk, required)_
- `productId`: uuid _(fk)_
- `nameSnapshot`: text _(required)_
- `priceCentsSnapshot`: integer _(required)_
- `qty`: integer _(required)_
- `preparedQty`: integer _(default, required)_
- `sizeId`: uuid _(fk)_
- `colorId`: uuid _(fk)_
- `sizeLabelSnapshot`: text
- `colorLabelSnapshot`: text
- _relations_: orderId -> orders.id, productId -> products.id, sizeId -> productSizes.id, colorId -> productColors.id

### admin_users

pk: `id` (uuid)

- `id`: uuid _(pk)_
- `email`: text _(unique, required)_
- `passwordHash`: text _(required)_
- `passwordChangedAt`: timestamp _(default, required)_

### settings

pk: `key` (text)

- `key`: text _(pk)_
- `value`: text _(default, required)_

### page_content

pk: `page` (text)

- `page`: text _(pk)_
- `data`: jsonb _(default, required)_

### contact_submissions

pk: `id` (uuid)

- `id`: uuid _(pk)_
- `name`: text _(required)_
- `email`: text _(required)_
- `phone`: text _(required)_
- `message`: text _(required)_
- `emailSent`: boolean _(default, required)_
- `readAt`: timestamp

## Schema Source Files

Read and edit these files when adding columns, creating migrations, or changing relations:

- `tests/helpers/db.ts` — imported by **13** files
- `lib/db/schema.ts` — imported by **7** files
- `lib/db/client.ts` — imported by **7** files

---
_Back to [overview.md](./overview.md)_