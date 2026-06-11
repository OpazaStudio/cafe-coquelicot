import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/sections";
import { BoutiqueShop } from "@/components/boutique";
import { getActiveProducts } from "@/lib/products";
import { ArrowRight, IconDelivery, IconSubscription, IconWorkshop } from "@/components/illustrations";

export const metadata: Metadata = {
  title: "La boutique — Coquelicot · Fleuriste La Rochelle",
  description:
    "Bouquets frais & séchés, compositions, branches et petits formats. La boutique en ligne de l'atelier Coquelicot, cueilli le matin même à La Rochelle.",
};

// Le catalogue vit en base : rendu à la demande, jamais figé au build.
export const dynamic = "force-dynamic";

export default async function BoutiquePage() {
  const catalogue = await getActiveProducts();

  return (
    <>
      <SiteHeader />
      <main>
        {/* Boutique intro */}
        <section data-section data-bg="linen" className="boutique-hero">
          <div className="container">
            <nav className="boutique-crumb reveal" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <span>boutique</span>
            </nav>
            <div className="boutique-hero__inner">
              <h1 className="display boutique-hero__title reveal">
                la boutique
                <span className="script">fraîche du jour</span>
              </h1>
              <div className="boutique-hero__intro reveal">
                <p className="eyebrow">Collection · Printemps 2026</p>
                <p className="body body--lg">
                  Quatorze compositions du moment, renouvelées chaque semaine au
                  gré de la saison et de ce que le marché nous propose. Commandez
                  avant 14h pour une livraison à vélo le jour même dans La Rochelle.
                </p>
              </div>
            </div>
            <BoutiqueShop catalogue={catalogue} />
          </div>
        </section>

        {/* Reassurance strip */}
        <section data-section data-bg="burgundy" className="boutique-perks">
          <div className="container">
            <div className="boutique-perks__grid reveal">
              <div className="boutique-perk">
                <IconDelivery className="boutique-perk__icon" />
                <h2 className="boutique-perk__title">livraison vélo</h2>
                <p className="boutique-perk__desc">
                  Le jour même dans toute La Rochelle pour toute commande
                  passée avant 14h. Dès 6€.
                </p>
              </div>
              <div className="boutique-perk">
                <IconSubscription className="boutique-perk__icon" />
                <h2 className="boutique-perk__title">abonnement</h2>
                <p className="boutique-perk__desc">
                  Un bouquet frais à votre porte chaque semaine, quinzaine ou
                  mois. Vous choisissez tout.
                </p>
              </div>
              <div className="boutique-perk">
                <IconWorkshop className="boutique-perk__icon" />
                <h2 className="boutique-perk__title">cueilli le matin</h2>
                <p className="boutique-perk__desc">
                  Producteurs locaux et cueillette en bord de marais.
                  Jamais de fleurs hors-saison.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bespoke CTA */}
        <section data-section data-bg="coffee-bean-2" className="boutique-bespoke">
          <div className="container">
            <div className="boutique-bespoke__inner reveal">
              <p className="eyebrow">Une envie particulière ?</p>
              <p className="boutique-bespoke__quote">
                on compose aussi <span className="script">sur mesure.</span>
              </p>
              <p className="body body--lg boutique-bespoke__sub">
                Mariage, événement, cadeau d&apos;entreprise ou simple coup de
                cœur — dites-nous ce que vous imaginez, on s&apos;occupe du reste.
              </p>
              <div className="boutique-bespoke__cta">
                <Link href="/#prestations" className="btn btn--filled">
                  Voir nos prestations <ArrowRight />
                </Link>
                <Link href="/#contact" className="btn">
                  Nous écrire
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
