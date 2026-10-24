import type { Db } from "@/lib/db/client";
import { getOrderWithItems, setOrderStatusIfUnchanged } from "@/lib/orders";
import { expireSessionForCancel } from "@/lib/stripe-session";

export async function abandonPendingOrder(db: Db, orderId: string): Promise<void> {
  try {
    const found = await getOrderWithItems(db, orderId);
    if (found?.order.status !== "pending") return;

    const stripeSessionId = found.order.stripeSessionId;
    const guard = await expireSessionForCancel(stripeSessionId);
    switch (guard.outcome) {
      case "no_session":
      case "expired":
        await setOrderStatusIfUnchanged(db, orderId, "pending", "cancelled");
        return;
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
    console.error("[checkout] compensation impossible", err);
  }
}
