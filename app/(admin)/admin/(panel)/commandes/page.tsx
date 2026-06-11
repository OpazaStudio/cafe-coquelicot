import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { formatEuros } from "@/lib/money";
import { listOrders } from "@/lib/orders";
import { StatusBadge } from "./status-badge";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CommandesPage() {
  await verifySession();
  const db = await getDb();
  const orders = await listOrders(db);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Commandes</h1>
        <p className="text-sm text-stone-500">
          {orders.length} commande{orders.length > 1 ? "s" : ""} au total
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-stone-500">
          Aucune commande pour l&apos;instant — elles apparaîtront ici dès le
          premier paiement Stripe.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3 font-medium">Commande</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  data-testid={`order-row-${o.number}`}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60"
                >
                  <td className="px-4 py-3 font-semibold">{o.number}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {dateFmt.format(o.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.customerName}</div>
                    <div className="text-xs text-stone-500">
                      {o.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {o.fulfillment === "poste" ? "Envoi postal" : "Retrait"}
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
                      className="rounded-md px-2.5 py-1.5 text-sm font-medium text-wine hover:bg-wine/10"
                    >
                      Détail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
