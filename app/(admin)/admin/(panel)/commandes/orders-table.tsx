import Link from "next/link";
import type { OrderRow } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import { FULFILLMENT_LABELS } from "@/lib/order-status";
import { card, rowAction } from "../ui";
import { StatusBadge } from "./status-badge";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return (
      <div className={`${card} p-10 text-center text-muted`}>
        Aucune commande pour l&apos;instant — elles apparaîtront ici dès le
        premier paiement Stripe.
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${card}`}>
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-line bg-panel text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-3 font-medium">Commande</th>
            <th scope="col" className="px-4 py-3 font-medium">Date</th>
            <th scope="col" className="px-4 py-3 font-medium">Client</th>
            <th scope="col" className="px-4 py-3 font-medium">Mode</th>
            <th scope="col" className="px-4 py-3 font-medium">Total</th>
            <th scope="col" className="px-4 py-3 font-medium">Statut</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              data-testid={`order-row-${o.number}`}
              className="border-b border-line-soft last:border-0 hover:bg-panel"
            >
              <td className="px-4 py-3 font-semibold">{o.number}</td>
              <td className="px-4 py-3 text-muted">
                {dateFmt.format(o.createdAt)}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{o.customerName}</div>
                <div className="text-xs text-muted">{o.customerEmail}</div>
              </td>
              <td className="px-4 py-3 text-muted">
                {FULFILLMENT_LABELS[o.fulfillment]}
              </td>
              <td className="px-4 py-3 font-medium">
                {formatEuros(o.totalCents)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={o.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/commandes/${o.id}`}
                  className={`${rowAction} text-wine hover:bg-wine/10`}
                >
                  Détail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
