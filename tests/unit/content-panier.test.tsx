import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartProvider } from "@/lib/cart/cart-context";
import { CartView } from "@/components/cart-view";
import { DEFAULT_PANIER } from "@/lib/content/pages/panier";

beforeEach(() => {
  window.localStorage.clear();
});

describe("CartView", () => {
  it("rend le message et le bouton du panier vide depuis le contenu", async () => {
    render(
      <CartProvider>
        <CartView copy={{ empty: { text: "Rien pour l'instant.", cta: "Aller voir" }, summary: DEFAULT_PANIER.summary }} />
      </CartProvider>,
    );
    expect(await screen.findByText("Rien pour l'instant.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Aller voir/ }).getAttribute("href")).toBe("/boutique");
  });
});
