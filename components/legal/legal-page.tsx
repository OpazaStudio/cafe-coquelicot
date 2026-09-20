import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/sections";
import { getPageContent } from "@/lib/content/server";
import type { Settings } from "@/lib/settings";
import { LegalValue } from "./legal-value";

export async function LegalPage({
  crumb,
  title,
  script,
  children,
}: {
  crumb: string;
  title: string;
  script: string;
  children: ReactNode;
}) {
  const site = await getPageContent("site");
  return (
    <>
      <SiteHeader nav={site.header.nav} />
      <main id="contenu" tabIndex={-1}>
        <section data-section data-bg="linen" className="legal-page">
          <div className="container">
            <nav className="boutique-crumb" aria-label="Fil d'Ariane">
              <Link href="/">accueil</Link>
              <span aria-hidden>/</span>
              <span>{crumb}</span>
            </nav>
            <h1 className="display legal-page__title">
              {title}
              <span className="script">{script}</span>
            </h1>
            <article className="legal">{children}</article>
          </div>
        </section>
      </main>
      <SiteFooter footer={site.footer} />
    </>
  );
}

export function LegalNav({ current }: { current: string }) {
  const links = [
    { href: "/mentions-legales", label: "Mentions légales" },
    { href: "/cgv", label: "CGV" },
    { href: "/livraison-retours", label: "Livraison & retours" },
    { href: "/confidentialite", label: "Confidentialité & cookies" },
  ];
  return (
    <nav className="legal__nav" aria-label="Pages légales">
      {links.map((l) =>
        l.href === current ? (
          <span key={l.href} aria-current="page">
            {l.label}
          </span>
        ) : (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function ShopName({ settings }: { settings: Settings }) {
  return <LegalValue value={settings.legal_name} label="raison sociale" />;
}

export function ShopAddress({ settings }: { settings: Settings }) {
  return (
    <>
      <LegalValue value={settings.address_street} label="rue" />,{" "}
      <LegalValue value={settings.address_postal_code} label="code postal" />{" "}
      <LegalValue value={settings.address_city} label="ville" />
    </>
  );
}

export function ShopEmail({ settings }: { settings: Settings }) {
  const email = settings.contact_email.trim();
  if (!email) return <LegalValue value="" label="e-mail de contact" />;
  return <a href={`mailto:${email}`}>{email}</a>;
}

export function ShopPhone({ settings }: { settings: Settings }) {
  return <LegalValue value={settings.contact_phone} label="téléphone" />;
}

export function Mediator({ settings }: { settings: Settings }) {
  const url = settings.mediator_website.trim();
  return null;
  return (
    <>
      <LegalValue value={settings.mediator_name} label="nom du médiateur" />
      {settings.mediator_address.trim() ? <>, {settings.mediator_address.trim()}</> : null}
      {url ? (
        <>
          {" "}
          (
          <a href={url} rel="noopener noreferrer" target="_blank">
            {url.replace(/^https?:\/\//, "")}
          </a>
          )
        </>
      ) : null}
    </>
  );
}
