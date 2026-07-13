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
import { card, Panel } from "./ui";

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
    <div className={`${card} p-5`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
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
        <p className="text-sm text-muted">
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
        <Panel title="CA des 30 derniers jours">
          <RevenueChart data={byDay} />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Top produits">
            {top.length === 0 ? (
              <p className="text-sm text-muted">
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
                      <span className="mr-2 inline-block w-5 text-right font-semibold text-muted">
                        {i + 1}.
                      </span>
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-muted">× {p.qty}</span>
                    </span>
                    <span className="font-medium">
                      {formatEuros(p.revenueCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Dernières commandes">
            {recent.length === 0 ? (
              <p className="text-sm text-muted">Aucune commande.</p>
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
                    <span className="text-xs text-muted">
                      {dateFmt.format(o.createdAt)}
                    </span>
                    <span className="font-medium">{formatEuros(o.totalCents)}</span>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
