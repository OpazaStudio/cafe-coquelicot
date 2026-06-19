import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "@/lib/cart/cart-context";
import { VaseSuggestions } from "@/components/vase-suggestions";
import type { ShopProduct } from "@/lib/products";

const vases: ShopProduct[] = [
  { id: "v1", slug: "galet", name: "galet", tag: "Vase en grès", desc: "x", price: "24€", priceCents: 2400, variant: 0, badge: null, category: "vase", sizes: [], colors: [] },
];

// Sonde déterministe : expose l'état d'hydratation du panier (ready) pour
// attendre la relecture du localStorage avant d'asserter l'absence de section.
function ReadyProbe() {
  const { ready, count } = useCart();
  return <span data-testid="probe">{ready ? `ready:${count}` : "loading"}</span>;
}

function seedCart(items: unknown[]) {
  window.localStorage.setItem("coquelicot.cart.v1", JSON.stringify(items));
}
function renderWith() {
  return render(
    <CartProvider>
      <ReadyProbe />
      <VaseSuggestions vases={vases} />
    </CartProvider>,
  );
}
async function waitReady() {
  await waitFor(() =>
    expect(screen.getByTestId("probe").textContent).toMatch(/^ready:/),
  );
}

beforeEach(() => window.localStorage.clear());

describe("VaseSuggestions", () => {
  it("propose un vase quand le panier a des fleurs sans vase", async () => {
    seedCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
    expect(screen.getByText("galet")).toBeTruthy();
  });

  it("ne propose rien si un vase est déjà au panier", async () => {
    seedCart([{ slug: "galet", name: "galet", priceCents: 2400, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).toBeNull();
  });

  it("ne propose rien pour un panier vide", async () => {
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).toBeNull();
  });

  it("quick-add : ajoute le vase puis masque la suggestion", async () => {
    seedCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter galet au panier" }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("vase-suggestions")).toBeNull(),
    );
    const stored = JSON.parse(
      window.localStorage.getItem("coquelicot.cart.v1") ?? "[]",
    );
    expect(stored.some((i: { slug: string }) => i.slug === "galet")).toBe(true);
  });
});
