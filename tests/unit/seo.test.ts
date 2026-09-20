// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildRobots,
  buildSitemap,
  breadcrumbJsonLd,
  itemListJsonLd,
  jsonLdString,
  organizationJsonLd,
  productJsonLd,
} from "@/lib/seo";
import { DEFAULT_SHIPPING_FEES } from "@/lib/order-status";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const SITE = "https://coquelicot-lr.fr";

describe("buildRobots", () => {
  it("autorise le site, bloque back-office, API et tunnel d'achat, annonce le sitemap", () => {
    const r = buildRobots(SITE);
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(
      expect.arrayContaining(["/admin", "/api", "/panier", "/checkout", "/commande"]),
    );
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});

describe("buildSitemap", () => {
  it("liste les pages fixes, les pages légales et les produits actifs", () => {
    const updated = new Date("2026-09-01T00:00:00Z");
    const s = buildSitemap(SITE, [{ slug: "bouquet-du-jour", updatedAt: updated }]);
    const urls = s.map((e) => e.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        `${SITE}/`,
        `${SITE}/boutique`,
        `${SITE}/boutique/bouquet-du-jour`,
        `${SITE}/mentions-legales`,
        `${SITE}/cgv`,
        `${SITE}/livraison-retours`,
        `${SITE}/confidentialite`,
      ]),
    );
    expect(urls).not.toEqual(expect.arrayContaining([`${SITE}/panier`]));
    expect(s.find((e) => e.url.endsWith("/bouquet-du-jour"))?.lastModified).toEqual(updated);
  });
});

describe("JSON-LD", () => {
  const base = {
    siteUrl: SITE,
    slug: "bouquet-du-jour",
    name: "Bouquet du jour",
    description: "Fleurs de saison.",
    priceCents: 4850,
    imageUrls: [] as string[],
    sizes: [] as { label: string; priceCents: number }[],
    category: "seche" as const,
    shippingFees: DEFAULT_SHIPPING_FEES,
  };

  it("productJsonLd décrit une offre en euros, commandable, avec livraison et retour", () => {
    const ld = productJsonLd(base);
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("bouquet-du-jour");
    expect(ld.url).toBe(`${SITE}/boutique/bouquet-du-jour`);
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Café Coquelicot" });
    expect(ld.image).toBeUndefined();
    expect(ld.offers).toMatchObject({
      "@type": "Offer",
      url: `${SITE}/boutique/bouquet-du-jour`,
      price: "48.50",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "FR",
        returnPolicyCountry: "FR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnFees: "https://schema.org/ReturnShippingFees",
        refundType: "https://schema.org/FullRefund",
      },
    });
    const shipping = (ld.offers as { shippingDetails: unknown[] }).shippingDetails;
    expect(shipping).toHaveLength(2);
    expect(shipping[0]).toMatchObject({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: "4.90", currency: "EUR" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "FR" },
    });
    expect(shipping[1]).toMatchObject({
      shippingRate: { value: "7.90", currency: "EUR" },
    });
  });

  it("productJsonLd expose une offre par taille, au prix de la taille", () => {
    const ld = productJsonLd({
      ...base,
      sizes: [
        { label: "Petit format", priceCents: 1600 },
        { label: "Grand format", priceCents: 2900 },
      ],
    });
    expect(ld.offers).toEqual([
      expect.objectContaining({ "@type": "Offer", name: "Petit format", price: "16.00" }),
      expect.objectContaining({ "@type": "Offer", name: "Grand format", price: "29.00" }),
    ]);
  });

  it("productJsonLd liste toutes les photos et refuse le retour des fleurs fraîches", () => {
    const ld = productJsonLd({
      ...base,
      category: "frais",
      imageUrls: ["https://cdn/a.png", "https://cdn/b.png"],
    });
    expect(ld.image).toEqual(["https://cdn/a.png", "https://cdn/b.png"]);
    expect(ld.offers).toMatchObject({
      hasMerchantReturnPolicy: {
        returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      },
    });
    expect((ld.offers as Record<string, unknown>).hasMerchantReturnPolicy).not.toHaveProperty(
      "merchantReturnDays",
    );
  });

  it("organizationJsonLd décrit une boutique en ligne au nom harmonisé, avec les réglages", () => {
    const ld = organizationJsonLd(SITE, {
      ...DEFAULT_SETTINGS,
      legal_name: "Coquelicot SAS",
      contact_phone: "+33 5 00 00 00 00",
    });
    expect(ld["@type"]).toBe("OnlineStore");
    expect(ld.name).toBe("Café Coquelicot");
    expect(ld.legalName).toBe("Coquelicot SAS");
    expect(ld.url).toBe(SITE);
    expect(ld.logo).toBe(`${SITE}/icon.svg`);
    expect(ld.address).toMatchObject({
      streetAddress: "12 rue du Gabut",
      postalCode: "17000",
      addressLocality: "La Rochelle",
      addressCountry: "FR",
    });
    expect(ld.telephone).toBe("+33 5 00 00 00 00");
    expect(ld).not.toHaveProperty("priceRange");
  });

  it("organizationJsonLd omet legalName quand la raison sociale est le nom du site", () => {
    const ld = organizationJsonLd(SITE, { ...DEFAULT_SETTINGS, legal_name: "Café Coquelicot" });
    expect(ld).not.toHaveProperty("legalName");
  });

  it("breadcrumbJsonLd numérote les étapes avec des URL absolues", () => {
    const ld = breadcrumbJsonLd(SITE, [
      { name: "Accueil", path: "/" },
      { name: "Boutique", path: "/boutique" },
      { name: "Bouquet du jour", path: "/boutique/bouquet-du-jour" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Boutique", item: `${SITE}/boutique` },
      {
        "@type": "ListItem",
        position: 3,
        name: "Bouquet du jour",
        item: `${SITE}/boutique/bouquet-du-jour`,
      },
    ]);
  });

  it("itemListJsonLd liste les produits de la boutique dans l'ordre", () => {
    const ld = itemListJsonLd(SITE, [
      { slug: "a", name: "A", imageUrl: "https://cdn/a.png" },
      { slug: "b", name: "B", imageUrl: null },
    ]);
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "A", url: `${SITE}/boutique/a`, image: "https://cdn/a.png" },
      { "@type": "ListItem", position: 2, name: "B", url: `${SITE}/boutique/b` },
    ]);
  });

  it("jsonLdString échappe « < » pour ne pas fermer la balise script", () => {
    const out = jsonLdString({ name: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script");
  });
});
