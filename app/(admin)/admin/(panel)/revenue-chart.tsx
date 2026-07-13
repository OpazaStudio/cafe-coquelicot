"use client";

import dynamic from "next/dynamic";
import { formatEuros } from "@/lib/money";
import type { DayPoint } from "@/lib/stats";

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
});

// recharts (lib lourde) sorti du bundle initial du dashboard : chargé côté
// client seulement. La coque ci-dessous (testid + alternative texte) est
// rendue immédiatement, donc l'a11y et les tests ne dépendent pas du chargement.
const RevenueChartImpl = dynamic(() => import("./revenue-chart-impl"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full animate-pulse rounded-lg bg-panel motion-reduce:animate-none"
      aria-hidden="true"
    />
  ),
});

export function RevenueChart({ data }: { data: DayPoint[] }) {
  const points = data.map((d) => ({
    label: dayFmt.format(new Date(`${d.day}T00:00:00`)),
    euros: d.revenueCents / 100,
    commandes: d.orders,
  }));

  const totalCents = data.reduce((s, d) => s + d.revenueCents, 0);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);

  return (
    <div
      className="h-72 w-full"
      data-testid="revenue-chart"
      role="img"
      aria-label={`Histogramme du chiffre d'affaires sur ${data.length} jours : ${formatEuros(totalCents)} au total, ${totalOrders} commande${totalOrders > 1 ? "s" : ""}.`}
    >
      {/* Alternative textuelle pour lecteurs d'écran (le SVG recharts n'est pas lisible). */}
      <table className="sr-only">
        <caption>Chiffre d&apos;affaires par jour</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">CA</th>
            <th scope="col">Commandes</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{formatEuros(d.revenueCents)}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <RevenueChartImpl points={points} />
    </div>
  );
}
