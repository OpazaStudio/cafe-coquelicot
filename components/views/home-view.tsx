"use client";

import type { ShopProduct } from "@/lib/products";
import type { HomeContent } from "@/lib/content/pages/home";
import type { SiteContent } from "@/lib/content/pages/site";
import { useLiveContent } from "@/lib/content/live";
import {
  About, AtelierStrip, Contact, Gallery, Hero, Prestations, Shop, SiteFooter, SiteHeader,
} from "@/components/sections";

export function HomeView({
  content,
  chrome,
  products,
}: {
  content: HomeContent;
  chrome: SiteContent;
  products: ShopProduct[];
}) {
  const home = useLiveContent("home", content);
  const site = useLiveContent("site", chrome);
  return (
    <>
      <SiteHeader nav={site.header.nav} />
      <main id="contenu" tabIndex={-1}>
        <Hero bg="linen" content={home.hero} />
        <Shop bg="coffee-bean" content={home.shop} products={products} />
        <Gallery bg="linen" content={home.gallery} />
        <Prestations bg="burgundy" content={home.prestations} />
        <AtelierStrip bg="coffee-bean-2" content={home.atelier} />
        <About bg="linen" content={home.about} />
        <Contact bg="burgundy" content={home.contact} />
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}
