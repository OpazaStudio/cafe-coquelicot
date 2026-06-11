import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getProductRow } from "@/lib/products";
import { updateProduct } from "../actions";
import { ProductForm } from "../product-form";

export default async function EditProduitPage({
  params,
}: PageProps<"/admin/produits/[id]">) {
  await verifySession();
  const { id } = await params;
  const product = await getProductRow(id);
  if (!product) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/produits" className="text-stone-500 hover:underline">
          ← Produits
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Modifier « {product.name} »
      </h1>
      <p className="mb-6 text-sm text-stone-500">
        Slug : <code>{product.slug}</code>
      </p>
      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <ProductForm
          action={updateProduct.bind(null, product.id)}
          product={product}
          submitLabel="Enregistrer"
        />
      </div>
    </>
  );
}
