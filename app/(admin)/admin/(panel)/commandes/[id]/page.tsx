import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { formatEuros } from "@/lib/money";
import { getOrderWithItems } from "@/lib/orders";
import {
  SHIPPING_COUNTRY_LABELS,
  isShippingCountry,
} from "@/lib/order-status";
import { Panel } from "../../ui";
import { StatusBadge } from "../status-badge";
import { LabelButton } from "./label-button";
import { StatusActions } from "./status-actions";
import { TrackingForm } from "./tracking-form";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CommandeDetailPage({
  params,
}: PageProps<"/admin/commandes/[id]">) {
  await verifySession();
  const { id } = await params;
  const db = await getDb();
  const data = await getOrderWithItems(db, id);
  if (!data) notFound();
  const { order, items } = data;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/commandes" className="text-muted hover:underline">
          ← Commandes
        </Link>
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Commande {order.number}
        </h1>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid max-w-4xl gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Articles">
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span>
                    <span className="font-semibold">{item.nameSnapshot}</span>{" "}
                    <span className="text-muted">× {item.qty}</span>
                  </span>
                  <span className="font-medium">
                    {formatEuros(item.priceCentsSnapshot * item.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Sous-total</dt>
                <dd>{formatEuros(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Expédition</dt>
                <dd>
                  {order.deliveryFeeCents > 0
                    ? formatEuros(order.deliveryFeeCents)
                    : "offert"}
                </dd>
              </div>
              {order.cardFeeCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Carte manuscrite</dt>
                  <dd>{formatEuros(order.cardFeeCents)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatEuros(order.totalCents)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Changer le statut">
            <StatusActions
              orderId={order.id}
              status={order.status}
              fulfillment={order.fulfillment}
            />
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Client" className="text-sm">
            <p className="font-semibold">{order.customerName}</p>
            <p className="text-muted">{order.customerEmail}</p>
            {order.customerPhone && (
              <p className="text-muted">{order.customerPhone}</p>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-1 font-medium">
                {order.fulfillment === "mondial_relay"
                  ? "Point relais Mondial Relay"
                  : order.fulfillment === "poste"
                    ? "Envoi par la poste"
                    : "Retrait atelier"}
              </p>
              {(order.fulfillment === "mondial_relay" || order.fulfillment === "poste") && (
                <p className="whitespace-pre-line text-muted">
                  {order.relayPointName && <><strong>{order.relayPointName}</strong><br /></>}
                  {order.shippingAddress}
                  {(order.shippingPostalCode || order.shippingCity) && (
                    <><br />{order.shippingPostalCode} {order.shippingCity}</>
                  )}
                  {order.fulfillment === "poste" && order.shippingCountry &&
                    isShippingCountry(order.shippingCountry) &&
                    order.shippingCountry !== "FR" && (
                      <> — {SHIPPING_COUNTRY_LABELS[order.shippingCountry]}</>
                    )}
                  {order.relayPointId && <><br /><span className="text-xs text-muted">ID relais : {order.relayPointId}</span></>}
                </p>
              )}
              {order.deliveryDate && (
                <p className="mt-1 text-muted">
                  Date souhaitée : {order.deliveryDate}
                </p>
              )}
            </div>
            {order.fulfillment === "mondial_relay" && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 font-medium">Étiquette Mondial Relay</p>
                <LabelButton orderId={order.id} hasLabel={!!order.relayLabelUrl} />
                {order.relayLabelUrl && (
                  <p className="mt-2">
                    <a href={order.relayLabelUrl} target="_blank" rel="noopener noreferrer" className="text-wine hover:underline">
                      Télécharger l&apos;étiquette (PDF)
                    </a>
                  </p>
                )}
                <div className="mt-3">
                  <p className="mb-2 font-medium">N° de suivi</p>
                  <TrackingForm orderId={order.id} trackingNumber={order.trackingNumber} />
                </div>
              </div>
            )}
            {order.cardMessage && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-1 font-medium">Message pour la carte</p>
                <p className="whitespace-pre-line text-muted">
                  « {order.cardMessage} »
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Paiement" className="text-sm">
            <p className="text-muted">
              Passée le {dateFmt.format(order.createdAt)}
            </p>
            {order.stripeSessionId && (
              <p className="mt-2 break-all text-xs text-muted">
                Session : {order.stripeSessionId}
              </p>
            )}
            {order.stripePaymentIntent && (
              <p className="mt-1 break-all text-xs text-muted">
                PaymentIntent : {order.stripePaymentIntent}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
