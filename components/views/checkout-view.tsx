"use client";

import Link from "next/link";
import type { ShippingFees } from "@/lib/order-status";
import type { CheckoutContent } from "@/lib/content/pages/checkout";
import type { SiteContent } from "@/lib/content/pages/site";
import { useLiveContent } from "@/lib/content/live";
import { SiteFooter, SiteHeader } from "@/components/sections";
import { CheckoutForm } from "@/components/checkout-form";

export function CheckoutView({ content, chrome, fees }: { content: CheckoutContent; chrome: SiteContent; fees: ShippingFees }) {
  const c = useLiveContent("checkout", content);
  const site = useLiveContent("site", chrome);
  return (
    <>
      <SiteHeader nav={site.header.nav} />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="cart-page">
          <div className="container">
            <nav className="boutique-crumb reveal is-visible" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <Link href="/panier">panier</Link>
              <span aria-hidden>/</span>
              <span>commander</span>
            </nav>
            <h1 className="display cart-page__title">
              {c.hero.title}
              <span className="script">{c.hero.script}</span>
            </h1>
            <CheckoutForm fees={fees} />
          </div>
        </section>
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}
