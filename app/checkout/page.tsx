import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { CheckoutForm } from "@/components/checkout-form";

export const metadata: Metadata = {
  title: "Commander — Coquelicot · Fleuriste La Rochelle",
  description: "Finalisez votre commande de fleurs fraîches & séchées.",
};

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />
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
              commander
              <span className="script">encore un instant…</span>
            </h1>
            <CheckoutForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
