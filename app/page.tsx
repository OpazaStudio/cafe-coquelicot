import {
  SiteHeader, Hero, Shop, Gallery, Prestations,
  AtelierStrip, About, Contact, SiteFooter,
} from "@/components/sections";
import type { Metadata } from "next";
import { getHomeProducts } from "@/lib/products";
import { JsonLd } from "@/components/json-ld";
import { localBusinessJsonLd } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { getSiteUrl } from "@/lib/stripe";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Le catalogue vit en base : rendu à la demande, jamais figé au build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [products, settings] = await Promise.all([getHomeProducts(), getSettings()]);

  return (
    <>
      <JsonLd data={localBusinessJsonLd(getSiteUrl(), settings)} />
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <Hero bg="linen" />
        <Shop bg="linen" products={products} />
        <Gallery bg="pale-oak" />
        <Prestations bg="burgundy" />
        <AtelierStrip bg="coffee-bean-2" />
        <About bg="linen" />
        <Contact bg="burgundy" />
      </main>
      <SiteFooter />
    </>
  );
}
