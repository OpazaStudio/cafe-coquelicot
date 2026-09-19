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

### page_content
- page: text (pk)
- data: jsonb (default, required)
