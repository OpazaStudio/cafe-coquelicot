// Cycle de vie des commandes. Toutes les écritures passent par ici
// (action checkout, webhook Stripe, page de confirmation, admin).
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { CheckoutError } from "./checkout/errors";
import type { Db, Tx } from "./db/client";
import {
  orderItems,
  orders,
  productColors,
  productSizes,
  products,
  type NewOrderItemRow,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
  type ProductColorRow,
  type ProductRow,
  type ProductSizeRow,
} from "./db/schema";
import {
  canTransition,
  CARD_FEE_CENTS,
  DEFAULT_SHIPPING_FEES,
  MONDIAL_RELAY_FEE_CENTS,
  shippingFeeFor,
  type Fulfillment,
  type ShippingCountryCode,
  type ShippingFees,
} from "./order-status";
import {
  BOARD_ORDER_STATUSES,
  derivePrepStatus,
  DONE_RETENTION_MS,
  type PrepStatus,
} from "./prep-status";
import { resolveStockKey } from "./products";
import { releaseOrderStock } from "./stock/release";
import { reserveStock } from "./stock/reserve";
import { isUuid } from "./uuid";

export { MONDIAL_RELAY_FEE_CENTS, type Fulfillment };
export { CheckoutError };

export class OrderStatusConflictError extends Error {}

export type CheckoutItemInput = {
  slug: string;
  sizeId?: string | null;
  colorId?: string | null;
  qty: number;
};

// Ligne résolue côté serveur : prix et labels font foi (jamais le client).
type ResolvedLine = {
  product: ProductRow;
  qty: number;
  priceCents: number;
  sizeId: string | null;
  colorId: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  stockSizeId: string | null;
};

export type CheckoutCustomerInput = {
  name: string;
  email: string;
  phone?: string;
  fulfillment: Fulfillment;
  // Point relais Mondial Relay (mode mondial_relay).
  relayPointId?: string;
  relayPointName?: string;
  relayStreet?: string;
  relayPostalCode?: string;
  relayCity?: string;
  // Adresse client (mode poste = Colissimo à domicile).
  shippingAddress?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  shippingCountry?: ShippingCountryCode;
  deliveryDate?: string;
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
  fees: ShippingFees = DEFAULT_SHIPPING_FEES,
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

  // Variantes actives des produits du panier, groupées par produit.
  const productIds = rows.map((r) => r.id);
  const allSizes: ProductSizeRow[] = productIds.length
    ? await db
        .select()
        .from(productSizes)
        .where(
          and(
            inArray(productSizes.productId, productIds),
            eq(productSizes.active, true),
          ),
        )
    : [];
  const allColors: ProductColorRow[] = productIds.length
    ? await db
        .select()
        .from(productColors)
        .where(
          and(
            inArray(productColors.productId, productIds),
            eq(productColors.active, true),
          ),
        )
    : [];
  const sizesByProduct = new Map<string, ProductSizeRow[]>();
  for (const s of allSizes) {
    const list = sizesByProduct.get(s.productId);
    if (list) list.push(s);
    else sizesByProduct.set(s.productId, [s]);
  }
  const colorsByProduct = new Map<string, ProductColorRow[]>();
  for (const c of allColors) {
    const list = colorsByProduct.get(c.productId);
    if (list) list.push(c);
    else colorsByProduct.set(c.productId, [c]);
  }

  // Résolution : la taille porte le prix, le coloris est figé en snapshot.
  // Une taille/coloris est exigé ssi le produit en propose ; un id fourni doit
  // appartenir au produit et être actif.
  const resolved: ResolvedLine[] = items.map((item) => {
    const p = bySlug.get(item.slug)!;
    const sizes = sizesByProduct.get(p.id) ?? [];
    const colors = colorsByProduct.get(p.id) ?? [];

    let priceCents = p.priceCents;
    let sizeId: string | null = null;
    let sizeLabel: string | null = null;
    if (sizes.length > 0) {
      const s = item.sizeId ? sizes.find((x) => x.id === item.sizeId) : undefined;
      if (!s) throw new CheckoutError(`Choix de taille requis pour ${p.name}.`);
      priceCents = s.priceCents;
      sizeId = s.id;
      sizeLabel = s.label;
    } else if (item.sizeId) {
      throw new CheckoutError(`Ce produit n'a pas de taille (${p.name}).`);
    }

    let colorId: string | null = null;
    let colorLabel: string | null = null;
    if (colors.length > 0) {
      const c = item.colorId ? colors.find((x) => x.id === item.colorId) : undefined;
      if (!c) throw new CheckoutError(`Choix de coloris requis pour ${p.name}.`);
      colorId = c.id;
      colorLabel = c.label;
    } else if (item.colorId) {
      throw new CheckoutError(`Ce produit n'a pas de coloris (${p.name}).`);
    }

    const stockKey = resolveStockKey(p, sizes, sizeId);

    return {
      product: p,
      qty: item.qty,
      priceCents,
      sizeId,
      colorId,
      sizeLabel,
      colorLabel,
      stockSizeId: stockKey.table === "product_sizes" ? stockKey.id : null,
    };
  });

  const subtotalCents = resolved.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const isRelay = customer.fulfillment === "mondial_relay";
  const isPoste = customer.fulfillment === "poste";
  const deliveryFeeCents = shippingFeeFor(customer.fulfillment, fees);
  // Carte manuscrite : supplément dès qu'un message non vide est joint.
  const cardMessage = customer.cardMessage?.trim() || null;
  const cardFeeCents = cardMessage ? CARD_FEE_CENTS : 0;

  return db.transaction(async (tx) => {
    const reservations = await reserveStock(
      tx,
      resolved.map((l) => ({
        productId: l.product.id,
        sizeId: l.stockSizeId,
        qty: l.qty,
        productName: l.product.name,
        sizeLabel: l.sizeLabel,
      })),
    );
    const reserved = new Map(reservations.map((r) => [r.orderItemIndex, r]));

    const [order] = await tx
      .insert(orders)
      .values({
        number: generateOrderNumber(),
        status: "pending",
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone || null,
        fulfillment: customer.fulfillment,
        shippingAddress: isRelay
          ? (customer.relayStreet ?? null)
          : isPoste
            ? (customer.shippingAddress ?? null)
            : null,
        shippingPostalCode: isRelay
          ? (customer.relayPostalCode ?? null)
          : isPoste
            ? (customer.shippingPostalCode ?? null)
            : null,
        shippingCity: isRelay
          ? (customer.relayCity ?? null)
          : isPoste
            ? (customer.shippingCity ?? null)
            : null,
        shippingCountry: isRelay ? "FR" : isPoste ? (customer.shippingCountry ?? null) : null,
        relayPointId: isRelay ? (customer.relayPointId ?? null) : null,
        relayPointName: isRelay ? (customer.relayPointName ?? null) : null,
        deliveryDate: customer.deliveryDate || null,
        cardMessage,
        subtotalCents,
        deliveryFeeCents,
        cardFeeCents,
        totalCents: subtotalCents + deliveryFeeCents + cardFeeCents,
      })
      .returning();

    const values: NewOrderItemRow[] = resolved.map((l, index) => ({
      orderId: order.id,
      productId: l.product.id,
      nameSnapshot: l.product.name,
      priceCentsSnapshot: l.priceCents,
      qty: l.qty,
      sizeId: l.sizeId,
      colorId: l.colorId,
      sizeLabelSnapshot: l.sizeLabel,
      colorLabelSnapshot: l.colorLabel,
      stockReservedQty: reserved.get(index)?.reservedQty ?? 0,
      stockReservedSizeId: reserved.get(index)?.sizeId ?? null,
      stockReservedProductId: reserved.get(index)?.productId ?? null,
    }));
    const insertedItems = await tx.insert(orderItems).values(values).returning();

    return { order, items: insertedItems };
  });
}

export async function attachStripeSession(
  db: Db,
  orderId: string,
  stripeSessionId: string,
): Promise<void> {
  const attached = await db
    .update(orders)
    .set({ stripeSessionId })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning();
  if (!attached[0]) {
    throw new Error("La commande n'est plus en attente de paiement.");
  }
}

/**
 * Passage pending → paid, idempotent (webhook ET page de confirmation l'appellent).
 *
 * `fallbackOrderId` (metadata.orderId de la session Stripe) est un filet :
 * `attachStripeSession` est appelé APRÈS la création de la session Stripe
 * (app/checkout/actions.ts), donc une écriture ratée laisse une commande
 * pending sans `stripe_session_id` — irréconciliable si on ne cherchait que
 * par session. On répare alors la ligne en y posant le sessionId.
 */
export async function markOrderPaidBySession(
  db: Db,
  stripeSessionId: string,
  stripePaymentIntent?: string | null,
  fallbackOrderId?: string | null,
): Promise<OrderRow | null> {
  const paidFields = {
    status: "paid" as const,
    ...(stripePaymentIntent ? { stripePaymentIntent } : {}),
  };
  const updated = await db
    .update(orders)
    .set(paidFields)
    .where(
      and(
        eq(orders.stripeSessionId, stripeSessionId),
        eq(orders.status, "pending"),
      ),
    )
    .returning();
  if (updated[0]) return updated[0];

  // isUuid : metadata vient de Stripe (signature vérifiée) mais reste une
  // chaîne libre — un id malformé doit rendre null, pas casser la requête.
  if (!isUuid(fallbackOrderId)) return null;
  const repaired = await db
    .update(orders)
    .set({ ...paidFields, stripeSessionId })
    .where(
      and(
        eq(orders.id, fallbackOrderId),
        eq(orders.status, "pending"),
        isNull(orders.stripeSessionId),
      ),
    )
    .returning();
  return repaired[0] ?? null;
}

export type PaidReconciliation =
  | { outcome: "paid"; order: OrderRow }
  | { outcome: "replay"; order: OrderRow }
  | { outcome: "paid_on_cancelled"; order: OrderRow }
  | { outcome: "unknown" };

const ALREADY_PAID_STATUSES: readonly OrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "picked_up",
];

async function findOrderForPaidSession(
  db: Db,
  stripeSessionId: string,
  fallbackOrderId?: string | null,
): Promise<OrderRow | null> {
  const bySession = await db
    .select()
    .from(orders)
    .where(eq(orders.stripeSessionId, stripeSessionId))
    .limit(1);
  if (bySession[0]) return bySession[0];

  if (!isUuid(fallbackOrderId)) return null;
  const byFallback = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, fallbackOrderId), isNull(orders.stripeSessionId)))
    .limit(1);
  return byFallback[0] ?? null;
}

export async function reconcilePaidSession(
  db: Db,
  stripeSessionId: string,
  stripePaymentIntent?: string | null,
  fallbackOrderId?: string | null,
): Promise<PaidReconciliation> {
  const paid = await markOrderPaidBySession(
    db,
    stripeSessionId,
    stripePaymentIntent,
    fallbackOrderId,
  );
  if (paid) return { outcome: "paid", order: paid };

  const existing = await findOrderForPaidSession(db, stripeSessionId, fallbackOrderId);
  if (!existing) return { outcome: "unknown" };
  if (ALREADY_PAID_STATUSES.includes(existing.status)) {
    return { outcome: "replay", order: existing };
  }
  if (existing.status === "cancelled") {
    return existing.stripePaymentIntent === null
      ? { outcome: "paid_on_cancelled", order: existing }
      : { outcome: "replay", order: existing };
  }
  return { outcome: "unknown" };
}

/** Checkout abandonné (session Stripe expirée) : pending → cancelled. */
export async function cancelOrderBySession(
  db: Db,
  stripeSessionId: string,
  fallbackOrderId?: string | null,
): Promise<OrderRow | null> {
  return db.transaction(async (tx) => {
    const cancelled = await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(orders.stripeSessionId, stripeSessionId),
          eq(orders.status, "pending"),
        ),
      )
      .returning();
    if (cancelled[0]) {
      await releaseOrderStock(tx, cancelled[0].id);
      return cancelled[0];
    }

    if (!isUuid(fallbackOrderId)) return null;
    const repaired = await tx
      .update(orders)
      .set({ status: "cancelled", stripeSessionId })
      .where(
        and(
          eq(orders.id, fallbackOrderId),
          eq(orders.status, "pending"),
          isNull(orders.stripeSessionId),
        ),
      )
      .returning();
    if (!repaired[0]) return null;
    await releaseOrderStock(tx, repaired[0].id);
    return repaired[0];
  });
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

export type BoardOrder = { order: OrderRow; items: OrderItemRow[] };

/**
 * Cartes visibles du kanban avec leurs articles : commandes payées non
 * annulées, les `done` masquées 48h après leur fin de préparation.
 * Tri : date de livraison souhaitée croissante (NULLS LAST, défaut
 * Postgres en ASC) puis création ; articles triés par nom.
 */
export async function listBoardOrders(
  db: Db,
  now = new Date(),
): Promise<BoardOrder[]> {
  const cutoff = new Date(now.getTime() - DONE_RETENTION_MS);
  const rows = await db
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
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(orderItems.nameSnapshot));
  const byOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }
  return rows.map((order) => ({ order, items: byOrder.get(order.id) ?? [] }));
}

export async function setOrderStatusIfUnchanged(
  db: Db | Tx,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  extra: Partial<Pick<OrderRow, "prepStatus" | "prepDoneAt">> = {},
): Promise<OrderRow | null> {
  const rows = await db
    .update(orders)
    .set({ status: to, ...extra })
    .where(and(eq(orders.id, orderId), eq(orders.status, from)))
    .returning();
  return rows[0] ?? null;
}

export type OrderStatusChange = OrderRow & { restockedUnits: number };

export async function updateOrderStatus(
  db: Db,
  orderId: string,
  to: OrderStatus,
  restock = false,
): Promise<OrderStatusChange> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    const order = found[0];
    if (!order) throw new Error("Commande introuvable.");
    if (!canTransition(order.status, to, order.fulfillment)) {
      throw new Error(
        `Transition impossible : ${order.status} → ${to}.`,
      );
    }
    // La préparation est forcément finie quand la commande part ou est
    // retirée : carte en « Terminée » (date posée une seule fois) et toutes
    // les cases cochées — même si la carte y avait été déplacée à la main.
    const finishesPrep = to === "shipped" || to === "picked_up";
    const updated = await setOrderStatusIfUnchanged(
      tx,
      orderId,
      order.status,
      to,
      finishesPrep && order.prepStatus !== "done"
        ? { prepStatus: "done", prepDoneAt: new Date() }
        : {},
    );
    if (!updated) {
      throw new OrderStatusConflictError(
        "La commande a changé de statut, rechargez la page.",
      );
    }
    let restockedUnits = 0;
    if (order.status === "pending" && to === "cancelled") {
      await releaseOrderStock(tx, orderId);
    } else if (restock && order.status === "paid" && to === "cancelled") {
      restockedUnits = await releaseOrderStock(tx, orderId);
    }
    if (finishesPrep) {
      await tx
        .update(orderItems)
        .set({ preparedQty: sql`${orderItems.qty}` })
        .where(eq(orderItems.orderId, orderId));
    }
    return { ...updated, restockedUnits };
  });
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

/** N° de suivi (mode poste ou mondial_relay) : posé/effacé par l'admin, jamais côté client. */
export async function setTrackingNumber(
  db: Db,
  orderId: string,
  trackingNumber: string | null,
): Promise<void> {
  const updated = await db
    .update(orders)
    .set({ trackingNumber })
    .where(and(eq(orders.id, orderId), inArray(orders.fulfillment, ["poste", "mondial_relay"])))
    .returning({ id: orders.id });
  if (updated.length === 0) {
    throw new Error("Commande introuvable ou sans expédition.");
  }
}
