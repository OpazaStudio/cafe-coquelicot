// Helpers GA4 e-commerce — émission d'événements via gtag (dataLayer) géré par
// le composant <GoogleAnalytics> de @next/third-parties, monté dans le layout
// racine. Tout est no-op tant que NEXT_PUBLIC_GA_MEASUREMENT_ID n'est pas un
// vrai ID (placeholder `G-XXXXXXXXXX` ou absent = analytics désactivé).
import { sendGAEvent } from "@next/third-parties/google";

const PLACEHOLDER = "G-XXXXXXXXXX";
const rawId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/** ID de mesure validé, ou undefined si non configuré (dev, placeholder…). */
export const GA_MEASUREMENT_ID =
  rawId && rawId !== PLACEHOLDER && /^G-[A-Z0-9]{4,}$/.test(rawId)
    ? rawId
    : undefined;

export const isGaEnabled = GA_MEASUREMENT_ID !== undefined;

const CURRENCY = "EUR";

/** Centimes (integer) → unités majeures EUR attendues par GA4 (ex. 4850 → 48.5). */
function toEuros(cents: number): number {
  return Math.round(cents) / 100;
}

/** Item GA4 e-commerce (sous-ensemble utilisé ici). */
export type GaItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  item_variant?: string;
};

/** Forme minimale commune au panier (CartItem) et aux entrées d'ajout. */
type ItemLike = {
  id: string;
  name: string;
  priceCents: number;
  qty: number;
  sizeLabel?: string | null;
  colorLabel?: string | null;
};

export function toGaItem(i: ItemLike): GaItem {
  const variant = [i.sizeLabel, i.colorLabel].filter(Boolean).join(" · ");
  return {
    item_id: i.id,
    item_name: i.name,
    price: toEuros(i.priceCents),
    quantity: i.qty,
    ...(variant ? { item_variant: variant } : {}),
  };
}

export function trackAddToCart(item: {
  slug: string;
  name: string;
  priceCents: number;
  qty: number;
  sizeLabel?: string | null;
  colorLabel?: string | null;
}): void {
  if (!isGaEnabled) return;
  const gaItem = toGaItem({ ...item, id: item.slug });
  sendGAEvent("event", "add_to_cart", {
    currency: CURRENCY,
    value: toEuros(item.priceCents * item.qty),
    items: [gaItem],
  });
}

export function trackBeginCheckout(
  items: Array<{
    slug: string;
    name: string;
    priceCents: number;
    qty: number;
    sizeLabel?: string | null;
    colorLabel?: string | null;
  }>,
  totalCents: number,
): void {
  if (!isGaEnabled) return;
  sendGAEvent("event", "begin_checkout", {
    currency: CURRENCY,
    value: toEuros(totalCents),
    items: items.map((i) => toGaItem({ ...i, id: i.slug })),
  });
}

export function trackPurchase(purchase: {
  transactionId: string;
  valueCents: number;
  shippingCents?: number;
  items: GaItem[];
}): void {
  if (!isGaEnabled) return;
  sendGAEvent("event", "purchase", {
    transaction_id: purchase.transactionId,
    currency: CURRENCY,
    value: toEuros(purchase.valueCents),
    shipping: toEuros(purchase.shippingCents ?? 0),
    items: purchase.items,
  });
}
