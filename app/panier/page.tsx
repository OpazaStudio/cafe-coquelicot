import type { Metadata } from "next";
import { PanierView } from "@/components/views/panier-view";
import { getActiveVases } from "@/lib/products";
import { getPageContent } from "@/lib/content/server";

export const metadata: Metadata = {
  title: "Panier",
  robots: { index: false, follow: true },
  description: "Votre panier de fleurs fraîches & séchées.",
};

export const dynamic = "force-dynamic";

export default async function PanierPage() {
  const [vases, content, chrome] = await Promise.all([
    getActiveVases(),
    getPageContent("panier"),
    getPageContent("site"),
  ]);
  return <PanierView content={content} chrome={chrome} vases={vases} />;
}
