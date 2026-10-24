// Webhook Stripe : source de vérité du passage pending → paid.
// La page /commande/confirmee fait le même marquage en filet de sécurité
// (idempotent) pour le dev local sans `stripe listen`.
import type Stripe from "stripe";
import { getDb } from "@/lib/db/client";
import { alertPaidOnCancelledOrder } from "@/lib/email/notify-order";
import {
  cancelOrderBySession,
  reconcilePaidSession,
} from "@/lib/orders";
import { applyPaidSideEffects } from "@/lib/orders/paid-side-effects";
import { getStripe } from "@/lib/stripe";

function paymentIntentId(
  pi: string | Stripe.PaymentIntent | null,
): string | undefined {
  return typeof pi === "string" ? pi : (pi?.id ?? undefined);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook non configuré", { status: 500 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Signature absente", { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      secret,
    );
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }

  const db = await getDb();
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const stripePaymentIntent = paymentIntentId(session.payment_intent);
        const verdict = await reconcilePaidSession(
          db,
          session.id,
          stripePaymentIntent,
          session.metadata?.orderId,
        );
        switch (verdict.outcome) {
          case "paid":
            await applyPaidSideEffects(db, verdict.order.id);
            break;
          case "replay":
            break;
          case "paid_on_cancelled":
            console.error("[commande] paiement encaissé sur une commande annulée", {
              number: verdict.order.number,
              orderId: verdict.order.id,
              stripeSessionId: session.id,
              stripePaymentIntent,
            });
            try {
              await alertPaidOnCancelledOrder(verdict.order);
            } catch (err) {
              console.error("[commande] alerte commande annulée payée non envoyée", err);
            }
            break;
          case "unknown":
            console.error("[commande] paiement sans commande réconciliable", {
              stripeSessionId: session.id,
              stripePaymentIntent,
            });
            break;
        }
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      try {
        await cancelOrderBySession(
          db,
          event.data.object.id,
          event.data.object.metadata?.orderId,
        );
      } catch (err) {
        console.error(
          "[commande] annulation impossible, aucune modification appliquée (statut et stock inchangés)",
          {
            stripeSessionId: event.data.object.id,
            orderId: event.data.object.metadata?.orderId,
          },
          err,
        );
        return new Response("Annulation impossible", { status: 500 });
      }
      break;
    }
    default:
      break;
  }

  return new Response(null, { status: 200 });
}
