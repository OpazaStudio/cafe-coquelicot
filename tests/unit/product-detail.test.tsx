import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider } from "@/lib/cart/cart-context";
import { ProductDetail } from "@/components/product-detail";
import type { ShopProduct } from "@/lib/products";

const solana: ShopProduct = {
  id: "p1",
  slug: "solana",
  name: "solana",
  tag: "Bouquet séché",
  desc: "Immortelles, statice.",
  price: "dès 29€",
  priceCents: 2900,
  variant: 2,
  imagePath: null,
  imageBgColor: null,
  badge: null,
  category: "seche",
  sizes: [
    { id: "s-p", label: "Petit", priceCents: 2900 },
    { id: "s-g", label: "Grand", priceCents: 4200 },
  ],
  colors: [
    { id: "c-n", label: "Naturel", illustrationVariant: 2, imagePath: null, imageBgColor: null },
    { id: "c-b", label: "Blanc", illustrationVariant: 4, imagePath: null, imageBgColor: null },
  ],
};

function renderDetail(p: ShopProduct) {
  return render(
    <CartProvider>
      <ProductDetail product={p} />
    </CartProvider>,
  );
}

beforeEach(() => window.localStorage.clear());

describe("ProductDetail", () => {
  it("prix par défaut = 1ʳᵉ taille, réactif au changement de taille", () => {
    renderDetail(solana);
    expect(screen.getByTestId("product-price").textContent).toBe("29€");
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    expect(screen.getByTestId("product-price").textContent).toBe("42€");
  });

  it("le stepper borne la quantité à 1 minimum", () => {
    renderDetail(solana);
    fireEvent.click(screen.getByRole("button", { name: "Réduire la quantité" }));
    expect(screen.getByTestId("product-qty").textContent).toBe("1");
  });

  it("ajoute la variante sélectionnée avec la quantité au panier", async () => {
    renderDetail(solana);
    fireEvent.click(screen.getByRole("button", { name: /^Grand/ }));
    fireEvent.click(screen.getByRole("button", { name: "Blanc" }));
    fireEvent.click(screen.getByRole("button", { name: "Augmenter la quantité" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter solana au panier" }),
    );
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("coquelicot.cart.v1") ?? "[]",
      );
      expect(stored).toEqual([
        {
          key: "solana__s-g__c-b",
          slug: "solana",
          name: "solana",
          priceCents: 4200,
          sizeId: "s-g",
          colorId: "c-b",
          sizeLabel: "Grand",
          colorLabel: "Blanc",
          qty: 2,
        },
      ]);
    });
  });
});
