import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "@/lib/cart/cart-context";
import { trackAddToCart } from "@/lib/analytics/gtag";
import { VaseSuggestions } from "@/components/vase-suggestions";
import type { ShopProduct } from "@/lib/products";
import { DEFAULT_PANIER } from "@/lib/content/pages/panier";

vi.mock("@/lib/analytics/gtag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/gtag")>()),
  trackAddToCart: vi.fn(),
}));

const vases: ShopProduct[] = [
  { id: "v1", slug: "galet", name: "galet", desc: "x", descRich: null, price: "24€", priceCents: 2400, variant: 0, imagePath: null, imageBgColor: null, imageFrame: "1:1", images: [], badge: null, category: "vase", sizes: [], colors: [], soldOut: false },
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
function renderWith(list: ShopProduct[] = vases) {
  return render(
    <CartProvider>
      <ReadyProbe />
      <VaseSuggestions vases={list} copy={DEFAULT_PANIER.vases} />
    </CartProvider>,
  );
}
async function waitReady() {
  await waitFor(() =>
    expect(screen.getByTestId("probe").textContent).toMatch(/^ready:/),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(trackAddToCart).mockClear();
});

describe("VaseSuggestions (toujours proposés)", () => {
  it("propose un vase quand le panier contient un article (fleurs)", async () => {
    seedCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
    expect(screen.getByText("galet")).toBeTruthy();
  });

  it("propose toujours, même si un vase est déjà au panier", async () => {
    seedCart([{ slug: "galet", name: "galet", priceCents: 2400, qty: 1 }]);
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
  });

  it("ne propose rien pour un panier vide", async () => {
    renderWith();
    await waitReady();
    expect(screen.queryByTestId("vase-suggestions")).toBeNull();
  });

  it("quick-add : ajoute le vase et la suggestion reste affichée", async () => {
    seedCart([{ slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 }]);
    renderWith();
    await waitReady();
    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter galet au panier" }),
    );
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("coquelicot.cart.v1") ?? "[]",
      );
      expect(stored.some((i: { slug: string }) => i.slug === "galet")).toBe(true);
    });
    // La section reste visible (vases toujours proposés tant qu'il y a un article).
    expect(screen.queryByTestId("vase-suggestions")).not.toBeNull();
  });
});

describe("VaseSuggestions — vase épuisé", () => {
  const rivage = { slug: "rivage", name: "rivage", priceCents: 4800, qty: 1 };
  const soldOutVase: ShopProduct = { ...vases[0], soldOut: true };
  const storedSlugs = () =>
    JSON.parse(window.localStorage.getItem("coquelicot.cart.v1") ?? "[]").map(
      (i: { slug: string }) => i.slug,
    );

  it("VaseSuggestions refuse l'ajout rapide d'un vase épuisé", async () => {
    seedCart([rivage]);
    renderWith([soldOutVase]);
    await waitReady();
    fireEvent.click(screen.getByRole("button", { name: "galet, épuisé" }));
    expect(trackAddToCart).not.toHaveBeenCalled();
    expect(storedSlugs()).toEqual(["rivage"]);
    expect(screen.getByTestId("probe").textContent).toBe("ready:1");
  });

  it("garde le vase épuisé visible, annoncé et inactif", async () => {
    seedCart([rivage]);
    renderWith([soldOutVase]);
    await waitReady();
    expect(screen.getByText("galet")).toBeTruthy();
    const button = screen.getByRole("button", { name: "galet, épuisé" });
    expect(button.textContent).toBe("Épuisé");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Ajouter galet au panier" })).toBeNull();
  });

  it("n'empêche pas l'ajout d'un autre vase disponible", async () => {
    seedCart([rivage]);
    renderWith([soldOutVase, { ...vases[0], id: "v2", slug: "galbe", name: "galbe" }]);
    await waitReady();
    fireEvent.click(screen.getByRole("button", { name: "galet, épuisé" }));
    expect(storedSlugs()).toEqual(["rivage"]);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter galbe au panier" }));
    await waitFor(() => expect(storedSlugs()).toEqual(["rivage", "galbe"]));
    expect(trackAddToCart).toHaveBeenCalledTimes(1);
  });
});
