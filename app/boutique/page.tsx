import type { Metadata } from "next";
import { BoutiqueView } from "@/components/views/boutique-view";
import { getActiveProducts } from "@/lib/products";
import { getPageContent } from "@/lib/content/server";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPageContent("boutique");
  return {
    title: content.meta.title,
    alternates: { canonical: "/boutique" },
    description: content.meta.description,
  };
}

// Le catalogue vit en base : rendu à la demande, jamais figé au build.
export const dynamic = "force-dynamic";

export default async function BoutiquePage() {
  const [catalogue, content, chrome] = await Promise.all([
    getActiveProducts(),
    getPageContent("boutique"),
    getPageContent("site"),
  ]);
  return <BoutiqueView content={content} chrome={chrome} catalogue={catalogue} />;
}
