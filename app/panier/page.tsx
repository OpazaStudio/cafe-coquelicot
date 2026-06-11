import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = {
  title: "Panier — Coquelicot · Fleuriste La Rochelle",
  description: "Votre panier de fleurs fraîches & séchées.",
};

export default function PanierPage() {
  return (
    <>
      <SiteHeader />
      <main>
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
              votre panier
              <span className="script">prêt à fleurir ?</span>
            </h1>
            <CartView />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
