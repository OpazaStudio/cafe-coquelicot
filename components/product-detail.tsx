"use client";

// Page produit interactive : galerie + sélection taille/coloris + quantité +
// ajout panier. Server Component parent : app/boutique/[slug]/page.tsx.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ShopColor, ShopImage, ShopProduct, ShopSize } from "@/lib/products";
import { useCart } from "@/lib/cart/cart-context";
import { MAX_QTY } from "@/lib/cart/cart";
import { formatEuros } from "@/lib/money";
import { productImageUrl } from "@/lib/product-image";
import { ProductFigure, ArrowRight } from "./illustrations";
import { RichText } from "./rich-text";

export function ProductDetail({ product }: { product: ShopProduct }) {
  const { name, desc, descRich, badge, sizes, colors, images } = product;
  const { add } = useCart();
  const [size, setSize] = useState<ShopSize | null>(sizes[0] ?? null);
  const [color, setColor] = useState<ShopColor | null>(colors[0] ?? null);
  const [qty, setQty] = useState(1);
  // `added` : libellé transitoire « Ajouté ✓ » (repasse à false sur minuteur).
  // `hasAdded` : reste vrai une fois ajouté → le lien panier ne disparaît jamais
  // sous le focus. `announce` : message vocal pour lecteurs d'écran (aria-live).
  const [added, setAdded] = useState(false);
  const [hasAdded, setHasAdded] = useState(false);
  const [announce, setAnnounce] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const views = useMemo(
    () => images.filter((i) => i.colorId === null || i.colorId === color?.id),
    [images, color],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = views.find((v) => v.id === activeId) ?? views[0] ?? null;

  function pickFor(
    sizeId: string | null,
    colorId: string | null,
    prefer: "size" | "color",
  ): ShopImage | undefined {
    const pool = images.filter((i) => i.colorId === null || i.colorId === colorId);
    const exact = pool.find((i) => i.sizeId === sizeId && i.colorId === colorId);
    if (exact) return exact;
    const byColor = colorId ? pool.find((i) => i.colorId === colorId) : undefined;
    const bySize = sizeId ? pool.find((i) => i.sizeId === sizeId) : undefined;
    return prefer === "color" ? (byColor ?? bySize) : (bySize ?? byColor);
  }

  function pickSize(s: ShopSize) {
    setSize(s);
    const linked = pickFor(s.id, color?.id ?? null, "size");
    if (linked) setActiveId(linked.id);
  }

  function pickColor(c: ShopColor) {
    setColor(c);
    const linked = pickFor(size?.id ?? null, c.id, "color");
    if (linked) setActiveId(linked.id);
  }

  const stacked =
    views.length > 0 &&
    images.length > 1 &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

  // Le coloris change l'illustration au trait ; la taille porte le prix.
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
    setHasAdded(true);
    const unit = qty > 1 ? `${qty} × ` : "";
    setAnnounce(`${unit}${name} ajouté au panier.`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="product-page">
      <div className="product-page__gallery">
        <div className="product-page__media">
          {badge && <span className="product-card__badge">{badge}</span>}
          {stacked ? (
            <span className="product-photos">
              {images.map((v) => {
                const isActive = active?.id === v.id;
                return (
                  <span
                    key={v.id}
                    className={`product-photo${isActive ? " is-active" : ""}`}
                    style={v.bgColor ? { background: v.bgColor } : undefined}
                    aria-hidden={!isActive}
                  >
                    <Image
                      src={productImageUrl(v.path)}
                      alt={isActive ? v.alt || name : ""}
                      fill
                      sizes="(max-width: 768px) 100vw, 600px"
                    />
                  </span>
                );
              })}
            </span>
          ) : (
            <ProductFigure
              category={product.category}
              variant={illustration}
              imagePath={active?.path ?? null}
              imageBgColor={active?.bgColor ?? null}
              alt={active?.alt || name}
              sizes="(max-width: 768px) 100vw, 600px"
            />
          )}
        </div>
        {views.length > 1 && (
          <div className="product-thumbs" role="group" aria-label={`Photos de ${name}`}>
            {views.map((v, i) => (
              <button
                key={v.id}
                type="button"
                className={`product-thumb${active?.id === v.id ? " is-active" : ""}`}
                aria-pressed={active?.id === v.id}
                aria-label={v.alt || `Voir la photo ${i + 1} de ${name}`}
                style={v.bgColor ? { background: v.bgColor } : undefined}
                onClick={() => setActiveId(v.id)}
              >
                <Image src={productImageUrl(v.path)} alt="" fill sizes="80px" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="product-page__info">
        <h1 className="display product-page__name">{name}</h1>
        <RichText doc={descRich} fallback={desc} className="body product-page__desc" />

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
                  onClick={() => pickSize(s)}
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
                  onClick={() => pickColor(c)}
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
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span data-testid="product-qty" aria-live="polite" aria-atomic="true">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Augmenter la quantité"
              disabled={qty >= MAX_QTY}
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
        {hasAdded && (
          <Link href="/panier" className="link-arrow product-page__cart-link">
            Voir le panier <ArrowRight />
          </Link>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  );
}
