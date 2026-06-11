// Logique panier pure (testée unitairement) — l'état vit côté client
// (localStorage), les prix sont TOUJOURS revalidés en base au checkout.

export type CartItem = {
  slug: string;
  name: string;
  priceCents: number;
  qty: number;
};

export type Cart = CartItem[];

export const MAX_QTY = 99;

export function addItem(
  cart: Cart,
  item: Omit<CartItem, "qty">,
  qty = 1,
): Cart {
  const existing = cart.find((i) => i.slug === item.slug);
  if (existing) {
    return cart.map((i) =>
      i.slug === item.slug
        ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) }
        : i,
    );
  }
  return [...cart, { ...item, qty: Math.min(Math.max(qty, 1), MAX_QTY) }];
}

export function removeItem(cart: Cart, slug: string): Cart {
  return cart.filter((i) => i.slug !== slug);
}

export function setQty(cart: Cart, slug: string, qty: number): Cart {
  if (qty <= 0) return removeItem(cart, slug);
  return cart.map((i) =>
    i.slug === slug ? { ...i, qty: Math.min(qty, MAX_QTY) } : i,
  );
}

export function cartCount(cart: Cart): number {
  return cart.reduce((n, i) => n + i.qty, 0);
}

export function cartSubtotalCents(cart: Cart): number {
  return cart.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
}

// Garde-fou à la relecture du localStorage (versions antérieures, données corrompues).
export function sanitizeCart(value: unknown): Cart {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as CartItem).slug !== "string" ||
      typeof (raw as CartItem).name !== "string" ||
      !Number.isInteger((raw as CartItem).priceCents) ||
      (raw as CartItem).priceCents < 0 ||
      !Number.isInteger((raw as CartItem).qty)
    ) {
      return [];
    }
    const item = raw as CartItem;
    return [{ ...item, qty: Math.min(Math.max(item.qty, 1), MAX_QTY) }];
  });
}
