"use client";

import Link from "next/link";
import type { ShopProduct } from "@/lib/products";
import type { PanierContent } from "@/lib/content/pages/panier";
import type { SiteContent } from "@/lib/content/pages/site";
import { useLiveContent } from "@/lib/content/live";
import { SiteFooter, SiteHeader } from "@/components/sections";
import { CartView } from "@/components/cart-view";
import { VaseSuggestions } from "@/components/vase-suggestions";

export function PanierView({ content, chrome, vases }: { content: PanierContent; chrome: SiteContent; vases: ShopProduct[] }) {
  const c = useLiveContent("panier", content);
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
              <Link href="/boutique">boutique</Link>
              <span aria-hidden>/</span>
              <span>panier</span>
            </nav>
            <h1 className="display cart-page__title">
              {c.hero.title}
              <span className="script">{c.hero.script}</span>
            </h1>
            <CartView copy={{ empty: c.empty, summary: c.summary }} />
            <VaseSuggestions vases={vases} copy={c.vases} />
          </div>
        </section>
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}
