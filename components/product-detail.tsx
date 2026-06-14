"use client";

// Page produit interactive : sélection taille/coloris + quantité + ajout panier.
// Server Component parent : app/boutique/[slug]/page.tsx.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ShopColor, ShopProduct, ShopSize } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { MAX_QTY } from "@/lib/cart/cart";
import { formatEuros } from "@/lib/money";
import { Bouquet, ArrowRight } from "./illustrations";

export function ProductDetail({ product }: { product: ShopProduct }) {
  const { name, tag, desc, badge, sizes, colors } = product;
  const { add } = useCart();
  const [size, setSize] = useState<ShopSize | null>(sizes[0] ?? null);
  const [color, setColor] = useState<ShopColor | null>(colors[0] ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Le coloris change l'illustration ; la taille porte le prix.
  const illustration = color?.illustrationVariant ?? product.variant;
  const priceCents = size?.priceCents ?? product.priceCents;

  function handleAdd() {
    add(
      {
        slug: product.slug,
        name,
        priceCents,
        sizeId: size?.id ?? null,
        colorId: color?.id ?? null,
        sizeLabel: size?.label ?? null,
        colorLabel: color?.label ?? null,
      },
      qty,
    );
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="product-page">
      <div className="product-page__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={illustration} />
      </div>
      <div className="product-page__info">
        <p className="eyebrow">{tag}</p>
        <h1 className="display product-page__name">{name}</h1>
        <p className="body product-page__desc">{desc}</p>

        {sizes.length > 0 && (
          <div className="variant-field">
            <span className="variant-label">Taille</span>
            <div
              className="variant-group"
              role="group"
              aria-label={`Taille de ${name}`}
            >
              {sizes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`variant-option${size?.id === s.id ? " is-active" : ""}`}
                  aria-pressed={size?.id === s.id}
                  onClick={() => setSize(s)}
                >
                  {s.label} · {formatEuros(s.priceCents)}
                </button>
              ))}
            </div>
          </div>
        )}

        {colors.length > 0 && (
          <div className="variant-field">
            <span className="variant-label">Coloris</span>
            <div
              className="variant-group"
              role="group"
              aria-label={`Coloris de ${name}`}
            >
              {colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`variant-option${color?.id === c.id ? " is-active" : ""}`}
                  aria-pressed={color?.id === c.id}
                  onClick={() => setColor(c)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="variant-field">
          <span className="variant-label">Quantité</span>
          <div className="product-qty">
            <button
              type="button"
              aria-label="Réduire la quantité"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span data-testid="product-qty">{qty}</span>
            <button
              type="button"
              aria-label="Augmenter la quantité"
              onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
            >
              +
            </button>
          </div>
        </div>

        <div className="product-page__buy">
          <span className="product-page__price" data-testid="product-price">
            {formatEuros(priceCents)}
          </span>
          <button
            type="button"
            className="btn btn--filled"
            onClick={handleAdd}
            aria-label={`Ajouter ${name} au panier`}
          >
            {added ? <>Ajouté ✓</> : <>Ajouter au panier <ArrowRight /></>}
          </button>
        </div>
        {added && (
          <Link href="/panier" className="link-arrow product-page__cart-link">
            Voir le panier <ArrowRight />
          </Link>
        )}
      </div>
    </div>
  );
}
