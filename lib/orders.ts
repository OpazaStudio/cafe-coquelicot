// Cycle de vie des commandes. Toutes les écritures passent par ici
// (action checkout, webhook Stripe, page de confirmation, admin).
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/client";
import {
  orderItems,
  orders,
  products,
  type NewOrderItemRow,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
} from "./db/schema";
import {
  canTransition,
  SHIPPING_FEE_CENTS,
  type Fulfillment,
} from "./order-status";

export { SHIPPING_FEE_CENTS, type Fulfillment };

export class CheckoutError extends Error {}

export type CheckoutItemInput = { slug: string; qty: number };

export type CheckoutCustomerInput = {
  name: string;
  email: string;
  phone?: string;
  fulfillment: Fulfillment;
  shippingAddress?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  shippingCountry?: string; // code ISO alpha-2, validé en amont (checkout action)
  deliveryDate?: string; // YYYY-MM-DD
  cardMessage?: string;
};

const NUMBER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans confusables

export function generateOrderNumber(now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += NUMBER_ALPHABET[Math.floor(Math.random() * NUMBER_ALPHABET.length)];
  }
  return `CQ-${d}-${suffix}`;
}

export async function createPendingOrder(
  db: Db,
  customer: CheckoutCustomerInput,
  items: CheckoutItemInput[],
): Promise<{ order: OrderRow; items: OrderItemRow[] }> {
  if (items.length === 0) {
    throw new CheckoutError("Le panier est vide.");
  }

  const slugs = items.map((i) => i.slug);
  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.slug, slugs), eq(products.active, true)));
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  for (const item of items) {
    if (!bySlug.has(item.slug)) {
      throw new CheckoutError(
        `Un produit du panier n'est plus disponible (${item.slug}). Retirez-le et réessayez.`,
      );
    }
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
      throw new CheckoutError("Quantité invalide.");
    }
  }

  const subtotalCents = items.reduce(
    (sum, i) => sum + bySlug.get(i.slug)!.priceCents * i.qty,
    0,
  );
  const deliveryFeeCents =
    customer.fulfillment === "poste" ? SHIPPING_FEE_CENTS : 0;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        number: generateOrderNumber(),
        status: "pending",
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone || null,
        fulfillment: customer.fulfillment,
        shippingAddress:
          customer.fulfillment === "poste"
            ? (customer.shippingAddress ?? null)
            : null,
        shippingPostalCode:
          customer.fulfillment === "poste"
            ? (customer.shippingPostalCode ?? null)
            : null,
        shippingCity:
          customer.fulfillment === "poste"
            ? (customer.shippingCity ?? null)
            : null,
        shippingCountry:
          customer.fulfillment === "poste"
            ? (customer.shippingCountry ?? null)
            : null,
        deliveryDate: customer.deliveryDate || null,
        cardMessage: customer.cardMessage || null,
        subtotalCents,
        deliveryFeeCents,
        totalCents: subtotalCents + deliveryFeeCents,
      })
      .returning();

    const values: NewOrderItemRow[] = items.map((i) => {
      const p = bySlug.get(i.slug)!;
      return {
        orderId: order.id,
        productId: p.id,
        nameSnapshot: p.name,
        priceCentsSnapshot: p.priceCents,
        qty: i.qty,
      };
    });
    const insertedItems = await tx.insert(orderItems).values(values).returning();

    return { order, items: insertedItems };
  });
}

export async function attachStripeSession(
  db: Db,
  orderId: string,
  stripeSessionId: string,
): Promise<void> {
  await db
    .update(orders)
    .set({ stripeSessionId })
    .where(eq(orders.id, orderId));
}

/** Passage pending → paid, idempotent (webhook ET page de confirmation l'appellent). */
export async function markOrderPaidBySession(
  db: Db,
  stripeSessionId: string,
  stripePaymentIntent?: string | null,
): Promise<OrderRow | null> {
  const updated = await db
    .update(orders)
    .set({
      status: "paid",
      ...(stripePaymentIntent ? { stripePaymentIntent } : {}),
    })
    .where(
      and(
        eq(orders.stripeSessionId, stripeSessionId),
        eq(orders.status, "pending"),
      ),
    )
    .returning();
  return updated[0] ?? null;
}

/** Checkout abandonné (session Stripe expirée) : pending → cancelled. */
export async function cancelOrderBySession(
  db: Db,
  stripeSessionId: string,
): Promise<void> {
  await db
    .update(orders)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(orders.stripeSessionId, stripeSessionId),
        eq(orders.status, "pending"),
      ),
    );
}

export async function getOrderBySessionId(
  db: Db,
  stripeSessionId: string,
): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
  const found = await db
    .select()
    .from(orders)
    .where(eq(orders.stripeSessionId, stripeSessionId))
    .limit(1);
  if (!found[0]) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, found[0].id));
  return { order: found[0], items };
}

export async function getOrderWithItems(
  db: Db,
  orderId: string,
): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
  const found = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!found[0]) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, found[0].id));
  return { order: found[0], items };
}

export async function listOrders(db: Db): Promise<OrderRow[]> {
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}

export async function updateOrderStatus(
  db: Db,
  orderId: string,
  to: OrderStatus,
): Promise<OrderRow> {
  const found = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = found[0];
  if (!order) throw new Error("Commande introuvable.");
  if (!canTransition(order.status, to, order.fulfillment)) {
    throw new Error(
      `Transition impossible : ${order.status} → ${to}.`,
    );
  }
  const [updated] = await db
    .update(orders)
    .set({ status: to })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

export async function setTrackingNumber(
  db: Db,
  orderId: string,
  trackingNumber: string | null,
): Promise<void> {
  await db
    .update(orders)
    .set({ trackingNumber })
    .where(eq(orders.id, orderId));
}
