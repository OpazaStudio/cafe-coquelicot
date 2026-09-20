import { pageShape, pageStrict, type ContentOf, type PageDef } from "./fields";
import { BOUTIQUE_DEF, DEFAULT_BOUTIQUE } from "./pages/boutique";
import { CHECKOUT_DEF, DEFAULT_CHECKOUT } from "./pages/checkout";
import { CONFIRMATION_DEF, DEFAULT_CONFIRMATION } from "./pages/confirmation";
import { DEFAULT_HOME, HOME_DEF } from "./pages/home";
import { DEFAULT_PANIER, PANIER_DEF } from "./pages/panier";
import { DEFAULT_SITE, SITE_DEF } from "./pages/site";

function build<D extends PageDef>(def: D, defaults: ContentOf<D>) {
  return { def, defaults, shape: pageShape(def), strict: pageStrict(def) };
}

export const PAGES = {
  site: build(SITE_DEF, DEFAULT_SITE),
  home: build(HOME_DEF, DEFAULT_HOME),
  boutique: build(BOUTIQUE_DEF, DEFAULT_BOUTIQUE),
  panier: build(PANIER_DEF, DEFAULT_PANIER),
  checkout: build(CHECKOUT_DEF, DEFAULT_CHECKOUT),
  confirmation: build(CONFIRMATION_DEF, DEFAULT_CONFIRMATION),
};

export type PageSlug = keyof typeof PAGES;
export type ContentFor<P extends PageSlug> = (typeof PAGES)[P]["defaults"];

export const PAGE_SLUGS = Object.keys(PAGES) as PageSlug[];

export const ADMIN_SLUGS: Record<PageSlug, string> = {
  site: "navigation",
  home: "accueil",
  boutique: "boutique",
  panier: "panier",
  checkout: "commander",
  confirmation: "confirmation",
};

export function isPageSlug(value: string): value is PageSlug {
  return value in PAGES;
}

export function pageFromAdminSlug(value: string): PageSlug | null {
  const found = PAGE_SLUGS.find((slug) => ADMIN_SLUGS[slug] === value);
  return found ?? null;
}

export function adminHref(slug: PageSlug): string {
  return `/admin/contenu/${ADMIN_SLUGS[slug]}`;
}
