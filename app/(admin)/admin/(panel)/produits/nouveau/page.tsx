import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export default async function NouveauProduitPage() {
  await verifySession();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/produits" className="text-stone-500 hover:underline">
          ← Produits
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Nouveau produit
      </h1>
      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <ProductForm action={createProduct} submitLabel="Créer le produit" />
      </div>
    </>
  );
}
