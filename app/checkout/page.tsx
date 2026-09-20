import type { Metadata } from "next";
import { CheckoutView } from "@/components/views/checkout-view";
import { getSettings, shippingFeesFromSettings } from "@/lib/settings";
import { DEFAULT_SHIPPING_FEES, type ShippingFees } from "@/lib/order-status";
import { getPageContent } from "@/lib/content/server";

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
  const [fees, content, chrome] = await Promise.all([
    loadShippingFees(),
    getPageContent("checkout"),
    getPageContent("site"),
  ]);
  return <CheckoutView content={content} chrome={chrome} fees={fees} />;
}
