import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { ProductDetail } from "@/components/product-detail";
import { getProductBySlug } from "@/lib/products";
import { JsonLd } from "@/components/json-ld";
import { productImageUrl } from "@/lib/product-image";
import { productJsonLd } from "@/lib/seo";
import { getSiteUrl } from "@/lib/stripe";
import { getPageContent } from "@/lib/content/server";

// Catalogue en base : rendu à la demande, jamais figé au build.
export const dynamic = "force-dynamic";

const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, " ").trim();

export async function generateMetadata({
  params,
}: PageProps<"/boutique/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return { title: "Produit introuvable : Café Coquelicot - Fleuriste" };
  }
  const image = product.imagePath ? productImageUrl(product.imagePath) : undefined;
  const description = oneLine(product.desc);
  return {
    title: product.name,
    description,
    alternates: { canonical: `/boutique/${slug}` },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: `/boutique/${slug}`,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
  };
}

export default async function ProduitPage({
  params,
}: PageProps<"/boutique/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const site = await getPageContent("site");

  return (
    <>
      <JsonLd
        data={productJsonLd({
          siteUrl: getSiteUrl(),
          slug: product.slug,
          name: product.name,
          description: oneLine(product.desc),
          priceCents: product.priceCents,
          imageUrl: product.imagePath ? productImageUrl(product.imagePath) : null,
        })}
      />
      <SiteHeader nav={site.header.nav} />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="product-detail-section">
          <div className="container">
            <nav className="boutique-crumb" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <Link href="/boutique">boutique</Link>
              <span aria-hidden>/</span>
              <span>{product.name}</span>
            </nav>
            <ProductDetail product={product} />
          </div>
        </section>
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}
