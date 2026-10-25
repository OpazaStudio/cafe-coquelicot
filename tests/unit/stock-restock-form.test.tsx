import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ changeOrderStatus: vi.fn() }));
vi.mock("@/app/(admin)/admin/(panel)/commandes/actions", () => ({
  changeOrderStatus: mocks.changeOrderStatus,
}));

import type { OrderStatus } from "@/lib/db/schema";
import { StatusActions } from "@/app/(admin)/admin/(panel)/commandes/[id]/status-actions";

const RESTOCK_LABEL = "Remettre en stock les unités réservées par cette commande";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function renderActions(status: OrderStatus, canRestock = true) {
  return render(
    <StatusActions
      orderId={ORDER_ID}
      status={status}
      fulfillment="retrait"
      canRestock={canRestock}
    />,
  );
}

beforeEach(() => {
  mocks.changeOrderStatus.mockReset();
  mocks.changeOrderStatus.mockResolvedValue(undefined);
});

describe("case « remettre en stock » du formulaire de statut", () => {
  it("apparaît sur une commande payée qui retient des unités", () => {
    renderActions("paid", true);
    expect(screen.getByLabelText(RESTOCK_LABEL)).toBeTruthy();
  });

  it("disparaît sur une commande payée qui ne retient rien", () => {
    renderActions("paid", false);
    expect(screen.queryByLabelText(RESTOCK_LABEL)).toBeNull();
    expect(screen.getByRole("button", { name: "Annuler la commande" })).toBeTruthy();
  });

  it("n'apparaît sur aucun autre statut, même avec des unités retenues", () => {
    for (const status of ["pending", "preparing"] as const) {
      const view = renderActions(status, true);
      expect(screen.queryByLabelText(RESTOCK_LABEL)).toBeNull();
      view.unmount();
    }
  });

  it("part décochée et transmet le drapeau coché à l'annulation", async () => {
    renderActions("paid");
    const box = screen.getByLabelText(RESTOCK_LABEL) as HTMLInputElement;
    expect(box.checked).toBe(false);

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Annuler la commande" }));

    await waitFor(() =>
      expect(mocks.changeOrderStatus).toHaveBeenCalledWith(ORDER_ID, "cancelled", true),
    );
  });

  it("transmet un drapeau faux quand la case reste décochée", async () => {
    renderActions("paid");

    fireEvent.click(screen.getByRole("button", { name: "Annuler la commande" }));

    await waitFor(() =>
      expect(mocks.changeOrderStatus).toHaveBeenCalledWith(ORDER_ID, "cancelled", false),
    );
  });

  it("n'emporte pas la case sur une autre transition que l'annulation", async () => {
    renderActions("paid");

    fireEvent.click(screen.getByLabelText(RESTOCK_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Passer en préparation" }));

    await waitFor(() =>
      expect(mocks.changeOrderStatus).toHaveBeenCalledWith(ORDER_ID, "preparing", false),
    );
  });

  it("montre le succès à Céline une fois la commande devenue annulée", async () => {
    const ok = "Commande annulée : 2 unités sont remises en stock.";
    mocks.changeOrderStatus.mockResolvedValue({ ok });
    const { rerender } = renderActions("paid");

    fireEvent.click(screen.getByLabelText(RESTOCK_LABEL));
    fireEvent.click(screen.getByRole("button", { name: "Annuler la commande" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(ok));

    rerender(
      <StatusActions
        orderId={ORDER_ID}
        status="cancelled"
        fulfillment="retrait"
        canRestock={false}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe(ok);
    expect(screen.getByText("Statut final — plus aucune transition possible.")).toBeTruthy();
  });

  it("montre encore l'erreur sur un refus", async () => {
    mocks.changeOrderStatus.mockResolvedValue({ error: "Stripe est injoignable." });
    renderActions("paid");

    fireEvent.click(screen.getByRole("button", { name: "Annuler la commande" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Stripe est injoignable."),
    );
  });
});
