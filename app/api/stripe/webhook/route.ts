// Webhook Stripe : source de vérité du passage pending → paid.
// La page /commande/confirmee fait le même marquage en filet de sécurité
// (idempotent) pour le dev local sans `stripe listen`.
import type Stripe from "stripe";
import { getDb } from "@/lib/db/client";
import { ensureRelayShipment } from "@/lib/mondial-relay/ensure-shipment";
import {
  cancelOrderBySession,
  markOrderPaidBySession,
} from "@/lib/orders";
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
        const order = await markOrderPaidBySession(
          db,
          session.id,
          paymentIntentId(session.payment_intent),
        );
        if (order) {
          try {
            await ensureRelayShipment(db, order.id);
          } catch (err) {
            console.error("[mondial-relay] étiquette non générée (webhook)", err);
          }
        }
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      await cancelOrderBySession(db, event.data.object.id);
      break;
    }
    default:
      break;
  }

  return new Response(null, { status: 200 });
}
