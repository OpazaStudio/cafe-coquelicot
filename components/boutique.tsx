"use client";

// Filterable storefront grid for the /boutique route.
// Same visual language as the home Shop section, but a real catalogue
// with category filtering. Client component for the filter state.
// The catalogue itself now lives in Postgres and is passed in by the
// server page (app/boutique/page.tsx).

import { useState } from "react";
import Link from "next/link";
import type { ProductCategory } from "@/lib/db/schema";
import type { ShopProduct } from "@/lib/products";
import { ProductFigure } from "./illustrations";

const FILTERS: { key: ProductCategory | "tout"; label: string }[] = [
  { key: "tout", label: "Tout" },
  { key: "frais", label: "Bouquets frais" },
  { key: "seche", label: "Fleurs séchées" },
  { key: "compo", label: "Compositions" },
  { key: "branches", label: "Branches & feuillages" },
  { key: "mini", label: "Petits formats" },
  { key: "vase", label: "Vases" },
];

export function BoutiqueShop({ catalogue }: { catalogue: ShopProduct[] }) {
  const [active, setActive] = useState<ProductCategory | "tout">("tout");

  const products =
    active === "tout"
      ? catalogue
      : catalogue.filter((p) => p.category === active);

  return (
    <>
      <div className="boutique-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`boutique-filter${active === f.key ? " is-active" : ""}`}
            aria-pressed={active === f.key}
            onClick={() => setActive(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="boutique-count">
        {products.length} composition{products.length > 1 ? "s" : ""} ·
        cueillies ou réceptionnées le matin même
      </p>

      <div className="shop__grid boutique-grid">
        {products.map((p) => (
          <ProductCard key={p.slug} {...p} />
        ))}
      </div>
    </>
  );
}

// Carte présentationnelle : un lien vers la page produit, où se fait toute la
// sélection (taille/coloris/quantité) et l'ajout au panier.
function ProductCard(product: ShopProduct) {
  const { slug, name, tag, desc, badge, price, variant, category } = product;
  return (
    <Link href={`/boutique/${slug}`} className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <ProductFigure category={category} variant={variant} />
      </div>
      <div>
        <p className="eyebrow" style={{ opacity: 0.6, marginBottom: 6 }}>{tag}</p>
        <h3 className="product-card__name">{name}</h3>
      </div>
      <div className="product-card__row">
        <p className="product-card__desc">{desc}</p>
        <span className="product-card__price">{price}</span>
      </div>
    </Link>
  );
}
