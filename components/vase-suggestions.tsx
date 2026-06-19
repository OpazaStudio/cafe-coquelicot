"use client";

// Vases à la vente, TOUJOURS proposés sur /panier dès qu'il y a un article au
// panier (même si un vase y est déjà). Quick-add du vase "nu" — le prix est
// revalidé en base au checkout, comme tout produit.
import type { ShopProduct } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
import { ProductFigure, ArrowRight } from "./illustrations";

export function VaseSuggestions({ vases }: { vases: ShopProduct[] }) {
  const { items, ready, add } = useCart();
  if (!ready || vases.length === 0 || items.length === 0) return null;

  return (
    <section
      className="vase-suggest reveal is-visible"
      data-testid="vase-suggestions"
      aria-label="Vases à ajouter"
    >
      <h2 className="vase-suggest__title">Et pourquoi pas un vase&nbsp;?</h2>
      <p className="vase-suggest__lead">Faits main, à offrir ou pour vos prochains bouquets.</p>
      <ul className="vase-suggest__grid">
        {vases.map((v) => (
          <li key={v.slug} className="vase-suggest__card">
            <div className="vase-suggest__media">
              <ProductFigure category={v.category} variant={v.variant} />
            </div>
            <div className="vase-suggest__info">
              <h3 className="vase-suggest__name">{v.name}</h3>
              <span className="vase-suggest__price">{formatEuros(v.priceCents)}</span>
            </div>
            <button
              type="button"
              className="btn btn--filled vase-suggest__add"
              onClick={() =>
                add({ slug: v.slug, name: v.name, priceCents: v.priceCents })
              }
              aria-label={`Ajouter ${v.name} au panier`}
            >
              Ajouter <ArrowRight />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
