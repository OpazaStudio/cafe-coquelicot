"use client";

import Link from "next/link";
import type { ConfirmationContent } from "@/lib/content/pages/confirmation";
import type { SiteContent } from "@/lib/content/pages/site";
import { useLiveContent } from "@/lib/content/live";
import { fillTemplate } from "@/lib/content/template";
import { formatEuros } from "@/lib/money";
import { SiteFooter, SiteHeader } from "@/components/sections";
import { ClearCart } from "@/components/clear-cart";
import { PurchaseTracking } from "@/components/purchase-tracking";
import { ArrowRight } from "@/components/illustrations";
import { Lines } from "@/components/content/text";

export type ConfirmationItem = {
  id: string;
  label: string;
  qty: number;
  priceCents: number;
  productId: string | null;
  nameSnapshot: string;
  sizeLabelSnapshot: string | null;
  colorLabelSnapshot: string | null;
};

export type ConfirmationState =
  | {
      kind: "paid";
      number: string;
      totalCents: number;
      deliveryFeeCents: number;
      cardFeeCents: number;
      customerEmail: string;
      fulfillment: string;
      items: ConfirmationItem[];
    }
  | { kind: "pending"; number: string }
  | { kind: "notFound" };

export type ConfirmationVars = { adresse: string; contact: string };

export function ConfirmationView({
  content,
  chrome,
  state,
  vars,
}: {
  content: ConfirmationContent;
  chrome: SiteContent;
  state: ConfirmationState;
  vars: ConfirmationVars;
}) {
  const c = useLiveContent("confirmation", content);
  const site = useLiveContent("site", chrome);
  return (
    <>
      <SiteHeader nav={site.header.nav} />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="cart-page">
          <div className="container">
            {state.kind === "paid" ? (
              <Paid content={c.paid} state={state} vars={vars} />
            ) : state.kind === "pending" ? (
              <>
                <h1 className="display cart-page__title">
                  {c.pending.title}
                  <span className="script">{c.pending.script}</span>
                </h1>
                <p className="body body--lg">
                  <Lines text={fillTemplate(c.pending.text, { numero: state.number })} />
                </p>
              </>
            ) : (
              <>
                <h1 className="display cart-page__title">
                  {c.notFound.title}
                  <span className="script">{c.notFound.script}</span>
                </h1>
                <p className="body body--lg">
                  <Lines text={fillTemplate(c.notFound.text, { contact: vars.contact })} />
                </p>
              </>
            )}
            <p style={{ marginTop: 40 }}>
              <Link href="/boutique" className="link-arrow">
                {c.back.label} <ArrowRight />
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}

function Paid({
  content,
  state,
  vars,
}: {
  content: ConfirmationContent["paid"];
  state: Extract<ConfirmationState, { kind: "paid" }>;
  vars: ConfirmationVars;
}) {
  const tokens = { numero: state.number, email: state.customerEmail, adresse: vars.adresse };
  const suite =
    state.fulfillment === "poste"
      ? content.noteColissimo
      : state.fulfillment === "mondial_relay"
        ? content.noteRelay
        : content.notePickup;
  return (
    <>
      <ClearCart />
      <PurchaseTracking
        transactionId={state.number}
        valueCents={state.totalCents}
        shippingCents={state.deliveryFeeCents}
        items={state.items.map((item) => {
          const variant = [item.sizeLabelSnapshot, item.colorLabelSnapshot].filter(Boolean).join(" · ");
          return {
            item_id: item.productId ?? item.nameSnapshot,
            item_name: item.nameSnapshot,
            price: item.priceCents / 100,
            quantity: item.qty,
            ...(variant ? { item_variant: variant } : {}),
          };
        })}
      />
      <h1 className="display cart-page__title">
        {content.title}
        <span className="script">{content.script}</span>
      </h1>
      <div className="confirm-card" data-testid="order-confirmation">
        <p className="eyebrow">{fillTemplate(content.orderLine, tokens)}</p>
        <ul className="confirm-card__items">
          {state.items.map((item) => (
            <li key={item.id} className="cart-summary__row">
              <span>{item.label} × {item.qty}</span>
              <span>{formatEuros(item.priceCents * item.qty)}</span>
            </li>
          ))}
          {state.deliveryFeeCents > 0 && (
            <li className="cart-summary__row">
              <span>Envoi postal</span>
              <span>{formatEuros(state.deliveryFeeCents)}</span>
            </li>
          )}
          {state.cardFeeCents > 0 && (
            <li className="cart-summary__row">
              <span>Carte manuscrite</span>
              <span>{formatEuros(state.cardFeeCents)}</span>
            </li>
          )}
        </ul>
        <div className="cart-summary__row cart-summary__row--total">
          <span>Total payé</span>
          <span>{formatEuros(state.totalCents)}</span>
        </div>
        <p className="cart-summary__note">
          {fillTemplate(content.emailNote, tokens)} {fillTemplate(suite, tokens)}
        </p>
      </div>
    </>
  );
}
