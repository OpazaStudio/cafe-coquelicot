import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/purchase-tracking", () => ({
  PurchaseTracking: () => <div data-testid="purchase-tracking" />,
}));
vi.mock("@/components/clear-cart", () => ({
  ClearCart: () => <div data-testid="clear-cart" />,
}));

import { ConfirmationView } from "@/components/views/confirmation-view";
import { DEFAULT_CONFIRMATION } from "@/lib/content/pages/confirmation";
import { DEFAULT_SITE } from "@/lib/content/pages/site";
import { CartProvider } from "@/lib/cart/cart-context";

const vars = { adresse: "1 rue Test, 17000 La Rochelle", contact: "hello@test.fr" };

describe("ConfirmationView", () => {
  it("remplit les jetons de l'état introuvable", () => {
    render(
      <CartProvider>
        <ConfirmationView content={DEFAULT_CONFIRMATION} chrome={DEFAULT_SITE} state={{ kind: "notFound" }} vars={vars} />
      </CartProvider>,
    );
    expect(screen.getByText(/hello@test\.fr/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("hmm…");
  });
  it("remplit numéro, e-mail et adresse pour une commande payée en retrait", () => {
    render(
      <CartProvider>
        <ConfirmationView
          content={DEFAULT_CONFIRMATION}
          chrome={DEFAULT_SITE}
          state={{ kind: "paid", number: "CQ-42", totalCents: 4800, deliveryFeeCents: 0, cardFeeCents: 0, customerEmail: "c@x.fr", fulfillment: "retrait", items: [] }}
          vars={vars}
        />
      </CartProvider>,
    );
    expect(screen.getByText(/Commande CQ-42 — payée/)).toBeTruthy();
    expect(screen.getByText(/c@x\.fr/)).toBeTruthy();
    expect(screen.getByText(/1 rue Test/)).toBeTruthy();
  });
  it("annonce une vérification manuelle au client débité, jamais une attente de paiement", () => {
    render(
      <CartProvider>
        <ConfirmationView
          content={DEFAULT_CONFIRMATION}
          chrome={DEFAULT_SITE}
          state={{ kind: "needsReview", number: "CQ-77" }}
          vars={vars}
        />
      </CartProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Votre paiement nous est bien parvenu",
    );
    expect(screen.getByText(/CQ-77/)).toBeTruthy();
    expect(screen.getByText(/24 h/)).toBeTruthy();
    expect(screen.getByText(/hello@test\.fr/)).toBeTruthy();
    expect(screen.queryByText(/en cours de validation/)).toBeNull();
  });
  it("annonce l'annulation, vide le panier et ne déclenche aucun suivi d'achat", () => {
    render(
      <CartProvider>
        <ConfirmationView
          content={DEFAULT_CONFIRMATION}
          chrome={DEFAULT_SITE}
          state={{ kind: "cancelled", number: "CQ-88" }}
          vars={vars}
        />
      </CartProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Cette commande a été annulée",
    );
    expect(screen.getByText(/CQ-88/)).toBeTruthy();
    expect(screen.getByText(/si vous avez été débité·e, écrivez-nous/)).toBeTruthy();
    expect(screen.getByText(/hello@test\.fr/)).toBeTruthy();
    expect(screen.queryByText(/en cours de validation/)).toBeNull();
    expect(screen.getByTestId("clear-cart")).toBeTruthy();
    expect(screen.queryByTestId("purchase-tracking")).toBeNull();
  });
  it("vide le panier et suit l'achat sur une commande payée", () => {
    render(
      <CartProvider>
        <ConfirmationView
          content={DEFAULT_CONFIRMATION}
          chrome={DEFAULT_SITE}
          state={{ kind: "paid", number: "CQ-43", totalCents: 4800, deliveryFeeCents: 0, cardFeeCents: 0, customerEmail: "c@x.fr", fulfillment: "retrait", items: [] }}
          vars={vars}
        />
      </CartProvider>,
    );
    expect(screen.getByTestId("clear-cart")).toBeTruthy();
    expect(screen.getByTestId("purchase-tracking")).toBeTruthy();
  });
});
