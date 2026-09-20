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
import type { BoutiqueContent } from "@/lib/content/pages/boutique";
import { ProductFigure } from "./illustrations";
import { Lines } from "./content/text";

const FILTERS: { key: ProductCategory | "tout"; label: string }[] = [
  { key: "tout", label: "Tout" },
  { key: "frais", label: "Bouquets frais" },
  { key: "seche", label: "Bouquets séchés" },
  { key: "compo", label: "Compositions séchées" },
  { key: "vase", label: "Vases" },
];

export function BoutiqueShop({ catalogue, copy }: { catalogue: ShopProduct[]; copy: BoutiqueContent["catalogue"] }) {
  const [active, setActive] = useState<ProductCategory | "tout">("tout");

  const products =
    active === "tout"
      ? catalogue
      : catalogue.filter((p) => p.category === active);

  return (
    <>
      <h2 className="sr-only">Le catalogue</h2>
      <div
        className="boutique-filters"
        role="group"
        aria-label="Filtrer par catégorie"
      >
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

      <p className="boutique-count" aria-live="polite">
        {products.length} composition{products.length > 1 ? "s" : ""} · {copy.countSuffix}
      </p>

      {products.length === 0 ? (
        <p className="boutique-empty">
          <Lines text={copy.empty} />
        </p>
      ) : (
        <div className="shop__grid boutique-grid">
          {products.map((p) => (
            <ProductCard key={p.slug} {...p} />
          ))}
        </div>
      )}
    </>
  );
}

// Carte présentationnelle : un lien vers la page produit, où se fait toute la
// sélection (taille/coloris/quantité) et l'ajout au panier.
function ProductCard(product: ShopProduct) {
  const { slug, name, badge, price, variant, category, imagePath, imageBgColor } = product;
  return (
    <Link href={`/boutique/${slug}`} className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <ProductFigure
          category={category}
          variant={variant}
          imagePath={imagePath}
          imageBgColor={imageBgColor}
          alt={name}
        />
      </div>
      <div className="product-card__row">
        <h3 className="product-card__name">{name}</h3>
        <span className="product-card__price">{price}</span>
      </div>
    </Link>
  );
}
