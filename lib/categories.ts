import type { ProductCategory } from "./db/schema";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  frais: "Bouquets frais",
  seche: "Bouquets séchés",
  compo: "Compositions séchées",
  vase: "Vases",
};

// Les 6 variantes d'illustration au trait (components/illustrations.tsx).
export const VARIANT_LABELS: Record<number, string> = {
  0: "Bouquet rond",
  1: "Tiges hautes",
  2: "Blé séché",
  3: "Grande fleur",
  4: "Pampas",
  5: "Eucalyptus",
};
