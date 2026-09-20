import type { Metadata } from "next";
import { ConfirmationView, type ConfirmationState } from "@/components/views/confirmation-view";
import { getDb } from "@/lib/db/client";
import { composeItemName } from "@/lib/item-label";
import {
  getOrderBySessionId,
  markOrderPaidBySession,
} from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { getPageContent } from "@/lib/content/server";
import { getSettings, DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Commande confirmée",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadSettings(): Promise<Settings> {
  try {
    return await getSettings();
  } catch (err) {
    console.error("[confirmation] lecture des paramètres impossible", err);
    return DEFAULT_SETTINGS;
  }
}

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
          session.metadata?.orderId,
        );
        if (paid) {
          try {
            const { ensureRelayShipment } = await import("@/lib/mondial-relay/ensure-shipment");
            await ensureRelayShipment(db, paid.id);
          } catch (err) {
            console.error("[mondial-relay] étiquette non générée (confirmation)", err);
          }
          try {
            const { notifyOrderPaid } = await import("@/lib/email/notify-order");
            await notifyOrderPaid(db, paid.id);
          } catch (err) {
            console.error("[commande] e-mails non envoyés (confirmation)", err);
          }
        }
      }
    } catch {
      // API injoignable ou session inconnue : on retombe sur l'état en base.
    }
    data = await getOrderBySessionId(db, sessionId);
  }

  const [content, chrome, settings] = await Promise.all([
    getPageContent("confirmation"),
    getPageContent("site"),
    loadSettings(),
  ]);
  const vars = {
    adresse: [settings.address_street, [settings.address_postal_code, settings.address_city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    contact: settings.contact_email,
  };
  const state: ConfirmationState =
    data && data.order.status !== "pending" && data.order.status !== "cancelled"
      ? {
          kind: "paid",
          number: data.order.number,
          totalCents: data.order.totalCents,
          deliveryFeeCents: data.order.deliveryFeeCents,
          cardFeeCents: data.order.cardFeeCents,
          customerEmail: data.order.customerEmail,
          fulfillment: data.order.fulfillment,
          items: data.items.map((item) => ({
            id: item.id,
            label: composeItemName(item.nameSnapshot, item.sizeLabelSnapshot, item.colorLabelSnapshot),
            qty: item.qty,
            priceCents: item.priceCentsSnapshot,
            productId: item.productId,
            nameSnapshot: item.nameSnapshot,
            sizeLabelSnapshot: item.sizeLabelSnapshot,
            colorLabelSnapshot: item.colorLabelSnapshot,
          })),
        }
      : data
        ? { kind: "pending", number: data.order.number }
        : { kind: "notFound" };

  return <ConfirmationView content={content} chrome={chrome} state={state} vars={vars} />;
}
