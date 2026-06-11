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
- prepStatus: prepStatusEnum (default, required)
- prepDoneAt: timestamp
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
