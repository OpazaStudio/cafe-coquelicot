import type { MetadataRoute } from "next";
import type { ProductCategory } from "@/lib/db/schema";
import type { ShippingFees } from "@/lib/order-status";
import type { Settings } from "@/lib/settings";

export const SITE_NAME = "Café Coquelicot";
export const SITE_TITLE = "Café Coquelicot - Fleuriste";
export const SITE_DESCRIPTION =
  "Atelier de fleurs fraîches & séchées. Bouquets de saison, mariages, événementiel, abonnements et ateliers floraux.";

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

const euros = (cents: number) => (cents / 100).toFixed(2);

const FR_REGION = { "@type": "DefinedRegion", addressCountry: "FR" };

function shippingDetails(fees: ShippingFees): JsonLd[] {
  return [
    { name: "Mondial Relay (point relais)", cents: fees.mondialRelay },
    { name: "Colissimo (à domicile)", cents: fees.colissimo },
  ].map(({ name, cents }) => ({
    "@type": "OfferShippingDetails",
    name,
    shippingRate: { "@type": "MonetaryAmount", value: euros(cents), currency: "EUR" },
    shippingDestination: FR_REGION,
  }));
}

function returnPolicy(category: ProductCategory): JsonLd {
  const base = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "FR",
    returnPolicyCountry: "FR",
  };
  if (category === "frais") {
    return { ...base, returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" };
  }
  return {
    ...base,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
    refundType: "https://schema.org/FullRefund",
  };
}

export type ProductJsonLdInput = {
  siteUrl: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrls: string[];
  sizes: { label: string; priceCents: number }[];
  category: ProductCategory;
  shippingFees: ShippingFees;
};

export function productJsonLd(input: ProductJsonLdInput): JsonLd {
  const url = `${input.siteUrl}/boutique/${input.slug}`;
  const shipping = shippingDetails(input.shippingFees);
  const returns = returnPolicy(input.category);
  const offer = (priceCents: number, name?: string): JsonLd => ({
    "@type": "Offer",
    ...(name ? { name } : {}),
    url,
    price: euros(priceCents),
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    shippingDetails: shipping,
    hasMerchantReturnPolicy: returns,
  });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.slug,
    url,
    ...(input.imageUrls.length ? { image: input.imageUrls } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: input.sizes.length
      ? input.sizes.map((s) => offer(s.priceCents, s.label))
      : offer(input.priceCents),
  };
}

export function organizationJsonLd(siteUrl: string, s: Settings): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: SITE_NAME,
    ...(s.legal_name && s.legal_name !== SITE_NAME ? { legalName: s.legal_name } : {}),
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
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
  };
}

export function breadcrumbJsonLd(
  siteUrl: string,
  items: { name: string; path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${siteUrl}${it.path}`,
    })),
  };
}

export function itemListJsonLd(
  siteUrl: string,
  items: { slug: string; name: string; imageUrl: string | null }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: `${siteUrl}/boutique/${it.slug}`,
      ...(it.imageUrl ? { image: it.imageUrl } : {}),
    })),
  };
}
