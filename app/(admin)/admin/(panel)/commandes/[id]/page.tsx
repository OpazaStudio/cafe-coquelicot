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
import { StatusBadge } from "../status-badge";
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
        <Link href="/admin/commandes" className="text-stone-500 hover:underline">
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
          <section className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Articles
            </h2>
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span>
                    <span className="font-semibold">{item.nameSnapshot}</span>{" "}
                    <span className="text-stone-500">× {item.qty}</span>
                  </span>
                  <span className="font-medium">
                    {formatEuros(item.priceCentsSnapshot * item.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 flex flex-col gap-1.5 border-t border-stone-200 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Sous-total</dt>
                <dd>{formatEuros(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">Expédition</dt>
                <dd>
                  {order.deliveryFeeCents > 0
                    ? formatEuros(order.deliveryFeeCents)
                    : "Retrait atelier — offert"}
                </dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatEuros(order.totalCents)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Changer le statut
            </h2>
            <StatusActions
              orderId={order.id}
              status={order.status}
              fulfillment={order.fulfillment}
            />
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Client
            </h2>
            <p className="font-semibold">{order.customerName}</p>
            <p className="text-stone-600">{order.customerEmail}</p>
            {order.customerPhone && (
              <p className="text-stone-600">{order.customerPhone}</p>
            )}
            <div className="mt-4 border-t border-stone-200 pt-4">
              <p className="mb-1 font-medium">
                {order.fulfillment === "poste"
                  ? "Envoi par la poste"
                  : "Retrait atelier"}
              </p>
              {order.fulfillment === "poste" && (
                <p className="text-stone-600">
                  {order.shippingAddress}
                  <br />
                  {order.shippingPostalCode} {order.shippingCity}
                  {order.shippingCountry &&
                    isShippingCountry(order.shippingCountry) &&
                    order.shippingCountry !== "FR" && (
                      <> — {SHIPPING_COUNTRY_LABELS[order.shippingCountry]}</>
                    )}
                </p>
              )}
              {order.deliveryDate && (
                <p className="mt-1 text-stone-600">
                  Date souhaitée : {order.deliveryDate}
                </p>
              )}
            </div>
            {order.fulfillment === "poste" && (
              <div className="mt-4 border-t border-stone-200 pt-4">
                <p className="mb-2 font-medium">Suivi Colissimo</p>
                <TrackingForm
                  orderId={order.id}
                  trackingNumber={order.trackingNumber}
                />
              </div>
            )}
            {order.cardMessage && (
              <div className="mt-4 border-t border-stone-200 pt-4">
                <p className="mb-1 font-medium">Message pour la carte</p>
                <p className="whitespace-pre-line text-stone-600">
                  « {order.cardMessage} »
                </p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Paiement
            </h2>
            <p className="text-stone-600">
              Passée le {dateFmt.format(order.createdAt)}
            </p>
            {order.stripeSessionId && (
              <p className="mt-2 break-all text-xs text-stone-400">
                Session : {order.stripeSessionId}
              </p>
            )}
            {order.stripePaymentIntent && (
              <p className="mt-1 break-all text-xs text-stone-400">
                PaymentIntent : {order.stripePaymentIntent}
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
