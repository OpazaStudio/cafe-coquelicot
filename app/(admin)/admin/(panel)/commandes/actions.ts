"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { verifySession } from "@/lib/auth/dal";
import { type Db, getDb } from "@/lib/db/client";
import { orderStatus, prepStatusEnum } from "@/lib/db/schema";
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
import { expireSessionForCancel } from "@/lib/stripe-session";

const InputSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(orderStatus.enumValues),
});

export type StatusActionState = { error: string } | undefined;

const ALREADY_PAID_MESSAGE =
  "Cette commande a déjà été payée chez Stripe ; elle a été passée en « Payée » au lieu d'être annulée.";
const PAID_NOT_RECONCILED_MESSAGE =
  "Stripe a encaissé un paiement sur cette commande, mais la boutique n'a pas pu le rattacher : vérifiez la commande dans Stripe. Cette demande d'annulation n'a pas été appliquée.";
const AWAITING_ASYNC_MESSAGE =
  "Un paiement est en cours sur cette commande. Réessayez plus tard.";
const UNREACHABLE_MESSAGE =
  "Stripe est injoignable : l'annulation n'a pas été appliquée.";

function revalidateOrderViews(orderId: string) {
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderId}`);
  revalidatePath("/admin");
}

async function stripeCancellationRefusal(
  db: Db,
  orderId: string,
): Promise<StatusActionState> {
  const found = await getOrderWithItems(db, orderId);
  if (found?.order.status !== "pending") return undefined;

  const { order } = found;
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

export async function changeOrderStatus(
  orderId: string,
  to: string,
): Promise<StatusActionState> {
  await verifySession();
  const parsed = InputSchema.safeParse({ orderId, to });
  if (!parsed.success) {
    return { error: "Requête invalide." };
  }
  try {
    const db = await getDb();
    if (parsed.data.to === "cancelled") {
      const refusal = await stripeCancellationRefusal(db, parsed.data.orderId);
      if (refusal) {
        revalidateOrderViews(orderId);
        return refusal;
      }
    }
    await updateOrderStatus(db, parsed.data.orderId, parsed.data.to);
  } catch (err) {
    revalidateOrderViews(orderId);
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }
  revalidateOrderViews(orderId);
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
