import type { Metadata } from "next";
import { HomeView } from "@/components/views/home-view";
import { getHomeProducts } from "@/lib/products";
import { JsonLd } from "@/components/json-ld";
import { localBusinessJsonLd } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { getSiteUrl } from "@/lib/stripe";
import { getPageContent } from "@/lib/content/server";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Le catalogue vit en base : rendu à la demande, jamais figé au build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [products, settings, content, chrome] = await Promise.all([
    getHomeProducts(),
    getSettings(),
    getPageContent("home"),
    getPageContent("site"),
  ]);

  return (
    <>
      <JsonLd data={localBusinessJsonLd(getSiteUrl(), settings)} />
      <HomeView content={content} chrome={chrome} products={products} />
    </>
  );
}
