"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
import { ArrowRight } from "./illustrations";

export function CartView() {
  const { items, count, subtotalCents, ready, changeQty, remove } = useCart();

  if (!ready) {
    return (
      <p className="cart-empty body" role="status">
        Chargement du panier…
      </p>
    );
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
      <h2 className="sr-only">Vos articles</h2>
      <ul className="cart-list" data-testid="cart-list">
        {items.map((item) => {
          const variant = [item.sizeLabel, item.colorLabel]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={item.key} className="cart-line" data-testid={`cart-line-${item.key}`}>
              <div className="cart-line__info">
                <h3 className="cart-line__name">{item.name}</h3>
                {variant && <p className="cart-line__variant">{variant}</p>}
                <p className="cart-line__unit">{formatEuros(item.priceCents)} l&apos;unité</p>
              </div>
              <div className="cart-line__qty" aria-label={`Quantité pour ${item.name}`}>
                <button
                  type="button"
                  onClick={() => changeQty(item.key, item.qty - 1)}
                  aria-label={`Réduire la quantité de ${item.name}`}
                >
                  −
                </button>
                <span data-testid={`qty-${item.key}`}>{item.qty}</span>
                <button
                  type="button"
                  onClick={() => changeQty(item.key, item.qty + 1)}
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
                onClick={() => remove(item.key)}
                aria-label={`Retirer ${item.name} du panier`}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <aside className="cart-summary">
        <h2 className="eyebrow">Récapitulatif</h2>
        <div className="cart-summary__row" aria-live="polite" aria-atomic="true">
          <span>
            Sous-total ({count} article{count > 1 ? "s" : ""})
          </span>
          <span data-testid="cart-subtotal">{formatEuros(subtotalCents)}</span>
        </div>
        <p className="cart-summary__note">
          Livraison en point relais Mondial Relay ou à domicile par Colissimo —
          frais affichés à l&apos;étape suivante.
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
