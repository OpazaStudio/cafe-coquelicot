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
  "delivered",
  "cancelled",
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

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  status: orderStatus("status").notNull().default("pending"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  deliveryAddress: text("delivery_address"),
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
});

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type NewOrderItemRow = typeof orderItems.$inferInsert;

export type ProductCategory = (typeof productCategory.enumValues)[number];
export type OrderStatus = (typeof orderStatus.enumValues)[number];
