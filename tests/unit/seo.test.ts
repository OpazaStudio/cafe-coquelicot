// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildRobots,
  buildSitemap,
  jsonLdString,
  localBusinessJsonLd,
  productJsonLd,
} from "@/lib/seo";
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
  it("productJsonLd décrit une offre en euros avec prix en unités majeures", () => {
    const ld = productJsonLd({
      siteUrl: SITE,
      slug: "bouquet-du-jour",
      name: "Bouquet du jour",
      description: "Fleurs de saison.",
      priceCents: 4850,
      imageUrl: null,
    });
    expect(ld["@type"]).toBe("Product");
    expect(ld.url).toBe(`${SITE}/boutique/bouquet-du-jour`);
    expect(ld.offers).toMatchObject({
      "@type": "Offer",
      price: "48.50",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    });
    expect(ld.image).toBeUndefined();
  });

  it("localBusinessJsonLd reprend les réglages de la boutique", () => {
    const ld = localBusinessJsonLd(SITE, {
      ...DEFAULT_SETTINGS,
      contact_phone: "+33 5 00 00 00 00",
    });
    expect(ld["@type"]).toBe("Florist");
    expect(ld.name).toBe("Coquelicot");
    expect(ld.address).toMatchObject({
      streetAddress: "12 rue du Gabut",
      postalCode: "17000",
      addressLocality: "La Rochelle",
      addressCountry: "FR",
    });
    expect(ld.telephone).toBe("+33 5 00 00 00 00");
  });

  it("jsonLdString échappe « < » pour ne pas fermer la balise script", () => {
    const out = jsonLdString({ name: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script");
  });
});
