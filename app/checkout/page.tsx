import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { CheckoutForm } from "@/components/checkout-form";
import { getSettings, shippingFeesFromSettings } from "@/lib/settings";
import { DEFAULT_SHIPPING_FEES, type ShippingFees } from "@/lib/order-status";

export const metadata: Metadata = {
  title: "Commander",
  robots: { index: false, follow: false },
  description: "Finalisez votre commande de fleurs fraîches & séchées.",
};

export const dynamic = "force-dynamic";

async function loadShippingFees(): Promise<ShippingFees> {
  try {
    return shippingFeesFromSettings(await getSettings());
  } catch (err) {
    console.error("[checkout] lecture des frais de livraison impossible", err);
    return DEFAULT_SHIPPING_FEES;
  }
}

export default async function CheckoutPage() {
  const fees = await loadShippingFees();
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
            <CheckoutForm fees={fees} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
