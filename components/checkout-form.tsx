"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { formatEuros } from "@/lib/money";
import {
  SHIPPING_COUNTRY_CODES,
  SHIPPING_COUNTRY_LABELS,
  SHIPPING_FEE_CENTS,
  type Fulfillment,
  type ShippingCountryCode,
} from "@/lib/order-status";
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
  const [country, setCountry] = useState<ShippingCountryCode>("FR");
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

  const feeCents = fulfillment === "poste" ? SHIPPING_FEE_CENTS : 0;
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
          <legend className="eyebrow">Retrait ou envoi postal</legend>
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
            <label className={`checkout-choice${fulfillment === "poste" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="fulfillment"
                value="poste"
                checked={fulfillment === "poste"}
                onChange={() => setFulfillment("poste")}
              />
              <span className="checkout-choice__title">Envoi par la poste</span>
              <span className="checkout-choice__desc">
                Colissimo, France et pays limitrophes —{" "}
                {formatEuros(SHIPPING_FEE_CENTS)}
              </span>
            </label>
          </div>

          {fulfillment === "poste" && (
            <>
              <label className="form-field">
                <span>Adresse d&apos;expédition *</span>
                <input
                  name="shippingAddress"
                  required
                  maxLength={200}
                  autoComplete="street-address"
                  placeholder="3 quai Valin"
                />
              </label>
              <label className="form-field">
                <span>Code postal *</span>
                <input
                  name="shippingPostalCode"
                  required
                  maxLength={10}
                  autoComplete="postal-code"
                  inputMode={country === "FR" ? "numeric" : "text"}
                  pattern={country === "FR" ? "\\d{5}" : undefined}
                  placeholder={country === "FR" ? "17000" : ""}
                />
              </label>
              <label className="form-field">
                <span>Ville *</span>
                <input
                  name="shippingCity"
                  required
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder="La Rochelle"
                />
              </label>
              <label className="form-field">
                <span>Pays *</span>
                <select
                  name="shippingCountry"
                  value={country}
                  onChange={(e) =>
                    setCountry(e.target.value as ShippingCountryCode)
                  }
                >
                  {SHIPPING_COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {SHIPPING_COUNTRY_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="form-field">
            <span>
              {fulfillment === "poste"
                ? "Date d'expédition souhaitée"
                : "Date de retrait souhaitée"}{" "}
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
          <span>{fulfillment === "poste" ? "Envoi postal" : "Retrait"}</span>
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
