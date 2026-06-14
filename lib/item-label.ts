// Libellé d'affichage d'une ligne de commande/panier, taille & coloris inclus.
// Module PUR (aucun import db) : consommé côté client (kanban, confirmation,
// panier) ET serveur (Stripe). Surtout pas dans lib/products.ts, qui importe
// getDb (les composants client ne l'importent qu'en `import type`).
export function composeItemName(
  name: string,
  sizeLabel?: string | null,
  colorLabel?: string | null,
): string {
  let result = name;
  if (sizeLabel) result += ` — ${sizeLabel}`;
  if (colorLabel) result += ` · ${colorLabel}`;
  return result;
}
