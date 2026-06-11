import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { CATEGORY_LABELS } from "@/lib/categories";
import { getAllProductRows } from "@/lib/products";
import { formatEuros } from "@/lib/money";
import { Bouquet } from "@/components/illustrations";
import { deleteProduct, setProductActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProduitsPage() {
  await verifySession();
  const rows = await getAllProductRows();

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produits</h1>
          <p className="text-sm text-stone-500">
            {rows.length} produit{rows.length > 1 ? "s" : ""} —{" "}
            {rows.filter((r) => r.active).length} visible
            {rows.filter((r) => r.active).length > 1 ? "s" : ""} en boutique
          </p>
        </div>
        <Link
          href="/admin/produits/nouveau"
          className="rounded-lg bg-wine px-4 py-2.5 text-sm font-semibold text-linen transition hover:bg-wine-dark"
        >
          + Nouveau produit
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Prix</th>
              <th className="px-4 py-3 font-medium">Badge</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                data-testid={`product-row-${p.slug}`}
                className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 text-wine/80 [&_svg]:h-full [&_svg]:w-full">
                      <Bouquet variant={p.illustrationVariant} />
                    </div>
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-stone-500">{p.tag}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {CATEGORY_LABELS[p.category]}
                </td>
                <td className="px-4 py-3 font-medium">
                  {formatEuros(p.priceCents)}
                </td>
                <td className="px-4 py-3 text-stone-600">{p.badge ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.active
                        ? "bg-green-100 text-green-800"
                        : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    {p.active ? "En ligne" : "Masqué"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/produits/${p.id}`}
                      className="rounded-md px-2.5 py-1.5 text-sm font-medium text-wine hover:bg-wine/10"
                    >
                      Modifier
                    </Link>
                    <form action={setProductActive.bind(null, p.id, !p.active)}>
                      <button
                        type="submit"
                        className="rounded-md px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                      >
                        {p.active ? "Masquer" : "Publier"}
                      </button>
                    </form>
                    <form action={deleteProduct.bind(null, p.id)}>
                      <button
                        type="submit"
                        className="rounded-md px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
