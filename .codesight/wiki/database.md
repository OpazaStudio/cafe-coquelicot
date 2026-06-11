# Database

> **Navigation aid.** Schema shapes and field types extracted via AST. Read the actual schema source files before writing migrations or query logic.

**drizzle** — 3 models

### products

pk: `id` (uuid)

- `id`: uuid _(pk)_
- `slug`: text _(unique, required)_
- `name`: text _(required)_
- `tag`: text _(required)_
- `description`: text _(required)_
- `priceCents`: integer _(required)_
- `category`: productCategory _(required)_
- `badge`: text
- `illustrationVariant`: integer _(default, required)_
- `active`: boolean _(default, required)_

### orders

pk: `id` (uuid) · fk: stripeSessionId

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
- `trackingNumber`: text
- `prepStatus`: prepStatusEnum _(default, required)_
- `prepDoneAt`: timestamp
- `deliveryDate`: date
- `cardMessage`: text
- `subtotalCents`: integer _(required)_
- `deliveryFeeCents`: integer _(default, required)_
- `totalCents`: integer _(required)_
- `stripeSessionId`: text _(unique, fk)_
- `stripePaymentIntent`: text

### order_items

pk: `id` (uuid) · fk: orderId, productId

- `id`: uuid _(pk)_
- `orderId`: uuid _(fk, required)_
- `productId`: uuid _(fk)_
- `nameSnapshot`: text _(required)_
- `priceCentsSnapshot`: integer _(required)_
- `qty`: integer _(required)_
- _relations_: orderId -> orders.id, productId -> products.id

## Schema Source Files

Read and edit these files when adding columns, creating migrations, or changing relations:

- `lib/db/schema.ts` — imported by **5** files
- `lib/db/client.ts` — imported by **4** files
- `lib/db/seed-data.ts` — imported by **2** files
- `tests/helpers/db.ts` — imported by **2** files

---
_Back to [overview.md](./overview.md)_