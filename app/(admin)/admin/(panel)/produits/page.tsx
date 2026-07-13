import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { CATEGORY_LABELS } from "@/lib/categories";
import { getDb } from "@/lib/db/client";
import { listProductsForAdmin } from "@/lib/products";
import { formatEuros } from "@/lib/money";
import { Bouquet } from "@/components/illustrations";
import { btnPrimary, card, Pill, rowAction } from "../ui";
import { deleteProduct, setProductActive } from "./actions";

export const dynamic = "force-dynamic";

function variantSummary(sizeCount: number, colorCount: number): string {
  const parts: string[] = [];
  if (sizeCount > 0) parts.push(`${sizeCount} taille${sizeCount > 1 ? "s" : ""}`);
  if (colorCount > 0) parts.push(`${colorCount} coloris`);
  return parts.length ? parts.join(" · ") : "—";
}

export default async function ProduitsPage() {
  await verifySession();
  const list = await listProductsForAdmin(await getDb());
  const visibles = list.filter((p) => p.row.active).length;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produits</h1>
          <p className="text-sm text-muted">
            {list.length} produit{list.length > 1 ? "s" : ""} — {visibles} visible
            {visibles > 1 ? "s" : ""} en boutique
          </p>
        </div>
        <Link href="/admin/produits/nouveau" className={btnPrimary}>
          + Nouveau produit
        </Link>
      </div>

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-panel text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Produit</th>
              <th scope="col" className="px-4 py-3 font-medium">Catégorie</th>
              <th scope="col" className="px-4 py-3 font-medium">Prix</th>
              <th scope="col" className="px-4 py-3 font-medium">Variantes</th>
              <th scope="col" className="px-4 py-3 font-medium">Badge</th>
              <th scope="col" className="px-4 py-3 font-medium">Statut</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ row: p, sizeCount, colorCount, fromCents }) => (
              <tr
                key={p.id}
                data-testid={`product-row-${p.slug}`}
                className="border-b border-line-soft last:border-0 hover:bg-panel"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 text-wine/80 [&_svg]:h-full [&_svg]:w-full">
                      <Bouquet variant={p.illustrationVariant} />
                    </div>
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted">{p.tag}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {CATEGORY_LABELS[p.category]}
                </td>
                <td className="px-4 py-3 font-medium">
                  {sizeCount > 0 ? `dès ${formatEuros(fromCents)}` : formatEuros(fromCents)}
                </td>
                <td className="px-4 py-3 text-muted">
                  {variantSummary(sizeCount, colorCount)}
                </td>
                <td className="px-4 py-3 text-muted">{p.badge ?? "—"}</td>
                <td className="px-4 py-3">
                  <Pill tone={p.active ? "positive" : "neutral"}>
                    {p.active ? "En ligne" : "Masqué"}
                  </Pill>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/produits/${p.id}`}
                      className={`${rowAction} text-wine hover:bg-wine/10`}
                    >
                      Modifier
                    </Link>
                    <form action={setProductActive.bind(null, p.id, !p.active)}>
                      <button
                        type="submit"
                        className={`${rowAction} text-muted hover:bg-stone-100`}
                      >
                        {p.active ? "Masquer" : "Publier"}
                      </button>
                    </form>
                    <form action={deleteProduct.bind(null, p.id)}>
                      <button
                        type="submit"
                        className={`${rowAction} text-danger hover:bg-danger-bg`}
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
