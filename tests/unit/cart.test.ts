import { describe, expect, it } from "vitest";
import {
  addItem,
  cartItemKey,
  cartCount,
  cartSubtotalCents,
  MAX_QTY,
  removeItem,
  sanitizeCart,
  setQty,
  type Cart,
} from "@/lib/cart/cart";

const rivage = { slug: "rivage", name: "rivage", priceCents: 4800 };
const gabut = { slug: "gabut", name: "gabut", priceCents: 3800 };
// Variante : solana Moyen/Naturel et solana Moyen/Blanc (même taille, coloris ≠)
const solanaNaturel = {
  slug: "solana",
  name: "solana",
  priceCents: 3400,
  sizeId: "s-moyen",
  colorId: "c-naturel",
  sizeLabel: "Moyen",
  colorLabel: "Naturel",
};
const solanaBlanc = {
  slug: "solana",
  name: "solana",
  priceCents: 3400,
  sizeId: "s-moyen",
  colorId: "c-blanc",
  sizeLabel: "Moyen",
  colorLabel: "Blanc",
};

describe("cartItemKey", () => {
  it("slug seul sans variante", () => {
    expect(cartItemKey("rivage", null, null)).toBe("rivage");
  });
  it("compose slug__taille__coloris avec variante", () => {
    expect(cartItemKey("solana", "s-moyen", "c-blanc")).toBe(
      "solana__s-moyen__c-blanc",
    );
  });
});

describe("addItem", () => {
  it("ajoute un produit nu (key = slug, champs variante null)", () => {
    const cart = addItem([], rivage);
    expect(cart).toEqual([
      {
        key: "rivage",
        slug: "rivage",
        name: "rivage",
        priceCents: 4800,
        sizeId: null,
        colorId: null,
        sizeLabel: null,
        colorLabel: null,
        qty: 1,
      },
    ]);
  });
  it("fusionne la même (taille,coloris)", () => {
    const cart = addItem(addItem([], solanaNaturel), solanaNaturel, 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(3);
  });
  it("sépare deux coloris d'une même taille en deux lignes", () => {
    const cart = addItem(addItem([], solanaNaturel), solanaBlanc);
    expect(cart).toHaveLength(2);
    expect(cart.map((i) => i.colorLabel)).toEqual(["Naturel", "Blanc"]);
  });
  it("plafonne à MAX_QTY", () => {
    const cart = addItem(addItem([], rivage, MAX_QTY), rivage, 5);
    expect(cart[0].qty).toBe(MAX_QTY);
  });
  it("ne mute pas le panier d'origine", () => {
    const before: Cart = addItem([], rivage);
    addItem(before, gabut);
    expect(before).toHaveLength(1);
  });
});

describe("setQty / removeItem (par key)", () => {
  const cart: Cart = addItem(addItem([], solanaNaturel), solanaBlanc);
  it("modifie la quantité de la ligne ciblée", () => {
    expect(setQty(cart, "solana__s-moyen__c-naturel", 5)[0].qty).toBe(5);
  });
  it("retire la ligne quand la quantité tombe à 0", () => {
    expect(setQty(cart, "solana__s-moyen__c-blanc", 0)).toHaveLength(1);
  });
  it("removeItem retire par key", () => {
    expect(
      removeItem(cart, "solana__s-moyen__c-naturel").map((i) => i.colorLabel),
    ).toEqual(["Blanc"]);
  });
});

describe("totaux", () => {
  it("somme les prix de variante", () => {
    const cart = addItem(addItem([], solanaNaturel, 2), gabut);
    expect(cartCount(cart)).toBe(3);
    expect(cartSubtotalCents(cart)).toBe(3400 * 2 + 3800);
  });
});

describe("sanitizeCart", () => {
  it("rejette le bruit", () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeCart("pwned")).toEqual([]);
    expect(sanitizeCart([{ slug: 1 }])).toEqual([]);
    expect(
      sanitizeCart([{ slug: "x", name: "x", priceCents: -5, qty: 1 }]),
    ).toEqual([]);
  });
  it("rétro-compatible : ancienne ligne sans key → key = slug, variante null", () => {
    const result = sanitizeCart([
      { slug: "rivage", name: "rivage", priceCents: 4800, qty: 500 },
    ]);
    expect(result).toEqual([
      {
        key: "rivage",
        slug: "rivage",
        name: "rivage",
        priceCents: 4800,
        sizeId: null,
        colorId: null,
        sizeLabel: null,
        colorLabel: null,
        qty: MAX_QTY,
      },
    ]);
  });
  it("recalcule la key d'une ligne variante (ne fait pas confiance au stockage)", () => {
    const result = sanitizeCart([
      {
        key: "bidon",
        slug: "solana",
        name: "solana",
        priceCents: 3400,
        qty: 2,
        sizeId: "s-moyen",
        colorId: "c-blanc",
        sizeLabel: "Moyen",
        colorLabel: "Blanc",
      },
    ]);
    expect(result[0].key).toBe("solana__s-moyen__c-blanc");
  });
});
