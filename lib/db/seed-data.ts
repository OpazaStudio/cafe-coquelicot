import type { NewProductRow } from "./schema";

// Catalogue historique du site vitrine (components/boutique.tsx), prix "dès X€" → price_cents.
// `estran` avait deux variantes divergentes (3 en boutique, 5 sur la home) : la valeur
// boutique fait foi.
export const SEED_PRODUCTS: NewProductRow[] = [
  { slug: "rivage", name: "rivage", tag: "Bouquet signature", description: "Pivoines, eucalyptus, blé, ruban lin.", priceCents: 4800, category: "frais", badge: null, illustrationVariant: 0 },
  { slug: "gabut", name: "gabut", tag: "Bouquet du moment", description: "Renoncules, anémones, branches fruitières.", priceCents: 3800, category: "frais", badge: "Saison", illustrationVariant: 3 },
  { slug: "minimes", name: "minimes", tag: "Bouquet rond", description: "Roses, statice, gypsophile, papier kraft.", priceCents: 4200, category: "frais", badge: null, illustrationVariant: 0 },
  { slug: "embruns", name: "embruns", tag: "Bouquet sauvage", description: "Cueillette locale, jamais deux fois pareil.", priceCents: 3200, category: "frais", badge: "Local", illustrationVariant: 2 },
  { slug: "sirocco", name: "sirocco", tag: "Fleurs séchées", description: "Pampas, lagurus, ruscus, longue tenue.", priceCents: 3600, category: "seche", badge: "Sans eau", illustrationVariant: 4 },
  { slug: "solana", name: "solana", tag: "Bouquet séché", description: "Immortelles, statice, avoine — tient des mois.", priceCents: 3400, category: "seche", badge: null, illustrationVariant: 2 },
  { slug: "alize", name: "alizé", tag: "Couronne séchée", description: "À suspendre, fleurs et graminées du marais.", priceCents: 4400, category: "seche", badge: null, illustrationVariant: 4 },
  { slug: "mistral", name: "mistral", tag: "Composition vase", description: "Vase céramique inclus, fleurs fraîches.", priceCents: 6500, category: "compo", badge: null, illustrationVariant: 1 },
  { slug: "lagune", name: "lagune", tag: "Composition basse", description: "Pour la table, dans une coupe en grès.", priceCents: 5800, category: "compo", badge: "Atelier", illustrationVariant: 1 },
  { slug: "galerne", name: "galerne", tag: "Branches", description: "Eucalyptus, chêne, olivier — au mètre.", priceCents: 1800, category: "branches", badge: null, illustrationVariant: 5 },
  { slug: "ramure", name: "ramure", tag: "Feuillage frais", description: "Pour habiller un vase, une cheminée, un buffet.", priceCents: 1400, category: "branches", badge: null, illustrationVariant: 5 },
  { slug: "estran", name: "estran", tag: "Mini bouquet", description: "Pour la table, le bureau, un cadeau.", priceCents: 2200, category: "mini", badge: null, illustrationVariant: 3 },
  { slug: "comptine", name: "comptine", tag: "Bouquet de poche", description: "Le petit geste sincère, ruban assorti.", priceCents: 1600, category: "mini", badge: "Cadeau", illustrationVariant: 0 },
  { slug: "carte-fleurie", name: "carte fleurie", tag: "Carte cadeau", description: "Le bon montant, valable un an en boutique.", priceCents: 2500, category: "mini", badge: null, illustrationVariant: 3 },
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
