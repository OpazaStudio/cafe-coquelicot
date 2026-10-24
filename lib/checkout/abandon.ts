import type { Db } from "@/lib/db/client";
import { getOrderWithItems, setOrderStatusIfUnchanged } from "@/lib/orders";
import { releaseOrderStock } from "@/lib/stock/release";
import { expireSessionForCancel } from "@/lib/stripe-session";

export async function abandonPendingOrder(db: Db, orderId: string): Promise<void> {
  try {
    const found = await getOrderWithItems(db, orderId);
    if (found?.order.status !== "pending") return;

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
          });
        try {
          await cancelAndRelease();
        } catch (firstCause) {
          try {
            await cancelAndRelease();
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
          }
        }
        return;
      }
      case "unreachable":
        console.error("[checkout] session Stripe injoignable, commande laissée en attente", {
          orderId,
          stripeSessionId,
          cause: guard.cause,
        });
        return;
      case "already_paid":
      case "awaiting_async":
        console.error("[checkout] session Stripe encore exploitable, commande laissée en attente", {
          orderId,
          stripeSessionId,
          outcome: guard.outcome,
        });
        return;
      default: {
        const unhandled: never = guard;
        console.error("[checkout] verdict Stripe inattendu, commande laissée en attente", {
          orderId,
          stripeSessionId,
          verdict: unhandled,
        });
      }
    }
  } catch (err) {
    console.error("[checkout] compensation impossible", { orderId }, err);
  }
}
