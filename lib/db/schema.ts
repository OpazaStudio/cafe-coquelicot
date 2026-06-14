import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const productCategory = pgEnum("product_category", [
  "frais",
  "seche",
  "compo",
  "branches",
  "mini",
]);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "picked_up",
  "cancelled",
]);

export const fulfillmentEnum = pgEnum("fulfillment", ["retrait", "poste"]);

export const prepStatusEnum = pgEnum("prep_status", [
  "todo",
  "in_progress",
  "ready",
  "done",
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tag: text("tag").notNull(),
  description: text("description").notNull(),
  priceCents: integer("price_cents").notNull(),
  category: productCategory("category").notNull(),
  badge: text("badge"),
  illustrationVariant: integer("illustration_variant").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Tailles d'un produit : la dimension *vendable et tarifée* (chaque taille a
// son prix). Optionnel — un produit sans taille est vendu au prix de base.
export const productSizes = pgTable("product_sizes", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  priceCents: integer("price_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Coloris d'un produit : attribut *cosmétique* (même prix) qui change
// l'illustration au trait et doit être enregistré sur la commande.
export const productColors = pgTable("product_colors", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  illustrationVariant: integer("illustration_variant").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  status: orderStatus("status").notNull().default("pending"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  fulfillment: fulfillmentEnum("fulfillment").notNull(),
  shippingAddress: text("shipping_address"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingCity: text("shipping_city"),
  shippingCountry: text("shipping_country"),
  trackingNumber: text("tracking_number"),
  // Kanban de préparation (admin) — dimension séparée du statut commande.
  prepStatus: prepStatusEnum("prep_status").notNull().default("todo"),
  prepDoneAt: timestamp("prep_done_at", { withTimezone: true }),
  deliveryDate: date("delivery_date"),
  cardMessage: text("card_message"),
  subtotalCents: integer("subtotal_cents").notNull(),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntent: text("stripe_payment_intent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  nameSnapshot: text("name_snapshot").notNull(),
  priceCentsSnapshot: integer("price_cents_snapshot").notNull(),
  qty: integer("qty").notNull(),
  // Unités préparées (cases du kanban admin) : compteur 0..qty, borné côté
  // application — les unités d'un même produit sont interchangeables.
  preparedQty: integer("prepared_qty").notNull().default(0),
  // Variante choisie (taille = prix, coloris = cosmétique). Les *_id servent
  // à l'analytique (set null si la variante est supprimée) ; l'affichage et le
  // prix s'appuient sur les snapshots de labels, comme name/price_cents.
  sizeId: uuid("size_id").references(() => productSizes.id, {
    onDelete: "set null",
  }),
  colorId: uuid("color_id").references(() => productColors.id, {
    onDelete: "set null",
  }),
  sizeLabelSnapshot: text("size_label_snapshot"),
  colorLabelSnapshot: text("color_label_snapshot"),
});

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type ProductSizeRow = typeof productSizes.$inferSelect;
export type NewProductSizeRow = typeof productSizes.$inferInsert;
export type ProductColorRow = typeof productColors.$inferSelect;
export type NewProductColorRow = typeof productColors.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type NewOrderItemRow = typeof orderItems.$inferInsert;

export type ProductCategory = (typeof productCategory.enumValues)[number];
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type Fulfillment = (typeof fulfillmentEnum.enumValues)[number];
export type PrepStatus = (typeof prepStatusEnum.enumValues)[number];
