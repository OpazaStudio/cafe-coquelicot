import {
  SiteHeader, Hero, Shop, Gallery, Prestations,
  AtelierStrip, About, Contact, SiteFooter,
} from "@/components/sections";
import { getHomeProducts } from "@/lib/products";

// Le catalogue vit en base : rendu à la demande, jamais figé au build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await getHomeProducts();

  return (
    <>
      <SiteHeader />
      <main>
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
