import { describe, expect, it } from "vitest";
import { addItem, type Cart } from "@/lib/cart/cart";
import { shouldSuggestVases } from "@/lib/cart/vase-upsell";

const vaseSlugs = new Set(["galet", "carene", "ecume"]);
const flower = { slug: "rivage", name: "rivage", priceCents: 4800 };
const vase = { slug: "galet", name: "galet", priceCents: 2400 };

describe("shouldSuggestVases", () => {
  it("propose quand il y a des fleurs sans vase", () => {
    const cart: Cart = addItem([], flower);
    expect(shouldSuggestVases(cart, vaseSlugs)).toBe(true);
  });
  it("ne propose pas quand un vase est déjà là", () => {
    const cart: Cart = addItem(addItem([], flower), vase);
    expect(shouldSuggestVases(cart, vaseSlugs)).toBe(false);
  });
  it("ne propose pas pour un vase seul", () => {
    const cart: Cart = addItem([], vase);
    expect(shouldSuggestVases(cart, vaseSlugs)).toBe(false);
  });
  it("ne propose pas pour un panier vide", () => {
    expect(shouldSuggestVases([], vaseSlugs)).toBe(false);
  });
});
