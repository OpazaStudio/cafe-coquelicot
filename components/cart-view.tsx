"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
import { ArrowRight } from "./illustrations";

export function CartView() {
  const { items, count, subtotalCents, ready, changeQty, remove } = useCart();

  if (!ready) {
    return <p className="cart-empty body">Chargement du panier…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty reveal is-visible">
        <p className="body body--lg">Votre panier est vide pour l&apos;instant.</p>
        <Link href="/boutique" className="btn btn--filled" style={{ marginTop: 24 }}>
          Découvrir la boutique <ArrowRight />
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-grid">
      <ul className="cart-list" data-testid="cart-list">
        {items.map((item) => (
          <li key={item.slug} className="cart-line" data-testid={`cart-line-${item.slug}`}>
            <div className="cart-line__info">
              <h3 className="cart-line__name">{item.name}</h3>
              <p className="cart-line__unit">{formatEuros(item.priceCents)} l&apos;unité</p>
            </div>
            <div className="cart-line__qty" aria-label={`Quantité pour ${item.name}`}>
              <button
                type="button"
                onClick={() => changeQty(item.slug, item.qty - 1)}
                aria-label={`Réduire la quantité de ${item.name}`}
              >
                −
              </button>
              <span data-testid={`qty-${item.slug}`}>{item.qty}</span>
              <button
                type="button"
                onClick={() => changeQty(item.slug, item.qty + 1)}
                aria-label={`Augmenter la quantité de ${item.name}`}
              >
                +
              </button>
            </div>
            <div className="cart-line__total">
              {formatEuros(item.priceCents * item.qty)}
            </div>
            <button
              type="button"
              className="cart-line__remove"
              onClick={() => remove(item.slug)}
              aria-label={`Retirer ${item.name} du panier`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <aside className="cart-summary">
        <h2 className="eyebrow">Récapitulatif</h2>
        <div className="cart-summary__row">
          <span>
            Sous-total ({count} article{count > 1 ? "s" : ""})
          </span>
          <span data-testid="cart-subtotal">{formatEuros(subtotalCents)}</span>
        </div>
        <p className="cart-summary__note">
          Retrait gratuit à l&apos;atelier, ou livraison à vélo dans La Rochelle
          (9€) — à choisir à l&apos;étape suivante.
        </p>
        <Link href="/checkout" className="btn btn--filled cart-summary__cta">
          Commander <ArrowRight />
        </Link>
        <Link href="/boutique" className="link-arrow">
          Continuer mes achats
        </Link>
      </aside>
    </div>
  );
}
