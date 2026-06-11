import { describe, expect, it } from "vitest";
import {
  addItem,
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

describe("addItem", () => {
  it("ajoute un nouvel article avec qty 1 par défaut", () => {
    const cart = addItem([], rivage);
    expect(cart).toEqual([{ ...rivage, qty: 1 }]);
  });

  it("fusionne les quantités d'un article déjà présent", () => {
    const cart = addItem(addItem([], rivage), rivage, 2);
    expect(cart).toEqual([{ ...rivage, qty: 3 }]);
  });

  it("plafonne à MAX_QTY", () => {
    const cart = addItem(addItem([], rivage, MAX_QTY), rivage, 5);
    expect(cart[0].qty).toBe(MAX_QTY);
  });

  it("ne mute pas le panier d'origine", () => {
    const before: Cart = [{ ...rivage, qty: 1 }];
    addItem(before, gabut);
    expect(before).toHaveLength(1);
  });
});

describe("setQty / removeItem", () => {
  const cart: Cart = [
    { ...rivage, qty: 2 },
    { ...gabut, qty: 1 },
  ];

  it("modifie la quantité ciblée", () => {
    expect(setQty(cart, "rivage", 5)[0].qty).toBe(5);
  });

  it("retire l'article quand la quantité tombe à 0", () => {
    expect(setQty(cart, "gabut", 0)).toHaveLength(1);
  });

  it("removeItem retire par slug", () => {
    expect(removeItem(cart, "rivage").map((i) => i.slug)).toEqual(["gabut"]);
  });
});

describe("totaux", () => {
  it("compte les articles et le sous-total", () => {
    const cart: Cart = [
      { ...rivage, qty: 2 },
      { ...gabut, qty: 1 },
    ];
    expect(cartCount(cart)).toBe(3);
    expect(cartSubtotalCents(cart)).toBe(4800 * 2 + 3800);
  });
});

describe("sanitizeCart", () => {
  it("rejette tout ce qui n'est pas un tableau d'articles valides", () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeCart("pwned")).toEqual([]);
    expect(sanitizeCart([{ slug: 1 }])).toEqual([]);
    expect(sanitizeCart([{ slug: "x", name: "x", priceCents: -5, qty: 1 }])).toEqual([]);
  });

  it("garde les articles valides et borne les quantités", () => {
    const result = sanitizeCart([
      { slug: "rivage", name: "rivage", priceCents: 4800, qty: 500 },
    ]);
    expect(result).toEqual([
      { slug: "rivage", name: "rivage", priceCents: 4800, qty: MAX_QTY },
    ]);
  });
});
