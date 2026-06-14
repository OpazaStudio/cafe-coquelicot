"use client";

// Filterable storefront grid for the /boutique route.
// Same visual language as the home Shop section, but a real catalogue
// with category filtering. Client component for the filter state.
// The catalogue itself now lives in Postgres and is passed in by the
// server page (app/boutique/page.tsx).

import { useEffect, useRef, useState } from "react";
import type { ProductCategory } from "@/lib/db/schema";
import type { ShopColor, ShopProduct, ShopSize } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
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
  const { name, tag, desc, badge, sizes, colors } = product;
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [size, setSize] = useState<ShopSize | null>(sizes[0] ?? null);
  const [color, setColor] = useState<ShopColor | null>(colors[0] ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Le coloris change l'illustration ; la taille porte le prix. Produit nu :
  // illustration par défaut + prix « dès » historique.
  const illustration = color?.illustrationVariant ?? product.variant;
  const priceCents = size?.priceCents ?? product.priceCents;
  const priceLabel = sizes.length ? formatEuros(priceCents) : product.price;

  function handleAdd() {
    add({
      slug: product.slug,
      name,
      priceCents,
      sizeId: size?.id ?? null,
      colorId: color?.id ?? null,
      sizeLabel: size?.label ?? null,
      colorLabel: color?.label ?? null,
    });
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={illustration} />
      </div>
      <div>
        <p className="eyebrow" style={{ opacity: 0.6, marginBottom: 6 }}>{tag}</p>
        <h3 className="product-card__name">{name}</h3>
      </div>

      {sizes.length > 0 && (
        <div className="product-card__options" role="group" aria-label={`Taille de ${name}`}>
          {sizes.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`product-card__option${size?.id === s.id ? " is-active" : ""}`}
              aria-pressed={size?.id === s.id}
              onClick={() => setSize(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {colors.length > 0 && (
        <div className="product-card__options" role="group" aria-label={`Coloris de ${name}`}>
          {colors.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`product-card__option${color?.id === c.id ? " is-active" : ""}`}
              aria-pressed={color?.id === c.id}
              onClick={() => setColor(c)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="product-card__row">
        <p className="product-card__desc">{desc}</p>
        <span className="product-card__price">{priceLabel}</span>
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
