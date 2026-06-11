// Cycle de vie des commandes. Toutes les écritures passent par ici
// (action checkout, webhook Stripe, page de confirmation, admin).
import { and, asc, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
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
  type ShippingCountryCode,
} from "./order-status";
import {
  BOARD_ORDER_STATUSES,
  derivePrepStatus,
  DONE_RETENTION_MS,
  type PrepStatus,
} from "./prep-status";

export { SHIPPING_FEE_CENTS, type Fulfillment };

export class CheckoutError extends Error {}

export type CheckoutItemInput = { slug: string; qty: number };

export type CheckoutCustomerInput = {
  name: string;
  email: string;
  phone?: string;
  fulfillment: Fulfillment;
  // Champs poste — complétude validée en amont (checkout action) ; les
  // lignes migrées d'avant l'envoi postal peuvent être partielles.
  shippingAddress?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  shippingCountry?: ShippingCountryCode;
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
  const isPoste = customer.fulfillment === "poste";
  const deliveryFeeCents = isPoste ? SHIPPING_FEE_CENTS : 0;

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
        shippingAddress: isPoste ? (customer.shippingAddress ?? null) : null,
        shippingPostalCode: isPoste ? (customer.shippingPostalCode ?? null) : null,
        shippingCity: isPoste ? (customer.shippingCity ?? null) : null,
        shippingCountry: isPoste ? (customer.shippingCountry ?? null) : null,
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

/**
 * Cartes visibles du kanban : commandes payées non annulées, les `done`
 * masquées 48h après leur fin de préparation. Tri : date de livraison
 * souhaitée croissante (NULLS LAST, défaut Postgres en ASC) puis création.
 */
export async function listBoardOrders(
  db: Db,
  now = new Date(),
): Promise<OrderRow[]> {
  const cutoff = new Date(now.getTime() - DONE_RETENTION_MS);
  return db
    .select()
    .from(orders)
    .where(
      and(
        inArray(orders.status, BOARD_ORDER_STATUSES),
        or(
          ne(orders.prepStatus, "done"),
          isNull(orders.prepDoneAt),
          gt(orders.prepDoneAt, cutoff),
        ),
      ),
    )
    .orderBy(asc(orders.deliveryDate), asc(orders.createdAt));
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
  // La préparation est forcément finie quand la commande part ou est retirée.
  const finishesPrep =
    (to === "shipped" || to === "picked_up") && order.prepStatus !== "done";
  const [updated] = await db
    .update(orders)
    .set({
      status: to,
      ...(finishesPrep
        ? { prepStatus: "done" as const, prepDoneAt: new Date() }
        : {}),
    })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

/**
 * Statut de préparation (kanban admin). Navigation libre entre colonnes,
 * réservée aux commandes payées non annulées. Entrer dans `done` pose la
 * date (base de la fenêtre 48h du board), en sortir l'efface.
 */
export async function setPrepStatus(
  db: Db,
  orderId: string,
  to: PrepStatus,
  now = new Date(),
): Promise<OrderRow> {
  const found = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = found[0];
  if (!order) throw new Error("Commande introuvable.");
  if (!BOARD_ORDER_STATUSES.includes(order.status)) {
    throw new Error("Commande hors du kanban (non payée ou annulée).");
  }
  if (order.prepStatus === to) return order;
  const [updated] = await db
    .update(orders)
    .set({ prepStatus: to, prepDoneAt: to === "done" ? now : null })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

/**
 * Cases de préparation (kanban admin) : pose le nombre d'unités préparées
 * d'un article (borné à [0, qty]) puis recalcule le statut de la carte
 * depuis l'ensemble des articles — symétrique : tout coché → ready,
 * partiel → in_progress, rien → todo. Refusé sur une carte terminée
 * (cases gelées) ; `prep_done_at` n'est jamais touché ici.
 */
export async function setItemPreparedQty(
  db: Db,
  orderItemId: string,
  preparedQty: number,
): Promise<OrderRow> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ item: orderItems, order: orders })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orderItems.id, orderItemId))
      .limit(1);
    const row = found[0];
    if (!row) throw new Error("Article introuvable.");
    if (!BOARD_ORDER_STATUSES.includes(row.order.status)) {
      throw new Error("Commande hors du kanban (non payée ou annulée).");
    }
    if (row.order.prepStatus === "done") {
      throw new Error("Préparation déjà terminée.");
    }

    const clamped = Math.min(Math.max(preparedQty, 0), row.item.qty);
    await tx
      .update(orderItems)
      .set({ preparedQty: clamped })
      .where(eq(orderItems.id, orderItemId));

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, row.order.id));
    const preparedTotal = items.reduce((sum, i) => sum + i.preparedQty, 0);
    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    const derived = derivePrepStatus(preparedTotal, totalQty);
    if (derived === row.order.prepStatus) return row.order;

    const [updated] = await tx
      .update(orders)
      .set({ prepStatus: derived })
      .where(eq(orders.id, row.order.id))
      .returning();
    return updated;
  });
}

/** N° de suivi (mode poste uniquement) : posé/effacé par l'admin, jamais côté client. */
export async function setTrackingNumber(
  db: Db,
  orderId: string,
  trackingNumber: string | null,
): Promise<void> {
  const updated = await db
    .update(orders)
    .set({ trackingNumber })
    .where(and(eq(orders.id, orderId), eq(orders.fulfillment, "poste")))
    .returning({ id: orders.id });
  if (updated.length === 0) {
    throw new Error("Commande introuvable ou sans envoi postal.");
  }
}
