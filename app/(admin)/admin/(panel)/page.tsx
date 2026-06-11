import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { formatEuros } from "@/lib/money";
import {
  getKpis,
  getRecentOrders,
  getRevenueByDay,
  getTopProducts,
} from "@/lib/stats";
import { StatusBadge } from "./commandes/status-badge";
import { RevenueChart } from "./revenue-chart";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function KpiCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

export default async function AdminDashboardPage() {
  await verifySession();
  const db = await getDb();
  const [kpis, byDay, top, recent] = await Promise.all([
    getKpis(db),
    getRevenueByDay(db, 30),
    getTopProducts(db, 5),
    getRecentOrders(db, 5),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-stone-500">
          Chiffres sur les commandes encaissées (payées, en préparation ou
          livrées).
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Chiffre d'affaires"
          value={formatEuros(kpis.revenueCents)}
          testId="kpi-revenue"
        />
        <KpiCard
          label="Commandes"
          value={String(kpis.orderCount)}
          testId="kpi-orders"
        />
        <KpiCard
          label="Panier moyen"
          value={formatEuros(kpis.averageOrderCents)}
          testId="kpi-aov"
        />
        <KpiCard
          label="Articles vendus"
          value={String(kpis.itemsSold)}
          testId="kpi-items"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
            CA des 30 derniers jours
          </h2>
          <RevenueChart data={byDay} />
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Top produits
            </h2>
            {top.length === 0 ? (
              <p className="text-sm text-stone-500">
                Pas encore de ventes — le classement apparaîtra ici.
              </p>
            ) : (
              <ol className="flex flex-col gap-3" data-testid="top-products">
                {top.map((p, i) => (
                  <li
                    key={p.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      <span className="mr-2 inline-block w-5 text-right font-semibold text-stone-400">
                        {i + 1}.
                      </span>
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-stone-500">× {p.qty}</span>
                    </span>
                    <span className="font-medium">
                      {formatEuros(p.revenueCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Dernières commandes
            </h2>
            {recent.length === 0 ? (
              <p className="text-sm text-stone-500">Aucune commande.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recent.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/admin/commandes/${o.id}`}
                      className="font-medium text-wine hover:underline"
                    >
                      {o.number}
                    </Link>
                    <span className="text-xs text-stone-500">
                      {dateFmt.format(o.createdAt)}
                    </span>
                    <span className="font-medium">{formatEuros(o.totalCents)}</span>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
