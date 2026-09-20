import type { NewProductRow } from "./schema";

// Catalogue historique du site vitrine (components/boutique.tsx), prix "dès X€" → price_cents.
// `estran` avait deux variantes divergentes (3 en boutique, 5 sur la home) : la valeur
// boutique fait foi.
export const SEED_PRODUCTS: NewProductRow[] = [
  { slug: "rivage", name: "rivage", description: "Pivoines, eucalyptus, blé, ruban lin.", priceCents: 4800, category: "frais", badge: null, illustrationVariant: 0 },
  { slug: "gabut", name: "gabut", description: "Renoncules, anémones, branches fruitières.", priceCents: 3800, category: "frais", badge: "Saison", illustrationVariant: 3 },
  { slug: "minimes", name: "minimes", description: "Roses, statice, gypsophile, papier kraft.", priceCents: 4200, category: "frais", badge: null, illustrationVariant: 0 },
  { slug: "embruns", name: "embruns", description: "Cueillette locale, jamais deux fois pareil.", priceCents: 3200, category: "frais", badge: "Local", illustrationVariant: 2 },
  { slug: "sirocco", name: "sirocco", description: "Pampas, lagurus, ruscus, longue tenue.", priceCents: 3600, category: "seche", badge: "Sans eau", illustrationVariant: 4 },
  { slug: "solana", name: "solana", description: "Immortelles, statice, avoine — tient des mois.", priceCents: 3400, category: "seche", badge: null, illustrationVariant: 2 },
  { slug: "alize", name: "alizé", description: "À suspendre, fleurs et graminées du marais.", priceCents: 4400, category: "seche", badge: null, illustrationVariant: 4 },
  { slug: "mistral", name: "mistral", description: "Vase céramique inclus, fleurs fraîches.", priceCents: 6500, category: "compo", badge: null, illustrationVariant: 1 },
  { slug: "lagune", name: "lagune", description: "Pour la table, dans une coupe en grès.", priceCents: 5800, category: "compo", badge: "Atelier", illustrationVariant: 1 },
  { slug: "galet", name: "galet", description: "Grès émaillé tourné, pour un bouquet rond.", priceCents: 2400, category: "vase", badge: null, illustrationVariant: 0 },
  { slug: "carene", name: "carène", description: "Lignes hautes et épurées, pour de longues tiges.", priceCents: 3800, category: "vase", badge: null, illustrationVariant: 1 },
  { slug: "ecume", name: "écume", description: "Le petit vase d'une fleur, sur un rebord de fenêtre.", priceCents: 1900, category: "vase", badge: null, illustrationVariant: 2 },
];

// Sélection mise en avant sur la home (section Shop), dans cet ordre.
export const HOME_PICKS = [
  "rivage",
  "gabut",
  "minimes",
  "sirocco",
  "mistral",
  "estran",
  "galerne",
  "embruns",
];

// Variantes de démonstration (taille = prix, coloris cosmétique). Seuls ces
// produits sont déclinés ; les autres restent vendus tels quels. Choisis hors
// des produits asservis aux e2e vitrine/panier (rivage, gabut, estran, mistral,
// carte-fleurie restent nus).
export const SEED_SIZES: Record<
  string,
  { label: string; priceCents: number; sortOrder: number }[]
> = {
  solana: [
    { label: "Petit", priceCents: 2900, sortOrder: 0 },
    { label: "Moyen", priceCents: 3400, sortOrder: 1 },
    { label: "Grand", priceCents: 4200, sortOrder: 2 },
  ],
  lagune: [
    { label: "Moyen", priceCents: 5800, sortOrder: 0 },
    { label: "Grand", priceCents: 7200, sortOrder: 1 },
  ],
};

export const SEED_COLORS: Record<
  string,
  { label: string; illustrationVariant: number; sortOrder: number }[]
> = {
  solana: [
    { label: "Naturel", illustrationVariant: 2, sortOrder: 0 },
    { label: "Blanc", illustrationVariant: 4, sortOrder: 1 },
  ],
};

// Construit les lignes enfants à insérer une fois les produits créés (ids connus).
export function buildChildSeedRows(idBySlug: Map<string, string>) {
  const sizes: {
    productId: string;
    label: string;
    priceCents: number;
    sortOrder: number;
  }[] = [];
  const colors: {
    productId: string;
    label: string;
    illustrationVariant: number;
    sortOrder: number;
  }[] = [];
  for (const [slug, list] of Object.entries(SEED_SIZES)) {
    const pid = idBySlug.get(slug);
    if (pid) for (const s of list) sizes.push({ productId: pid, ...s });
  }
  for (const [slug, list] of Object.entries(SEED_COLORS)) {
    const pid = idBySlug.get(slug);
    if (pid) for (const c of list) colors.push({ productId: pid, ...c });
  }
  return { sizes, colors };
}
