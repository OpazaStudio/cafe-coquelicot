// Logique panier pure (testée unitairement) — l'état vit côté client
// (localStorage), les prix sont TOUJOURS revalidés en base au checkout.
// Identité de ligne = `key` : slug seul si pas de variante, sinon
// slug__sizeId__colorId (la taille porte le prix, le coloris est cosmétique
// mais distinct — deux coloris d'une même taille = deux lignes).

export type CartItem = {
  key: string;
  slug: string;
  sizeId: string | null;
  colorId: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  name: string;
  priceCents: number;
  qty: number;
};

// Entrée d'ajout : les champs variante sont optionnels (produit nu = aucun).
export type CartItemInput = {
  slug: string;
  name: string;
  priceCents: number;
  sizeId?: string | null;
  colorId?: string | null;
  sizeLabel?: string | null;
  colorLabel?: string | null;
};

export type Cart = CartItem[];

export const MAX_QTY = 99;

export function cartItemKey(
  slug: string,
  sizeId?: string | null,
  colorId?: string | null,
): string {
  if (!sizeId && !colorId) return slug;
  return `${slug}__${sizeId ?? ""}__${colorId ?? ""}`;
}

export function addItem(cart: Cart, item: CartItemInput, qty = 1): Cart {
  const sizeId = item.sizeId ?? null;
  const colorId = item.colorId ?? null;
  const key = cartItemKey(item.slug, sizeId, colorId);
  const existing = cart.find((i) => i.key === key);
  if (existing) {
    return cart.map((i) =>
      i.key === key ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) } : i,
    );
  }
  return [
    ...cart,
    {
      key,
      slug: item.slug,
      sizeId,
      colorId,
      sizeLabel: item.sizeLabel ?? null,
      colorLabel: item.colorLabel ?? null,
      name: item.name,
      priceCents: item.priceCents,
      qty: Math.min(Math.max(qty, 1), MAX_QTY),
    },
  ];
}

export function removeItem(cart: Cart, key: string): Cart {
  return cart.filter((i) => i.key !== key);
}

export function setQty(cart: Cart, key: string, qty: number): Cart {
  if (qty <= 0) return removeItem(cart, key);
  return cart.map((i) =>
    i.key === key ? { ...i, qty: Math.min(qty, MAX_QTY) } : i,
  );
}

export function cartCount(cart: Cart): number {
  return cart.reduce((n, i) => n + i.qty, 0);
}

export function cartSubtotalCents(cart: Cart): number {
  return cart.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
}

// Garde-fou à la relecture du localStorage (versions antérieures, données
// corrompues). La `key` est TOUJOURS recalculée (jamais celle stockée).
export function sanitizeCart(value: unknown): Cart {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (
      typeof r.slug !== "string" ||
      typeof r.name !== "string" ||
      !Number.isInteger(r.priceCents) ||
      (r.priceCents as number) < 0 ||
      !Number.isInteger(r.qty)
    ) {
      return [];
    }
    const sizeId = typeof r.sizeId === "string" ? r.sizeId : null;
    const colorId = typeof r.colorId === "string" ? r.colorId : null;
    return [
      {
        key: cartItemKey(r.slug, sizeId, colorId),
        slug: r.slug,
        sizeId,
        colorId,
        sizeLabel: typeof r.sizeLabel === "string" ? r.sizeLabel : null,
        colorLabel: typeof r.colorLabel === "string" ? r.colorLabel : null,
        name: r.name,
        priceCents: r.priceCents as number,
        qty: Math.min(Math.max(r.qty as number, 1), MAX_QTY),
      },
    ];
  });
}
