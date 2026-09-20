import type { ComponentType } from "react";
import Link from "next/link";
import type { ShopProduct } from "@/lib/products";
import type { HomeContent } from "@/lib/content/pages/home";
import type { SiteContent } from "@/lib/content/pages/site";
import {
  HeroStorefront, Bouquet, AboutFlorist, ProductFigure,
  IconWedding, IconEvent, IconSubscription, IconWorkshop, IconCorporate, IconDelivery,
  ArrowRight, ArrowDiag,
} from "./illustrations";
import { ContactForm } from "./contact-form";
import { ManageCookiesButton } from "./consent/manage-cookies-button";
import { CartLink } from "./cart-link";
import { Logo } from "./logo";
import { ContentImage, hasContentImage } from "./content/content-image";
import { Lines, Paragraphs } from "./content/text";

export type SectionBg = "linen" | "burgundy" | "pale-oak" | "coffee-bean" | "coffee-bean-2";

type SectionProps = { bg: SectionBg };

export function SiteHeader({ nav }: { nav: SiteContent["header"]["nav"] }) {
  return (
    <header className="site-header">
      <Link href="/" className="site-header__logo" aria-label="Café Coquelicot">
        <Logo />
      </Link>
      <nav className="site-header__nav">
        {nav.map((item, i) => (
          <Link key={i} href={item.href}>{item.label}</Link>
        ))}
      </nav>
      <div className="site-header__right">
        <CartLink />
      </div>
    </header>
  );
}

export function Hero({ bg, content }: SectionProps & { content: HomeContent["hero"] }) {
  const hasPhoto = hasContentImage(content.image);
  return (
    <section id="hero" data-section data-bg={bg} className="hero">
      <div className="hero__inner">
        <div className={`hero__media reveal${hasPhoto ? " hero__media--photo" : ""}`}>
          <ContentImage image={content.image} fallback={<HeroStorefront />} sizes="(max-width: 900px) 100vw, 600px" />
        </div>
        <div className="hero__text">
          <h1 className="hero__display reveal">
            <Lines text={content.title} />
            <span className="script">{content.script}</span>
          </h1>
          <p className="body body--lg hero__sub reveal">
            <Lines text={content.sub} />
          </p>
          <div className="hero__cta reveal">
            <Link href={content.primary.href} className="btn btn--filled">
              {content.primary.label} <ArrowRight />
            </Link>
            <Link href={content.secondary.href} className="btn">
              {content.secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// La sélection de la home vient de la base (lib/products.ts, HOME_PICKS),
// passée par app/page.tsx.

export function Shop({ bg, content, products }: SectionProps & { content: HomeContent["shop"]; products: ShopProduct[] }) {
  return (
    <section id="shop" data-section data-bg={bg} className="shop">
      <div className="container">
        <div className="shop__head">
          <h2 className="shop__title reveal">
            {content.title}
            <br />
            <span className="script">{content.script}</span> {content.after}
          </h2>
          <div className="shop__intro reveal">
            <p className="eyebrow">{content.eyebrow}</p>
            <p className="body">
              <Lines text={content.body} />
            </p>
            <Link href="/boutique" className="link-arrow">
              {content.link} <ArrowRight />
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
            {content.cta} <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ slug, name, price, variant, badge, category, imagePath, imageBgColor }: ShopProduct) {
  return (
    <Link href={`/boutique/${slug}`} className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <ProductFigure
          category={category}
          variant={variant}
          imagePath={imagePath}
          imageBgColor={imageBgColor}
          alt={name}
        />
      </div>
      <div className="product-card__row">
        <h3 className="product-card__name">{name}</h3>
        <span className="product-card__price">{price}</span>
      </div>
    </Link>
  );
}

const TILE_LAYOUT = [
  { cls: "tile--1", variant: 0 },
  { cls: "tile--2", variant: 2 },
  { cls: "tile--4", variant: 4 },
  { cls: "tile--3", variant: 3 },
  { cls: "tile--7", variant: 5 },
  { cls: "tile--6", variant: 5 },
  { cls: "tile--5", variant: 2 },
  { cls: "tile--8", variant: 1 },
];

export function Gallery({ bg, content }: SectionProps & { content: HomeContent["gallery"] }) {
  return (
    <section id="gallery" data-section data-bg={bg} className="gallery">
      <div className="container">
        <div className="gallery__head reveal">
          <h2 className="gallery__title">
            {content.title}
            <br />
            <span className="script">{content.script}</span>
          </h2>
          <p className="body body--lg gallery__sub">
            <Lines text={content.sub} />
          </p>
        </div>
        <div className="gallery__grid reveal">
          {content.tiles.slice(0, TILE_LAYOUT.length).map((tile, i) => {
            const layout = TILE_LAYOUT[i];
            const isLabel = tile.kind === "mot";
            return (
              <div key={i} className={`gallery__tile ${layout.cls}${isLabel ? " gallery__tile--label" : ""}`}>
                {isLabel ? (
                  <>
                    <div className="gallery__tile-label">{tile.label}</div>
                    {tile.script && <div className="gallery__tile-script">{tile.script}</div>}
                  </>
                ) : (
                  <ContentImage
                    image={tile.image}
                    fallback={<Bouquet variant={layout.variant} />}
                    sizes="(max-width: 700px) 50vw, 25vw"
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="gallery__cta reveal">
          <Link href={content.cta.href} className="link-arrow">
            {content.cta.label} <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}

const PRESTATION_ICON: Record<string, ComponentType<{ className?: string }>> = {
  mariage: IconWedding,
  evenement: IconEvent,
  abonnement: IconSubscription,
  atelier: IconWorkshop,
  entreprise: IconCorporate,
  livraison: IconDelivery,
};

export function Prestations({ bg, content }: SectionProps & { content: HomeContent["prestations"] }) {
  return (
    <section id="prestations" data-section data-bg={bg} className="prestations">
      <div className="container">
        <div className="prestations__head reveal">
          <h2 className="prestations__title">
            {content.title}
            <span className="script">{content.script}</span>
          </h2>
          <Paragraphs text={content.intro} className="body body--lg prestations__sub" />
        </div>
        <div className="prestations__grid reveal">
          {content.items.map((item, i) => {
            const Icon = PRESTATION_ICON[item.icon] ?? IconWedding;
            return (
              <article key={i} className="prestation-card">
                <Icon className="prestation-card__icon" />
                <h3 className="prestation-card__name">{item.name}</h3>
                <p className="prestation-card__desc">{item.desc}</p>
                <div className="prestation-card__price">{item.price}</div>
                <span className="prestation-card__arrow">
                  <ArrowDiag size={28} />
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AtelierStrip({ bg, content }: SectionProps & { content: HomeContent["atelier"] }) {
  return (
    <section data-section data-bg={bg} className="atelier-strip">
      <div className="container">
        <div className="atelier-strip__inner reveal">
          <p className="atelier-strip__quote">
            <Lines text={content.quote} /> <span className="script">{content.script}</span>
          </p>
          <p className="atelier-strip__author">{content.author}</p>
        </div>
      </div>
    </section>
  );
}

export function About({ bg, content }: SectionProps & { content: HomeContent["about"] }) {
  return (
    <section id="about" data-section data-bg={bg} className="about">
      <div className="container">
        <div className="about__inner">
          <div className="about__media reveal">
            {content.sticker && <div className="about__sticker">{content.sticker}</div>}
            <ContentImage image={content.image} fallback={<AboutFlorist />} sizes="(max-width: 900px) 100vw, 50vw" />
          </div>
          <div className="reveal">
            <h2 className="about__title">
              {content.title}
              <span className="script">{content.script}</span>
            </h2>
            <Paragraphs text={content.lede} className="body body--lg about__lede" />
            <Paragraphs text={content.body} className="body about__body" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Contact({ bg, content }: SectionProps & { content: HomeContent["contact"] }) {
  return (
    <section id="contact" data-section data-bg={bg} className="contact">
      <div className="container">
        <div className="contact__inner reveal">
          <h2 className="contact__title">
            {content.title}
            <span className="script">{content.script}</span>
          </h2>
          <p className="body body--lg contact__sub">
            <Lines text={content.sub} />
          </p>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

export function SiteFooter({ footer }: { footer: SiteContent["footer"] }) {
  const external = [
    { label: "Instagram", href: footer.instagram },
    { label: "Presse", href: footer.presse },
  ].filter((l) => l.href !== "");
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Logo />
            <span className="sr-only">Café Coquelicot</span>
            <span className="script">{footer.script}</span>
          </div>
          {footer.columns.map((column, ci) => (
            <div key={ci} className="site-footer__col">
              <h4 className="site-footer__col-title">{column.title}</h4>
              <ul>
                {column.links.map((link, li) => (
                  <li key={li}><Link href={link.href}>{link.label}</Link></li>
                ))}
                {ci === footer.columns.length - 1 &&
                  external.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="site-footer__bottom">
          <a href="https://opaza.fr" target="_blank" rel="noopener noreferrer">Développé par Opaza Studio</a>
          <div className="site-footer__legal">
            <Link href="/mentions-legales">Mentions légales</Link>
            <span aria-hidden>·</span>
            <Link href="/cgv">CGV</Link>
            <span aria-hidden>·</span>
            <Link href="/livraison-retours">Livraison &amp; retours</Link>
            <span aria-hidden>·</span>
            <Link href="/confidentialite">Confidentialité</Link>
            <ManageCookiesButton />
          </div>
        </div>
      </div>
    </footer>
  );
}
