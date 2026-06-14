// Coquelicot site sections. Static content rendered on the server;
// interactive bits (newsletter form, reveal, cursor) are client components.

import type { ComponentType } from "react";
import Link from "next/link";
import type { ShopProduct } from "@/lib/products";
import {
  HeroStorefront, Bouquet, MapDoodle, AboutFlorist,
  IconWedding, IconEvent, IconSubscription, IconWorkshop, IconCorporate, IconDelivery,
  ArrowRight, ArrowDiag,
} from "./illustrations";
import { Newsletter } from "./newsletter";
import { CartLink } from "./cart-link";

export type SectionBg = "linen" | "burgundy" | "pale-oak" | "coffee-bean" | "coffee-bean-2";

type SectionProps = { bg: SectionBg };

// ─── Header ─────────────────────────────────────────────────────
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-header__logo">coquelicot</Link>
      <nav className="site-header__nav">
        <Link href="/boutique">Boutique</Link>
        <Link href="/#gallery">Galerie</Link>
        <Link href="/#prestations">Prestations</Link>
        <Link href="/#about">À propos</Link>
        <Link href="/#contact">Contact</Link>
      </nav>
      <div className="site-header__right">
        <CartLink />
      </div>
    </header>
  );
}

// ─── Hero ──────────────────────────────────────────────────────
export function Hero({ bg }: SectionProps) {
  return (
    <section id="hero" data-section data-bg={bg} className="hero">
      <div className="hero__inner">
        <div className="hero__media reveal">
          <HeroStorefront />
        </div>
        <div className="hero__text">
          <p className="eyebrow reveal">Fleuriste · La Rochelle · depuis 2019</p>
          <h1 className="display hero__display reveal">
            coquelicot
            <span className="script">fleurs fraîches &amp; séchées</span>
          </h1>
          <p className="body body--lg hero__sub reveal">
            Un atelier-boutique pensé pour celles &amp; ceux qui veulent offrir
            (ou s&apos;offrir) un bouquet qui raconte quelque chose. Brut, sincère,
            jamais convenu.
          </p>
          <div className="hero__cta reveal">
            <Link href="/boutique" className="btn btn--filled">
              Voir la boutique <ArrowRight />
            </Link>
            <a href="#prestations" className="btn">
              Nos prestations
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Shop ──────────────────────────────────────────────────────
// La sélection de la home vient de la base (lib/products.ts, HOME_PICKS),
// passée par app/page.tsx.

export function Shop({ bg, products }: SectionProps & { products: ShopProduct[] }) {
  return (
    <section id="shop" data-section data-bg={bg} className="shop">
      <div className="container">
        <div className="shop__head">
          <h2 className="display shop__title reveal">
            nos bouquets,
            <br />
            <span className="script">savamment</span> composés
          </h2>
          <div className="shop__intro reveal">
            <p className="eyebrow">Collection · Printemps 2026</p>
            <p className="body">
              Huit compositions du moment, renouvelées chaque semaine au gré
              de la saison et de ce que le marché nous propose. Tout est cueilli
              ou réceptionné le matin même.
            </p>
            <Link href="/boutique" className="link-arrow">
              Toute la boutique <ArrowRight />
            </Link>
          </div>
        </div>
        <div className="shop__grid reveal">
          {products.map((p) => (
            <ProductCard key={p.slug} {...p} />
          ))}
        </div>
        <div className="shop__cta reveal">
          <Link href="/boutique" className="btn">
            Voir toute la boutique <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ name, tag, desc, price, variant, badge }: ShopProduct) {
  return (
    <article className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <Bouquet variant={variant} />
      </div>
      <div>
        <p className="eyebrow" style={{ opacity: 0.6, marginBottom: 6 }}>{tag}</p>
        <h3 className="product-card__name">{name}</h3>
      </div>
      <div className="product-card__row">
        <p className="product-card__desc">{desc}</p>
        <span className="product-card__price">{price}</span>
      </div>
    </article>
  );
}

// ─── Gallery ───────────────────────────────────────────────────
type Tile =
  | { type: "illu"; variant: number; cls: string }
  | { type: "label"; label: string; script: string; cls: string };

const TILES: Tile[] = [
  { type: "illu", variant: 0, cls: "tile--1" },
  { type: "label", label: "tout est", script: "saison", cls: "tile--2" },
  { type: "illu", variant: 4, cls: "tile--4" },
  { type: "illu", variant: 3, cls: "tile--3" },
  { type: "label", label: "beau", script: "✿", cls: "tile--7" },
  { type: "illu", variant: 5, cls: "tile--6" },
  { type: "illu", variant: 2, cls: "tile--5" },
  { type: "illu", variant: 1, cls: "tile--8" },
];

export function Gallery({ bg }: SectionProps) {
  return (
    <section id="gallery" data-section data-bg={bg} className="gallery">
      <div className="container">
        <div className="gallery__head reveal">
          <p className="eyebrow">L&apos;atelier en images</p>
          <h2 className="display gallery__title">
            on aime
            <br />
            <span className="script">le beau et le sincère.</span>
          </h2>
          <p className="body body--lg gallery__sub">
            Pas de fleurs hors-saison, pas de transport aérien, pas de
            mousse Oasis. Juste ce que la terre veut bien nous donner —
            et qu&apos;on assemble avec soin.
          </p>
        </div>
        <div className="gallery__grid reveal">
          {TILES.map((t, i) => (
            <div key={i} className={`gallery__tile ${t.cls}${t.type === "label" ? " gallery__tile--label" : ""}`}>
              {t.type === "illu" ? (
                <Bouquet variant={t.variant} />
              ) : (
                <>
                  <div className="gallery__tile-label">{t.label}</div>
                  <div className="gallery__tile-script">{t.script}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="gallery__cta reveal">
          <a href="#" className="link-arrow">
            Toutes nos réalisations <ArrowRight />
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Prestations ───────────────────────────────────────────────
type Prestation = {
  Icon: ComponentType<{ className?: string }>;
  name: string;
  desc: string;
  price: string;
};

const PRESTATIONS: Prestation[] = [
  {
    Icon: IconWedding,
    name: "mariages",
    desc: "Bouquet de la mariée, boutonnières, arche, décor de table — on conçoit ensemble la scénographie florale de votre jour.",
    price: "sur devis",
  },
  {
    Icon: IconEvent,
    name: "événementiel",
    desc: "Galas, vernissages, lancements, anniversaires. Installations florales sur-mesure pour transformer un lieu.",
    price: "dès 350€",
  },
  {
    Icon: IconSubscription,
    name: "abonnement",
    desc: "Un bouquet frais à votre porte chaque semaine, quinzaine ou mois. Vous choisissez la fréquence et le budget.",
    price: "dès 35€/mois",
  },
  {
    Icon: IconWorkshop,
    name: "ateliers",
    desc: "Apprenez à composer chez nous — bouquet champêtre, couronne séchée, ikebana. En groupe ou en privé.",
    price: "65€ / pers.",
  },
  {
    Icon: IconCorporate,
    name: "entreprises",
    desc: "Réception, salle de réunion, vitrine, événement client. Forfait livraison régulière ou prestation ponctuelle.",
    price: "sur devis",
  },
  {
    Icon: IconDelivery,
    name: "livraison",
    desc: "Livraison en vélo dans toute La Rochelle le jour même, jusqu’à 17h. Au-delà, expédition France métropolitaine.",
    price: "dès 6€",
  },
];

export function Prestations({ bg }: SectionProps) {
  return (
    <section id="prestations" data-section data-bg={bg} className="prestations">
      <div className="container">
        <div className="prestations__head reveal">
          <p className="eyebrow">Ce qu&apos;on fait, au-delà du bouquet</p>
          <h2 className="display prestations__title">
            prestations
            <span className="script">sur mesure</span>
          </h2>
          <p className="body body--lg prestations__sub">
            Du bouquet hebdomadaire à la scénographie d&apos;un mariage entier,
            on intervient à toutes les échelles. Toujours avec la même exigence.
          </p>
        </div>
        <div className="prestations__grid reveal">
          {PRESTATIONS.map(({ Icon, name, desc, price }) => (
            <article key={name} className="prestation-card">
              <Icon className="prestation-card__icon" />
              <h3 className="prestation-card__name">{name}</h3>
              <p className="prestation-card__desc">{desc}</p>
              <div className="prestation-card__price">{price}</div>
              <span className="prestation-card__arrow">
                <ArrowDiag size={28} />
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Atelier strip — big quote ─────────────────────────────────
export function AtelierStrip({ bg }: SectionProps) {
  return (
    <section data-section data-bg={bg} className="atelier-strip">
      <div className="container">
        <div className="atelier-strip__inner reveal">
          <p className="eyebrow">Notre crédo</p>
          <p className="atelier-strip__quote">
            une fleur cueillie aujourd&apos;hui
            <br />
            vaut <span className="script">mille importées d&apos;hier.</span>
          </p>
          <p className="atelier-strip__author">— Léa &amp; l&apos;équipe</p>
        </div>
      </div>
    </section>
  );
}

// ─── About ─────────────────────────────────────────────────────
export function About({ bg }: SectionProps) {
  return (
    <section id="about" data-section data-bg={bg} className="about">
      <div className="container">
        <div className="about__inner">
          <div className="about__media reveal">
            <div className="about__sticker">depuis 2019</div>
            <AboutFlorist />
          </div>
          <div className="reveal">
            <p className="eyebrow">L&apos;histoire</p>
            <h2 className="display about__title">
              coquelicot
              <span className="script">c&apos;est qui ?</span>
            </h2>
            <p className="body body--lg about__lede">
              Léa a quitté son agence parisienne en 2019 pour ouvrir un
              petit atelier rue du Gabut, à deux pas du vieux port.
            </p>
            <p className="body about__body">
              On travaille avec des producteurs locaux de Charente-Maritime,
              on cueille nous-mêmes ce qui pousse en bord de marais, et on
              compose ce qui nous fait plaisir. Pas de fioriture inutile,
              pas de cellophane, pas de roses en plein hiver. Juste l&apos;envie
              de transmettre l&apos;émotion d&apos;une saison.
            </p>
            <a href="#" className="btn about__cta">
              Lire la suite <ArrowRight />
            </a>
            <div className="about__stats">
              <div>
                <div className="about__stat-num">6</div>
                <div className="about__stat-label">ans d&apos;atelier</div>
              </div>
              <div>
                <div className="about__stat-num">+200</div>
                <div className="about__stat-label">mariages fleuris</div>
              </div>
              <div>
                <div className="about__stat-num">12</div>
                <div className="about__stat-label">producteurs locaux</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Contact + Newsletter ──────────────────────────────────────
export function Contact({ bg }: SectionProps) {
  return (
    <section id="contact" data-section data-bg={bg} className="contact">
      <div className="container">
        <div className="contact__inner">
          <div className="reveal">
            <p className="eyebrow">Venir, écrire, suivre</p>
            <h2 className="display contact__title">
              passez
              <span className="script">nous voir.</span>
            </h2>
            <p className="body body--lg contact__sub">
              L&apos;atelier est ouvert du mardi au samedi.
              On répond aussi vite que possible — promis.
            </p>
            <div className="contact__info">
              <div>
                <div className="contact__info-label">Adresse</div>
                <div className="contact__info-value">
                  12 rue<br />du gabut
                </div>
                <div className="contact__info-value contact__info-value--small" style={{ marginTop: 8 }}>
                  17000 La Rochelle
                </div>
              </div>
              <div>
                <div className="contact__info-label">Horaires</div>
                <div className="contact__info-value contact__info-value--small">
                  Mardi → Vendredi<br />
                  9h30 – 13h · 15h – 19h<br /><br />
                  Samedi<br />
                  9h30 – 19h non-stop<br /><br />
                  Dimanche &amp; lundi<br />
                  fermé
                </div>
              </div>
              <div>
                <div className="contact__info-label">Téléphone</div>
                <div className="contact__info-value">05 46 00<br />00 00</div>
              </div>
              <div>
                <div className="contact__info-label">Email</div>
                <div className="contact__info-value contact__info-value--small">
                  bonjour@<br />
                  coquelicot-lr.fr<br /><br />
                  <a href="#" style={{ borderBottom: "1px solid currentColor" }}>@coquelicot.lr</a>
                </div>
              </div>
            </div>
            <div className="contact__map">
              <MapDoodle />
            </div>
          </div>
          <div className="reveal">
            <Newsletter />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            coquelicot
            <span className="script">à très vite</span>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">Boutique</h4>
            <ul>
              <li><Link href="/boutique">Bouquets frais</Link></li>
              <li><Link href="/boutique">Fleurs séchées</Link></li>
              <li><Link href="/boutique">Compositions</Link></li>
              <li><Link href="/boutique">Cartes cadeaux</Link></li>
            </ul>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">Prestations</h4>
            <ul>
              <li><Link href="/#prestations">Mariages</Link></li>
              <li><Link href="/#prestations">Événementiel</Link></li>
              <li><Link href="/#prestations">Abonnement</Link></li>
              <li><Link href="/#prestations">Ateliers</Link></li>
            </ul>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">Studio</h4>
            <ul>
              <li><Link href="/#about">À propos</Link></li>
              <li><Link href="/#contact">Contact</Link></li>
              <li><a href="#">Instagram</a></li>
              <li><a href="#">Presse</a></li>
            </ul>
          </div>
        </div>
        <div className="site-footer__bottom">
          <div>© 2026 Coquelicot — La Rochelle</div>
          <div>Mentions légales · CGV · Livraison &amp; retours</div>
        </div>
      </div>
    </footer>
  );
}
