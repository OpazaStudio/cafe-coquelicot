import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BoutiqueShop } from "@/components/boutique";
import { Shop } from "@/components/sections";
import { DEFAULT_BOUTIQUE } from "@/lib/content/pages/boutique";
import { DEFAULT_HOME } from "@/lib/content/pages/home";
import type { ShopProduct } from "@/lib/products";

function product(over: Partial<ShopProduct>): ShopProduct {
  return {
    id: "p1",
    slug: "solana",
    name: "solana",
    desc: "x",
    descRich: null,
    price: "dès 29€",
    priceCents: 2900,
    variant: 0,
    imagePath: null,
    imageBgColor: null,
    imageFrame: "1:1",
    images: [],
    badge: null,
    category: "seche",
    sizes: [],
    colors: [],
    soldOut: false,
    ...over,
  };
}

const catalogue = [
  product({ slug: "disponible", name: "disponible", badge: "Nouveau" }),
  product({ slug: "epuise", name: "epuise", badge: "Nouveau", soldOut: true }),
  product({ slug: "epuise-sans-badge", name: "epuise sans badge", soldOut: true }),
];

function cards(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".product-card")].map((card) => ({
    soldOutClass: card.classList.contains("is-sold-out"),
    badges: [...card.querySelectorAll(".product-card__badge")].map((b) => b.textContent),
  }));
}

const expected = [
  { soldOutClass: false, badges: ["Nouveau"] },
  { soldOutClass: true, badges: ["Épuisé"] },
  { soldOutClass: true, badges: ["Épuisé"] },
];

describe("cartes produit — état épuisé", () => {
  it("la boutique marque les produits épuisés et laisse « Épuisé » passer avant le badge admin", () => {
    const { container } = render(
      <BoutiqueShop catalogue={catalogue} copy={DEFAULT_BOUTIQUE.catalogue} />,
    );
    expect(cards(container)).toEqual(expected);
  });

  it("la home marque les produits épuisés et laisse « Épuisé » passer avant le badge admin", () => {
    const { container } = render(
      <Shop bg="coffee-bean" content={DEFAULT_HOME.shop} products={catalogue} />,
    );
    expect(cards(container)).toEqual(expected);
  });

  it("une carte épuisée reste un lien vers la page produit", () => {
    const { container } = render(
      <BoutiqueShop catalogue={catalogue} copy={DEFAULT_BOUTIQUE.catalogue} />,
    );
    const sold = container.querySelectorAll<HTMLAnchorElement>(".is-sold-out");
    expect([...sold].map((a) => a.getAttribute("href"))).toEqual([
      "/boutique/epuise",
      "/boutique/epuise-sans-badge",
    ]);
  });
});
