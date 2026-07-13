import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { ClearCart } from "@/components/clear-cart";
import { PurchaseTracking } from "@/components/purchase-tracking";
import { ArrowRight } from "@/components/illustrations";
import { getDb } from "@/lib/db/client";
import { composeItemName } from "@/lib/item-label";
import { formatEuros } from "@/lib/money";
import {
  getOrderBySessionId,
  markOrderPaidBySession,
} from "@/lib/orders";
import { getStripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Commande confirmée — Coquelicot · Fleuriste La Rochelle",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams,
}: PageProps<"/commande/confirmee">) {
  const { session_id: raw } = await searchParams;
  const sessionId = typeof raw === "string" ? raw : undefined;

  let data: Awaited<ReturnType<typeof getOrderBySessionId>> = null;
  if (sessionId) {
    const db = await getDb();
    // Filet de sécurité sans webhook (dev local) : on interroge Stripe et on
    // marque payé — idempotent, le webhook reste la source de vérité en prod.
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid") {
        const paid = await markOrderPaidBySession(
          db,
          sessionId,
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
        );
        if (paid) {
          try {
            const { ensureRelayShipment } = await import("@/lib/mondial-relay/ensure-shipment");
            await ensureRelayShipment(db, paid.id);
          } catch (err) {
            console.error("[mondial-relay] étiquette non générée (confirmation)", err);
          }
        }
      }
    } catch {
      // API injoignable ou session inconnue : on retombe sur l'état en base.
    }
    data = await getOrderBySessionId(db, sessionId);
  }

  return (
    <>
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="cart-page">
          <div className="container">
            {data && data.order.status !== "pending" && data.order.status !== "cancelled" ? (
              <>
                <ClearCart />
                <PurchaseTracking
                  transactionId={data.order.number}
                  valueCents={data.order.totalCents}
                  shippingCents={data.order.deliveryFeeCents}
                  items={data.items.map((item) => {
                    const variant = [
                      item.sizeLabelSnapshot,
                      item.colorLabelSnapshot,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return {
                      item_id: item.productId ?? item.nameSnapshot,
                      item_name: item.nameSnapshot,
                      price: item.priceCentsSnapshot / 100,
                      quantity: item.qty,
                      ...(variant ? { item_variant: variant } : {}),
                    };
                  })}
                />
                <h1 className="display cart-page__title">
                  merci !
                  <span className="script">c&apos;est commandé.</span>
                </h1>
                <div className="confirm-card" data-testid="order-confirmation">
                  <p className="eyebrow">
                    Commande {data.order.number} — payée
                  </p>
                  <ul className="confirm-card__items">
                    {data.items.map((item) => (
                      <li key={item.id} className="cart-summary__row">
                        <span>
                          {composeItemName(
                            item.nameSnapshot,
                            item.sizeLabelSnapshot,
                            item.colorLabelSnapshot,
                          )}{" "}
                          × {item.qty}
                        </span>
                        <span>
                          {formatEuros(item.priceCentsSnapshot * item.qty)}
                        </span>
                      </li>
                    ))}
                    {data.order.deliveryFeeCents > 0 && (
                      <li className="cart-summary__row">
                        <span>Envoi postal</span>
                        <span>{formatEuros(data.order.deliveryFeeCents)}</span>
                      </li>
                    )}
                    {data.order.cardFeeCents > 0 && (
                      <li className="cart-summary__row">
                        <span>Carte manuscrite</span>
                        <span>{formatEuros(data.order.cardFeeCents)}</span>
                      </li>
                    )}
                  </ul>
                  <div className="cart-summary__row cart-summary__row--total">
                    <span>Total payé</span>
                    <span>{formatEuros(data.order.totalCents)}</span>
                  </div>
                  <p className="cart-summary__note">
                    Un email de confirmation Stripe a été envoyé à{" "}
                    {data.order.customerEmail}.{" "}
                    {data.order.fulfillment === "poste"
                      ? "Votre commande partira par la poste très vite."
                      : data.order.fulfillment === "mondial_relay"
                        ? "Votre commande partira en point relais Mondial Relay très vite."
                        : "Votre commande vous attendra à l'atelier, 12 rue du Gabut."}
                  </p>
                </div>
              </>
            ) : data ? (
              <>
                <h1 className="display cart-page__title">
                  un instant
                  <span className="script">paiement en cours…</span>
                </h1>
                <p className="body body--lg">
                  Le paiement de la commande {data.order.number} est en cours de
                  validation. Rechargez cette page dans un instant.
                </p>
              </>
            ) : (
              <>
                <h1 className="display cart-page__title">
                  hmm…
                  <span className="script">commande introuvable</span>
                </h1>
                <p className="body body--lg">
                  Nous ne retrouvons pas cette commande. Si vous avez été
                  débité·e, écrivez-nous : bonjour@coquelicot-lr.fr.
                </p>
              </>
            )}
            <p style={{ marginTop: 40 }}>
              <Link href="/boutique" className="link-arrow">
                Retour à la boutique <ArrowRight />
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
