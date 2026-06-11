"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
import { DELIVERY_FEE_CENTS, type Fulfillment } from "@/lib/order-status";
import { startCheckout, type CheckoutState } from "@/app/checkout/actions";
import { ArrowRight } from "./illustrations";

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function CheckoutForm() {
  const { items, subtotalCents, ready } = useCart();
  const [fulfillment, setFulfillment] = useState<Fulfillment>("retrait");
  const [state, action, pending] = useActionState<CheckoutState, FormData>(
    startCheckout,
    undefined,
  );

  if (!ready) {
    return <p className="cart-empty body">Chargement…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty reveal is-visible">
        <p className="body body--lg">
          Votre panier est vide — rien à commander pour l&apos;instant.
        </p>
        <Link href="/boutique" className="btn btn--filled" style={{ marginTop: 24 }}>
          Découvrir la boutique <ArrowRight />
        </Link>
      </div>
    );
  }

  const feeCents = fulfillment === "livraison" ? DELIVERY_FEE_CENTS : 0;
  const itemsPayload = JSON.stringify(
    items.map((i) => ({ slug: i.slug, qty: i.qty })),
  );

  return (
    <form action={action} className="checkout-grid">
      <input type="hidden" name="items" value={itemsPayload} />

      <div className="checkout-fields">
        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Vos coordonnées</legend>
          <label className="form-field">
            <span>Nom complet *</span>
            <input name="name" required autoComplete="name" placeholder="Camille Martin" />
          </label>
          <label className="form-field">
            <span>Email *</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="camille@exemple.fr"
            />
          </label>
          <label className="form-field">
            <span>Téléphone</span>
            <input name="phone" autoComplete="tel" placeholder="06 12 34 56 78" />
          </label>
        </fieldset>

        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Retrait ou livraison</legend>
          <div className="checkout-fulfillment" role="radiogroup">
            <label className={`checkout-choice${fulfillment === "retrait" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="fulfillment"
                value="retrait"
                checked={fulfillment === "retrait"}
                onChange={() => setFulfillment("retrait")}
              />
              <span className="checkout-choice__title">Retrait atelier</span>
              <span className="checkout-choice__desc">
                12 rue du Gabut, La Rochelle — gratuit
              </span>
            </label>
            <label className={`checkout-choice${fulfillment === "livraison" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="fulfillment"
                value="livraison"
                checked={fulfillment === "livraison"}
                onChange={() => setFulfillment("livraison")}
              />
              <span className="checkout-choice__title">Livraison à vélo</span>
              <span className="checkout-choice__desc">
                La Rochelle — {formatEuros(DELIVERY_FEE_CENTS)}
              </span>
            </label>
          </div>

          {fulfillment === "livraison" && (
            <label className="form-field">
              <span>Adresse de livraison *</span>
              <textarea
                name="address"
                required
                rows={2}
                placeholder="3 quai Valin, 17000 La Rochelle"
              />
            </label>
          )}

          <label className="form-field">
            <span>
              Date souhaitée{" "}
              <em>(optionnel — sous réserve de confirmation)</em>
            </span>
            <input type="date" name="deliveryDate" min={tomorrowISO()} />
          </label>

          <label className="form-field">
            <span>
              Message pour la carte <em>(optionnel)</em>
            </span>
            <textarea
              name="cardMessage"
              rows={2}
              maxLength={300}
              placeholder="Joyeux anniversaire…"
            />
          </label>
        </fieldset>
      </div>

      <aside className="cart-summary">
        <h2 className="eyebrow">Votre commande</h2>
        <ul className="checkout-recap">
          {items.map((i) => (
            <li key={i.slug} className="cart-summary__row">
              <span>
                {i.name} × {i.qty}
              </span>
              <span>{formatEuros(i.priceCents * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="cart-summary__row">
          <span>Sous-total</span>
          <span>{formatEuros(subtotalCents)}</span>
        </div>
        <div className="cart-summary__row">
          <span>{fulfillment === "livraison" ? "Livraison" : "Retrait"}</span>
          <span>{feeCents === 0 ? "offert" : formatEuros(feeCents)}</span>
        </div>
        <div className="cart-summary__row cart-summary__row--total">
          <span>Total</span>
          <span data-testid="checkout-total">
            {formatEuros(subtotalCents + feeCents)}
          </span>
        </div>

        {state?.error && (
          <p role="alert" className="checkout-error">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn btn--filled cart-summary__cta"
        >
          {pending ? "Redirection…" : "Payer avec Stripe"} <ArrowRight />
        </button>
        <p className="cart-summary__note">
          Paiement sécurisé par Stripe. Vous serez redirigé·e vers la page de
          paiement.
        </p>
      </aside>
    </form>
  );
}
