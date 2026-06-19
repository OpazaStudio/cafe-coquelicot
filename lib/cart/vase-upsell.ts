// Déclencheur du cross-sell vase (page /panier) — logique pure, testée.
// "fleur" = tout item dont le slug n'est pas un vase actif. On propose un
// vase dès qu'il y a des fleurs et aucun vase dans le panier.
import type { Cart } from "./cart";

export function shouldSuggestVases(items: Cart, vaseSlugs: Set<string>): boolean {
  const hasVase = items.some((i) => vaseSlugs.has(i.slug));
  const hasFlowers = items.some((i) => !vaseSlugs.has(i.slug));
  return hasFlowers && !hasVase;
}
