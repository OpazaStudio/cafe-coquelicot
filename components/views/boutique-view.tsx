"use client";

import Link from "next/link";
import type { ShopProduct } from "@/lib/products";
import type { BoutiqueContent } from "@/lib/content/pages/boutique";
import type { SiteContent } from "@/lib/content/pages/site";
import { useLiveContent } from "@/lib/content/live";
import { SiteFooter, SiteHeader } from "@/components/sections";
import { BoutiqueShop } from "@/components/boutique";
import { ArrowRight } from "@/components/illustrations";
import { Lines } from "@/components/content/text";

export function BoutiqueView({
  content,
  chrome,
  catalogue,
}: {
  content: BoutiqueContent;
  chrome: SiteContent;
  catalogue: ShopProduct[];
}) {
  const c = useLiveContent("boutique", content);
  const site = useLiveContent("site", chrome);
  return (
    <>
      <SiteHeader nav={site.header.nav} />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="boutique-hero">
          <div className="container">
            <nav className="boutique-crumb reveal" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <span>boutique</span>
            </nav>
            <div className="boutique-hero__inner">
              <h1 className="display boutique-hero__title reveal">{c.hero.title}</h1>
              <div className="boutique-hero__intro reveal">
                <p className="eyebrow">{c.hero.eyebrow}</p>
                <p className="body body--lg">
                  <Lines text={c.hero.intro} />
                </p>
              </div>
            </div>
            <BoutiqueShop catalogue={catalogue} copy={c.catalogue} />
          </div>
        </section>

        <section data-section data-bg="coffee-bean-2" className="boutique-bespoke">
          <div className="container">
            <div className="boutique-bespoke__inner reveal">
              <p className="eyebrow">{c.bespoke.eyebrow}</p>
              <h2 className="boutique-bespoke__quote">
                {c.bespoke.title} <span className="script">{c.bespoke.script}</span>
              </h2>
              <p className="body body--lg boutique-bespoke__sub">
                <Lines text={c.bespoke.sub} />
              </p>
              <div className="boutique-bespoke__cta">
                <Link href={c.bespoke.primary.href} className="btn btn--filled">
                  {c.bespoke.primary.label} <ArrowRight />
                </Link>
                <Link href={c.bespoke.secondary.href} className="btn">
                  {c.bespoke.secondary.label}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}
