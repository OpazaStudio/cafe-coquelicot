// Montants manipulés en centimes (integer) partout, formatés à l'affichage.

export function formatEuros(cents: number): string {
  const euros = cents / 100;
  const formatted = Number.isInteger(euros)
    ? String(euros)
    : euros.toFixed(2).replace(".", ",");
  return `${formatted}€`;
}

// Format historique des cartes produit : « dès 48€ ».
export function formatFromPrice(cents: number): string {
  return `dès ${formatEuros(cents)}`;
}

// « 48 » ou « 48,50 » (saisie admin, déjà validée par regex) → centimes.
export function parsePriceToCents(price: string): number {
  return Math.round(parseFloat(price.replace(",", ".")) * 100);
}
