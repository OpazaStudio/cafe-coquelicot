import type { Db } from "@/lib/db/client";
import { getOrderWithItems, setOrderStatusIfUnchanged } from "@/lib/orders";
import { releaseOrderStock } from "@/lib/stock/release";
import { reservedStockKey, stockKeyToken } from "@/lib/stock/key-order";
import { expireSessionForCancel } from "@/lib/stripe-session";

export type AbandonHeldOutcome =
  | "held_paid"
  | "held_payment_pending"
  | "held_release_failed";

export type AbandonVerdict =
  | { outcome: "released" }
  | { outcome: "not_pending" }
  | { outcome: AbandonHeldOutcome; heldKeys: string[] };

export async function abandonPendingOrder(
  db: Db,
  orderId: string,
): Promise<AbandonVerdict> {
  try {
    const found = await getOrderWithItems(db, orderId);
    if (found?.order.status !== "pending") return { outcome: "not_pending" };

    const heldKeys = found.items
      .filter((item) => item.stockReservedQty > 0)
      .map((item) =>
        reservedStockKey(item.stockReservedSizeId, item.stockReservedProductId),
      )
      .filter((key): key is NonNullable<typeof key> => key !== null)
      .map(stockKeyToken);
    const stripeSessionId = found.order.stripeSessionId;
    const guard = await expireSessionForCancel(stripeSessionId);
    switch (guard.outcome) {
      case "no_session":
      case "expired": {
        const cancelAndRelease = () =>
          db.transaction(async (tx) => {
            const cancelled = await setOrderStatusIfUnchanged(
              tx,
              orderId,
              "pending",
              "cancelled",
            );
            if (cancelled) await releaseOrderStock(tx, orderId);
            return cancelled !== null;
          });
        let cancelled: boolean;
        try {
          cancelled = await cancelAndRelease();
        } catch (firstCause) {
          try {
            cancelled = await cancelAndRelease();
          } catch (cause) {
            console.error(
              "[checkout] stock non libéré après deux tentatives, commande laissée en attente",
              {
                orderId,
                stripeSessionId,
                reserved: found.items
                  .filter((item) => item.stockReservedQty > 0)
                  .map((item) => ({
                    orderItemId: item.id,
                    stockReservedQty: item.stockReservedQty,
                    stockReservedSizeId: item.stockReservedSizeId,
                    stockReservedProductId: item.stockReservedProductId,
                  })),
                firstCause,
                cause,
              },
            );
            return { outcome: "held_release_failed", heldKeys };
          }
        }
        return cancelled ? { outcome: "released" } : { outcome: "not_pending" };
      }
      case "unreachable":
        console.error("[checkout] session Stripe injoignable, commande laissée en attente", {
          orderId,
          stripeSessionId,
          cause: guard.cause,
        });
        return { outcome: "held_release_failed", heldKeys };
      case "already_paid":
      case "awaiting_async":
        console.error("[checkout] session Stripe encore exploitable, commande laissée en attente", {
          orderId,
          stripeSessionId,
          outcome: guard.outcome,
        });
        return {
          outcome:
            guard.outcome === "already_paid" ? "held_paid" : "held_payment_pending",
          heldKeys,
        };
      default: {
        const unhandled: never = guard;
        console.error("[checkout] verdict Stripe inattendu, commande laissée en attente", {
          orderId,
          stripeSessionId,
          verdict: unhandled,
        });
        return { outcome: "held_release_failed", heldKeys };
      }
    }
  } catch (err) {
    console.error("[checkout] compensation impossible", { orderId }, err);
    return { outcome: "held_release_failed", heldKeys: [] };
  }
}
