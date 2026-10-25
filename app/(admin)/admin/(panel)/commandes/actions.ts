"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { verifySession } from "@/lib/auth/dal";
import { type Db, getDb } from "@/lib/db/client";
import { orderStatus, prepStatusEnum, type OrderRow } from "@/lib/db/schema";
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";
import {
  getOrderWithItems,
  reconcilePaidSession,
  setItemPreparedQty,
  setPrepStatus,
  setTrackingNumber,
  updateOrderStatus,
} from "@/lib/orders";
import { applyPaidSideEffects } from "@/lib/orders/paid-side-effects";
import { staleStatusMessage } from "@/lib/order-status";
import { restockableUnits } from "@/lib/stock/release";
import { revalidateAvailability } from "@/lib/stock/revalidate";
import { expireSessionForCancel } from "@/lib/stripe-session";

const InputSchema = z.object({
  orderId: z.uuid(),
  from: z.enum(orderStatus.enumValues),
  to: z.enum(orderStatus.enumValues),
  restock: z.boolean(),
});

export type StatusActionState =
  | { error: string; ok?: never }
  | { ok: string; error?: never }
  | undefined;

const ALREADY_PAID_MESSAGE =
  "Cette commande a déjà été payée chez Stripe ; elle a été passée en « Payée » au lieu d'être annulée.";
const PAID_NOT_RECONCILED_MESSAGE =
  "Stripe a encaissé un paiement sur cette commande, mais la boutique n'a pas pu le rattacher : vérifiez la commande dans Stripe. Cette demande d'annulation n'a pas été appliquée.";
const AWAITING_ASYNC_MESSAGE =
  "La session de paiement de cette commande porte un paiement asynchrone dont la boutique ne connaît pas l'issue : l'annulation n'a pas été appliquée.";
const UNREACHABLE_MESSAGE =
  "La session de paiement n'a pas pu être fermée : le client pourrait encore payer cette commande, donc l'annulation n'a pas été appliquée.";
const MANUAL_PAID_DOUBLE_MESSAGE =
  "La commande est passée en « Payée », mais Stripe avait déjà encaissé un paiement sur sa session, que la boutique n'a pas rattaché à la commande. Dans Stripe, ce paiement porte le numéro de cette commande. Si vous veniez d'encaisser autrement, elle est payée deux fois.";
const MANUAL_PAID_ASYNC_MESSAGE =
  "La commande est passée en « Payée », mais sa session de paiement porte un paiement asynchrone dont la boutique ne connaît pas l'issue : s'il aboutit, Stripe encaissera en plus de ce que vous venez d'enregistrer. Ne remettez pas en stock les unités qu'elle réserve.";
const MANUAL_PAID_UNREACHABLE_MESSAGE =
  "La commande est passée en « Payée », mais sa session de paiement n'a pas pu être fermée : le client peut encore la payer. Vérifiez cette commande dans Stripe, et ne remettez pas en stock les unités qu'elle réserve.";
const RESTOCK_ASYNC_MESSAGE =
  "La session de paiement de cette commande porte un paiement asynchrone dont la boutique ne connaît pas l'issue : les unités ne peuvent pas repartir en vente tant qu'elle n'est pas tranchée.";
const RESTOCK_UNREACHABLE_MESSAGE =
  "La session de paiement n'a pas pu être fermée : sans la preuve qu'elle l'est, les unités ne peuvent pas repartir en vente. Rien n'a été modifié.";
const UNATTACHED_PAYMENT_NOTE =
  "Attention : Stripe a encaissé sur cette commande un paiement qui ne lui a jamais été rattaché. Dans Stripe, il porte le numéro de cette commande.";

function cancelledPaidMessage(
  restocked: number,
  held: number,
  viaStripe: boolean,
  unattached: boolean,
): string {
  const refund = viaStripe
    ? "le paiement reste encaissé chez Stripe et n'est pas remboursé automatiquement"
    : "le paiement déjà reçu n'est pas remboursé automatiquement";
  const stock =
    restocked > 0
      ? restocked === 1
        ? "1 unité est remise en stock"
        : `${restocked} unités sont remises en stock`
      : held > 0
        ? held === 1
          ? "l'unité réservée n'est pas remise en stock"
          : `les ${held} unités réservées ne sont pas remises en stock`
        : null;
  const sentence =
    stock === null
      ? `Commande annulée : ${refund}.`
      : `Commande annulée : ${stock}, et ${refund}.`;
  return unattached ? `${sentence} ${UNATTACHED_PAYMENT_NOTE}` : sentence;
}

function revalidateOrderViews(orderId: string) {
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  revalidatePath("/admin");
}

async function stripeCancellationRefusal(
  db: Db,
  order: OrderRow,
): Promise<StatusActionState> {
  if (order.status !== "pending") return undefined;

  const sessionId = order.stripeSessionId;
  const guard = await expireSessionForCancel(sessionId);
  switch (guard.outcome) {
    case "no_session":
    case "expired":
      return undefined;
    case "already_paid": {
      if (sessionId === null) return { error: PAID_NOT_RECONCILED_MESSAGE };
      const verdict = await reconcilePaidSession(
        db,
        sessionId,
        guard.paymentIntent,
        order.id,
      );
      if (verdict.outcome === "paid") {
        await applyPaidSideEffects(db, verdict.order.id);
      } else if (verdict.outcome !== "replay") {
        console.error("[commande] paiement Stripe non réconcilié à l'annulation", {
          orderId: order.id,
          stripeSessionId: sessionId,
          outcome: verdict.outcome,
        });
        return { error: PAID_NOT_RECONCILED_MESSAGE };
      }
      return { error: ALREADY_PAID_MESSAGE };
    }
    case "awaiting_async":
      return { error: AWAITING_ASYNC_MESSAGE };
    case "unreachable":
      console.error("[commande] session Stripe injoignable, annulation refusée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        cause: guard.cause,
      });
      return { error: UNREACHABLE_MESSAGE };
    default: {
      const unhandled: never = guard;
      console.error("[commande] verdict Stripe inattendu, annulation refusée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        verdict: unhandled,
      });
      return { error: UNREACHABLE_MESSAGE };
    }
  }
}

async function neutralizeAfterManualPaid(
  order: OrderRow,
): Promise<string | undefined> {
  const sessionId = order.stripeSessionId;
  const guard = await expireSessionForCancel(sessionId);
  switch (guard.outcome) {
    case "no_session":
    case "expired":
      return undefined;
    case "already_paid":
      console.error("[commande] paiement Stripe non rattaché après un passage manuel en payée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        paymentIntent: guard.paymentIntent,
      });
      return MANUAL_PAID_DOUBLE_MESSAGE;
    case "awaiting_async":
      return MANUAL_PAID_ASYNC_MESSAGE;
    case "unreachable":
      console.error("[commande] session Stripe non fermée après un passage manuel en payée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        cause: guard.cause,
      });
      return MANUAL_PAID_UNREACHABLE_MESSAGE;
    default: {
      const unhandled: never = guard;
      console.error("[commande] verdict Stripe inattendu après un passage manuel en payée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        verdict: unhandled,
      });
      return MANUAL_PAID_UNREACHABLE_MESSAGE;
    }
  }
}

type RestockCheck = { refusal?: StatusActionState; unattached?: boolean };

async function stripeRestockRefusal(order: OrderRow): Promise<RestockCheck> {
  const sessionId = order.stripeSessionId;
  const guard = await expireSessionForCancel(sessionId);
  switch (guard.outcome) {
    case "no_session":
    case "expired":
      return {};
    case "already_paid":
      console.error(
        "[commande] paiement Stripe non rattaché sur une commande remise en stock",
        {
          orderId: order.id,
          stripeSessionId: sessionId,
          paymentIntent: guard.paymentIntent,
        },
      );
      return { unattached: true };
    case "awaiting_async":
      return { refusal: { error: RESTOCK_ASYNC_MESSAGE } };
    case "unreachable":
      console.error("[commande] session Stripe injoignable, remise en stock refusée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        cause: guard.cause,
      });
      return { refusal: { error: RESTOCK_UNREACHABLE_MESSAGE } };
    default: {
      const unhandled: never = guard;
      console.error("[commande] verdict Stripe inattendu, remise en stock refusée", {
        orderId: order.id,
        stripeSessionId: sessionId,
        verdict: unhandled,
      });
      return { refusal: { error: RESTOCK_UNREACHABLE_MESSAGE } };
    }
  }
}

export async function changeOrderStatus(
  orderId: string,
  from: string,
  to: string,
  restock = false,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = InputSchema.safeParse({ orderId, from, to, restock });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  const { orderId: id, from: shown, to: target, restock: wanted } = parsed.data;
  const cancelling = target === "cancelled";
  const wasPaid = shown === "paid" || shown === "preparing";
  let restocked = 0;
  let held = 0;
  let viaStripe = false;
  let unattached = false;
  let warning: string | undefined;
  try {
    const db = await getDb();
    const found = await getOrderWithItems(db, id);
    if (found) {
      const { order } = found;
      if (order.status !== shown) {
        revalidateOrderViews(orderId);
        return { error: staleStatusMessage(order.status, shown) };
      }
      viaStripe = order.stripePaymentIntent !== null;
      if (cancelling) {
        const refusal = await stripeCancellationRefusal(db, order);
        if (refusal) {
          revalidateOrderViews(orderId);
          return refusal;
        }
        if (wanted && shown === "paid" && order.stripePaymentIntent === null) {
          const check = await stripeRestockRefusal(order);
          if (check.refusal) {
            revalidateOrderViews(orderId);
            return check.refusal;
          }
          unattached = check.unattached === true;
        }
        if (wasPaid) held = await restockableUnits(db, id);
      }
    }
    const changed = await updateOrderStatus(db, id, target, wanted, shown);
    restocked = changed.restockedUnits;
    if (target === "paid") {
      warning = await neutralizeAfterManualPaid(changed);
    }
    if (cancelling) {
      await revalidateAvailability([id], db);
    }
  } catch (err) {
    revalidateOrderViews(orderId);
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidateOrderViews(orderId);
  if (warning !== undefined) {
    return { error: warning };
  }
  if (cancelling && wasPaid) {
    const message = cancelledPaidMessage(restocked, held, viaStripe, unattached);
    return unattached ? { error: message } : { ok: message };
  }
  return undefined;
}

const ItemPrepSchema = z.object({
  orderItemId: z.uuid(),
  preparedQty: z.number().int().min(0).max(99),
});

export async function setItemPrepared(
  orderItemId: string,
  preparedQty: number,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = ItemPrepSchema.safeParse({ orderItemId, preparedQty });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  let orderId: string;
  try {
    const db = await getDb();
    const updated = await setItemPreparedQty(
      db,
      parsed.data.orderItemId,
      parsed.data.preparedQty,
    );
    orderId = updated.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}

const TrackingSchema = z.object({
  orderId: z.uuid(),
  trackingNumber: z.string().trim().max(40),
});

export async function saveTrackingNumber(
  orderId: string,
  trackingNumber: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = TrackingSchema.safeParse({ orderId, trackingNumber });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    await setTrackingNumber(
      db,
      parsed.data.orderId,
      parsed.data.trackingNumber || null,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}

export async function generateRelayLabel(orderId: string): Promise<StatusActionState> {
  await verifySession();
  if (!z.uuid().safeParse(orderId).success) return { error: "Requête invalide." };
  try {
    const db = await getDb();
    const res = await ensureRelayShipment(db, orderId);
    if (!res) {
      const existing = await getOrderWithItems(db, orderId);
      if (existing?.order.relayShipmentNumber) {
        // Étiquette déjà créée : succès idempotent, on rafraîchit juste l'affichage.
        revalidatePath(`/admin/commandes/${orderId}`);
        return undefined;
      }
      return {
        error:
          "Étiquette non générée (point relais manquant ou API Mondial Relay non configurée).",
      };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur Mondial Relay." };
  }
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}

const PrepSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(prepStatusEnum.enumValues),
});

export async function changePrepStatus(
  orderId: string,
  to: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = PrepSchema.safeParse({ orderId, to });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    await setPrepStatus(db, parsed.data.orderId, parsed.data.to);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  return undefined;
}
