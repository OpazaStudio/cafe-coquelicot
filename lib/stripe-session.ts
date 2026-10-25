import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export type SessionGuard =
  | { outcome: "no_session" }
  | { outcome: "expired" }
  | { outcome: "already_paid"; paymentIntent: string | null }
  | { outcome: "awaiting_async" }
  | { outcome: "unreachable"; cause?: unknown };

function paymentIntentId(
  paymentIntent: Stripe.Checkout.Session["payment_intent"],
): string | null {
  if (typeof paymentIntent === "string") return paymentIntent;
  return paymentIntent?.id ?? null;
}

function classify(session: Stripe.Checkout.Session, cause: unknown): SessionGuard {
  if (session.status === "expired") return { outcome: "expired" };
  if (session.status !== "complete") return { outcome: "unreachable", cause };
  if (session.payment_status === "paid") {
    return {
      outcome: "already_paid",
      paymentIntent: paymentIntentId(session.payment_intent),
    };
  }
  return { outcome: "awaiting_async" };
}

export async function expireSessionForCancel(
  stripeSessionId: string | null,
): Promise<SessionGuard> {
  if (stripeSessionId === null) return { outcome: "no_session" };

  try {
    await getStripe().checkout.sessions.expire(stripeSessionId);
    return { outcome: "expired" };
  } catch (expireError) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(stripeSessionId);
      return classify(session, expireError);
    } catch (retrieveError) {
      return { outcome: "unreachable", cause: retrieveError };
    }
  }
}
