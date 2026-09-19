import type { MetadataRoute } from "next";
import type { Settings } from "@/lib/settings";

export const SITE_NAME = "Coquelicot";
export const SITE_TITLE = "Coquelicot — Fleuriste · La Rochelle";
export const SITE_DESCRIPTION =
  "Atelier-boutique de fleurs fraîches & séchées à La Rochelle. Bouquets de saison, mariages, événementiel, abonnements et ateliers floraux.";

export const LEGAL_PATHS = [
  "/mentions-legales",
  "/cgv",
  "/livraison-retours",
  "/confidentialite",
] as const;

export const PRIVATE_PATHS = ["/admin", "/api", "/panier", "/checkout", "/commande"] as const;

export function buildRobots(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

export type SitemapProduct = { slug: string; updatedAt: Date };

export function buildSitemap(
  siteUrl: string,
  products: SitemapProduct[],
): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/boutique`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...products.map((p) => ({
      url: `${siteUrl}/boutique/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...LEGAL_PATHS.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}

type JsonLd = Record<string, unknown>;

export function jsonLdString(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function productJsonLd(input: {
  siteUrl: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: `${input.siteUrl}/boutique/${input.slug}`,
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      url: `${input.siteUrl}/boutique/${input.slug}`,
      price: (input.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    },
  };
}

export function localBusinessJsonLd(siteUrl: string, s: Settings): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Florist",
    name: s.legal_name || SITE_NAME,
    url: siteUrl,
    image: `${siteUrl}/opengraph-image`,
    ...(s.contact_email ? { email: s.contact_email } : {}),
    ...(s.contact_phone ? { telephone: s.contact_phone } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: s.address_street,
      postalCode: s.address_postal_code,
      addressLocality: s.address_city,
      addressCountry: "FR",
    },
    priceRange: "€€",
  };
}
