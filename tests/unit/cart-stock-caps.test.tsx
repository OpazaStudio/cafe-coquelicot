import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CartProvider } from "@/lib/cart/cart-context";
import { cartItemKey } from "@/lib/cart/cart";
import { CartView } from "@/components/cart-view";
import { CheckoutForm } from "@/components/checkout-form";
import { DEFAULT_PANIER } from "@/lib/content/pages/panier";
import { DEFAULT_SHIPPING_FEES } from "@/lib/order-status";
import { cartAvailability } from "@/app/panier/availability";

vi.mock("@/app/panier/availability", () => ({ cartAvailability: vi.fn() }));
vi.mock("@/app/checkout/actions", () => ({ startCheckout: vi.fn() }));
vi.mock("@/lib/analytics/gtag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/gtag")>()),
  trackBeginCheckout: vi.fn(),
}));

const SIZE = "11111111-1111-4111-8111-111111111111";
const NATUREL = "22222222-2222-4222-8222-222222222222";
const BLANC = "33333333-3333-4333-8333-333333333333";

type Seed = {
  slug: string;
  sizeId: string | null;
  colorId: string | null;
  qty: number;
};

function seedCart(lines: Seed[]) {
  window.localStorage.setItem(
    "coquelicot.cart.v1",
    JSON.stringify(
      lines.map((line) => ({
        slug: line.slug,
        name: line.slug,
        priceCents: 4000,
        sizeId: line.sizeId,
        colorId: line.colorId,
        sizeLabel: line.sizeId ? "Petit" : null,
        colorLabel: line.colorId === NATUREL ? "Naturel" : line.colorId ? "Blanc" : null,
        qty: line.qty,
      })),
    ),
  );
}

function available(maxQty: number | null, reason?: "size_required") {
  vi.mocked(cartAvailability).mockResolvedValue([
    { slug: "limite", sizeId: SIZE, maxQty, reason },
  ]);
}

const notices = () =>
  screen.getAllByTestId(/^cart-stock-/).map((node) => node.textContent);

const isDisabled = (element: HTMLElement) =>
  (element as HTMLButtonElement).disabled;

function renderCart() {
  return render(
    <CartProvider>
      <CartView copy={{ empty: DEFAULT_PANIER.empty, summary: DEFAULT_PANIER.summary }} />
    </CartProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(cartAvailability).mockReset();
});

describe("plafonds du panier", () => {
  it("additionne les deux coloris d'une taille sur une seule clé de stock", async () => {
    seedCart([
      { slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 2 },
      { slug: "limite", sizeId: SIZE, colorId: BLANC, qty: 2 },
    ]);
    available(3);
    renderCart();

    const naturel = cartItemKey("limite", SIZE, NATUREL);
    const blanc = cartItemKey("limite", SIZE, BLANC);
    await waitFor(() =>
      expect(screen.getByTestId(`cart-stock-${naturel}`).textContent).toBe(
        "Plus que 3 disponibles",
      ),
    );
    expect(screen.getByTestId(`cart-stock-${blanc}`).textContent).toBe(
      "Plus que 3 disponibles",
    );
    expect(
      isDisabled(screen.getByRole("button", { name: DEFAULT_PANIER.summary.cta })),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: DEFAULT_PANIER.summary.cta })).toBeNull();
    expect(cartAvailability).toHaveBeenCalledWith([{ slug: "limite", sizeId: SIZE }]);
  });

  it("laisse passer le total agrégé qui tient dans le compteur", async () => {
    seedCart([
      { slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 2 },
      { slug: "limite", sizeId: SIZE, colorId: BLANC, qty: 1 },
    ]);
    available(3);
    renderCart();

    await waitFor(() =>
      expect(notices()).toEqual(["Plus que 3 en stock", "Plus que 3 en stock"]),
    );
    expect(
      screen.getByRole("link", { name: new RegExp(DEFAULT_PANIER.summary.cta) }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("button", { name: "Augmenter la quantité de limite" })
        .map(isDisabled),
    ).toEqual([true, true]);
  });

  it("marque « Épuisé » et bloque le CTA sur un compteur à zéro", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 1 }]);
    available(0);
    renderCart();

    const key = cartItemKey("limite", SIZE, NATUREL);
    await waitFor(() =>
      expect(screen.getByTestId(`cart-stock-${key}`).textContent).toBe("Épuisé"),
    );
    expect(
      isDisabled(screen.getByRole("button", { name: DEFAULT_PANIER.summary.cta })),
    ).toBe(true);
  });

  it("ne plafonne rien sur une taille illimitée", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 4 }]);
    available(null);
    renderCart();

    await waitFor(() => expect(cartAvailability).toHaveBeenCalled());
    expect(notices()).toEqual([""]);
    expect(
      isDisabled(
        screen.getByRole("button", { name: "Augmenter la quantité de limite" }),
      ),
    ).toBe(false);
  });

  it("dit « Choix de taille requis » plutôt que « Épuisé »", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 1 }]);
    available(0, "size_required");
    renderCart();

    await waitFor(() => expect(notices()).toEqual(["Choix de taille requis"]));
    expect(
      isDisabled(screen.getByRole("button", { name: DEFAULT_PANIER.summary.cta })),
    ).toBe(true);
    expect(screen.getByTestId(/^cart-line-/).className).not.toMatch(/is-sold-out/);
  });

  it("monte la région live vide, pour qu'elle soit annoncée au changement", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 1 }]);
    available(5);
    renderCart();

    const key = cartItemKey("limite", SIZE, NATUREL);
    await waitFor(() => expect(cartAvailability).toHaveBeenCalled());
    const live = screen.getByTestId(`cart-stock-${key}`);
    expect(live.getAttribute("role")).toBe("status");
    expect(live.textContent).toBe("");
    const alert = screen.getByTestId("cart-alert");
    expect(alert.getAttribute("role")).toBe("status");
    expect(alert.textContent).toBe("");
  });

  it("ne réinterroge pas le serveur quand seule une quantité change", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 2 }]);
    available(5);
    renderCart();

    await waitFor(() => expect(cartAvailability).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", { name: "Augmenter la quantité de limite" }),
    );
    const key = cartItemKey("limite", SIZE, NATUREL);
    await waitFor(() => expect(screen.getByTestId(`qty-${key}`).textContent).toBe("3"));
    expect(cartAvailability).toHaveBeenCalledTimes(1);
  });

  it("n'interroge pas le serveur pour un panier vide", async () => {
    renderCart();

    await waitFor(() => expect(screen.getByText(DEFAULT_PANIER.empty.text)).toBeTruthy());
    expect(cartAvailability).not.toHaveBeenCalled();
  });

  it("laisse le panier achetable quand la disponibilité échoue", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 2 }]);
    vi.mocked(cartAvailability).mockRejectedValue(new Error("réseau coupé"));
    renderCart();

    await waitFor(() => expect(cartAvailability).toHaveBeenCalled());
    expect(notices()).toEqual([""]);
    expect(
      screen.getByRole("link", { name: new RegExp(DEFAULT_PANIER.summary.cta) }),
    ).toBeTruthy();
  });
});

describe("plafonds du récapitulatif de commande", () => {
  it("signale la ligne, offre de la retirer et désarme le bouton de paiement", async () => {
    seedCart([{ slug: "limite", sizeId: SIZE, colorId: NATUREL, qty: 2 }]);
    available(1);
    render(
      <CartProvider>
        <CheckoutForm fees={DEFAULT_SHIPPING_FEES} />
      </CartProvider>,
    );

    const key = cartItemKey("limite", SIZE, NATUREL);
    await waitFor(() =>
      expect(screen.getByTestId(`checkout-stock-${key}`).textContent).toBe(
        "Plus que 1 disponible",
      ),
    );
    expect(
      isDisabled(screen.getByRole("button", { name: /Ajustez votre panier/ })),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Retirer" })).toBeTruthy();
  });
});
