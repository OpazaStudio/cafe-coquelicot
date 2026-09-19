import type { MetadataRoute } from "next";
import { getActiveProductsForSitemap } from "@/lib/products";
import { buildSitemap } from "@/lib/seo";
import { getSiteUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(getSiteUrl(), await getActiveProductsForSitemap());
}
