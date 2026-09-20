import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/purchase-tracking", () => ({ PurchaseTracking: () => null }));
vi.mock("@/components/clear-cart", () => ({ ClearCart: () => null }));

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
});
