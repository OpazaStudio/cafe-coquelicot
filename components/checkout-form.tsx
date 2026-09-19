"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart/cart-context";
import { trackBeginCheckout } from "@/lib/analytics/gtag";
import { composeItemName } from "@/lib/item-label";
import { formatEuros } from "@/lib/money";
import { CARD_FEE_CENTS, shippingFeeFor, type ShippingFees } from "@/lib/order-status";
import { startCheckout, type CheckoutState } from "@/app/checkout/actions";
import { ArrowRight } from "./illustrations";
import { RelayPicker, type RelaySelection } from "./relay-picker";

type ShippingMode = "mondial_relay" | "poste";

export function CheckoutForm({ fees }: { fees: ShippingFees }) {
  const { items, subtotalCents, ready } = useCart();
  const [mode, setMode] = useState<ShippingMode>("mondial_relay");
  const [relay, setRelay] = useState<RelaySelection | null>(null);
  const [hasCard, setHasCard] = useState(false);
  const [state, action, pending] = useActionState<CheckoutState, FormData>(
    startCheckout,
    undefined,
  );

  // begin_checkout : une seule fois, dès que le tunnel s'affiche avec un panier.
  const beginCheckoutFired = useRef(false);
  useEffect(() => {
    if (!ready || items.length === 0 || beginCheckoutFired.current) return;
    beginCheckoutFired.current = true;
    trackBeginCheckout(items, subtotalCents + fees.mondialRelay);
  }, [ready, items, subtotalCents, fees.mondialRelay]);

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

  const feeCents = shippingFeeFor(mode, fees);
  const cardFeeCents = hasCard ? CARD_FEE_CENTS : 0;
  const canSubmit = mode === "poste" || relay !== null;
  const itemsPayload = JSON.stringify(
    items.map((i) => ({
      slug: i.slug,
      sizeId: i.sizeId,
      colorId: i.colorId,
      qty: i.qty,
    })),
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
            <span>Téléphone *</span>
            <input name="phone" required autoComplete="tel" placeholder="06 12 34 56 78" />
          </label>
        </fieldset>

        <fieldset className="checkout-fieldset">
          <legend className="eyebrow">Mode de livraison</legend>
          <input type="hidden" name="fulfillment" value={mode} />
          <div className="checkout-fulfillment">
            <label className={`checkout-choice${mode === "mondial_relay" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="shippingMode"
                value="mondial_relay"
                checked={mode === "mondial_relay"}
                onChange={() => setMode("mondial_relay")}
                data-testid="shipping-mode-mondial_relay"
              />
              <span className="checkout-choice__title">Point relais Mondial Relay</span>
              <span className="checkout-choice__desc">
                Livré dans le relais de votre choix — {formatEuros(fees.mondialRelay)}
              </span>
            </label>
            <label className={`checkout-choice${mode === "poste" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="shippingMode"
                value="poste"
                checked={mode === "poste"}
                onChange={() => setMode("poste")}
                data-testid="shipping-mode-poste"
              />
              <span className="checkout-choice__title">À domicile par Colissimo</span>
              <span className="checkout-choice__desc">
                Livré à votre adresse, France métropolitaine — {formatEuros(fees.colissimo)}
              </span>
            </label>
          </div>

          <div hidden={mode !== "mondial_relay"}>
            <RelayPicker value={relay} onSelect={setRelay} />
          </div>
          {mode === "mondial_relay" && relay && (
            <>
              <input type="hidden" name="relayPointId" value={relay.id} />
              <input type="hidden" name="relayPointName" value={relay.name} />
              <input type="hidden" name="relayStreet" value={relay.street} />
              <input type="hidden" name="relayPostalCode" value={relay.postalCode} />
              <input type="hidden" name="relayCity" value={relay.city} />
              <input type="hidden" name="relayCountry" value="FR" />
            </>
          )}

          {mode === "poste" && (
            <>
              <label className="form-field">
                <span>Adresse (n° et rue) *</span>
                <input
                  name="address"
                  required
                  maxLength={200}
                  autoComplete="street-address"
                  placeholder="3 quai Valin, appartement 2"
                />
              </label>
              <label className="form-field">
                <span>Code postal *</span>
                <input
                  name="postalCode"
                  required
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  autoComplete="postal-code"
                  placeholder="17000"
                />
              </label>
              <label className="form-field">
                <span>Ville *</span>
                <input
                  name="city"
                  required
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder="La Rochelle"
                />
              </label>
            </>
          )}

          <label className="form-field">
            <span>
              Message pour la carte{" "}
              <em>(optionnel — carte manuscrite +{formatEuros(CARD_FEE_CENTS)})</em>
            </span>
            <textarea
              name="cardMessage"
              rows={2}
              maxLength={300}
              placeholder="Joyeux anniversaire…"
              onChange={(e) => setHasCard(e.target.value.trim().length > 0)}
            />
          </label>
        </fieldset>
      </div>

      <aside className="cart-summary">
        <h2 className="eyebrow">Votre commande</h2>
        <ul className="checkout-recap">
          {items.map((i) => (
            <li key={i.key} className="cart-summary__row">
              <span>
                {composeItemName(i.name, i.sizeLabel, i.colorLabel)} × {i.qty}
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
          <span>{mode === "poste" ? "Livraison (Colissimo à domicile)" : "Livraison (point relais)"}</span>
          <span>{formatEuros(feeCents)}</span>
        </div>
        {cardFeeCents > 0 && (
          <div className="cart-summary__row">
            <span>Carte manuscrite</span>
            <span>{formatEuros(cardFeeCents)}</span>
          </div>
        )}
        <div className="cart-summary__row cart-summary__row--total">
          <span>Total</span>
          <span data-testid="checkout-total">
            {formatEuros(subtotalCents + feeCents + cardFeeCents)}
          </span>
        </div>

        {state?.error && (
          <p role="alert" className="checkout-error">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="btn btn--filled cart-summary__cta"
        >
          {pending ? "Redirection…" : canSubmit ? "Payer avec Stripe" : "Choisissez un point relais"}{" "}
          <ArrowRight />
        </button>
        <p className="cart-summary__note">
          Paiement sécurisé par Stripe. Vous serez redirigé·e vers la page de
          paiement.
        </p>
      </aside>
    </form>
  );
}
