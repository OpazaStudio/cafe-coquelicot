"use client";

// Filterable storefront grid for the /boutique route.
// Same visual language as the home Shop section, but a real catalogue
// with category filtering. Client component for the filter state.
// The catalogue itself now lives in Postgres and is passed in by the
// server page (app/boutique/page.tsx).

import { useEffect, useRef, useState } from "react";
import type { ProductCategory } from "@/lib/db/schema";
import type { ShopProduct } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { Bouquet, ArrowRight } from "./illustrations";

const FILTERS: { key: ProductCategory | "tout"; label: string }[] = [
  { key: "tout", label: "Tout" },
  { key: "frais", label: "Bouquets frais" },
  { key: "seche", label: "Fleurs séchées" },
  { key: "compo", label: "Compositions" },
  { key: "branches", label: "Branches & feuillages" },
  { key: "mini", label: "Petits formats" },
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

function ProductCard(product: ShopProduct) {
  const { name, tag, desc, price, variant, badge } = product;
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleAdd() {
    add({ slug: product.slug, name, priceCents: product.priceCents });
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={variant} />
      </div>
      <div>
        <p className="eyebrow" style={{ opacity: 0.6, marginBottom: 6 }}>{tag}</p>
        <h3 className="product-card__name">{name}</h3>
      </div>
      <div className="product-card__row">
        <p className="product-card__desc">{desc}</p>
        <span className="product-card__price">{price}</span>
      </div>
      <button
        type="button"
        className="product-card__add link-arrow"
        onClick={handleAdd}
        aria-label={`Ajouter ${name} au panier`}
      >
        {added ? <>Ajouté ✓</> : <>Ajouter <ArrowRight /></>}
      </button>
    </article>
  );
}
