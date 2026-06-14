import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "@/lib/cart/cart-context";

function Probe() {
  const { count, subtotalCents, ready, add, clear } = useCart();
  return (
    <div>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="count">{count}</span>
      <span data-testid="subtotal">{subtotalCents}</span>
      <button
        onClick={() => add({ slug: "rivage", name: "rivage", priceCents: 4800 })}
      >
        add
      </button>
      <button onClick={clear}>clear</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("CartProvider", () => {
  it("démarre vide puis persiste les ajouts dans localStorage", async () => {
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("true"),
    );
    expect(screen.getByTestId("count").textContent).toBe("0");

    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("subtotal").textContent).toBe("9600");

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("coquelicot.cart.v1") ?? "[]",
      );
      expect(stored).toEqual([
        {
          key: "rivage",
          slug: "rivage",
          name: "rivage",
          priceCents: 4800,
          sizeId: null,
          colorId: null,
          sizeLabel: null,
          colorLabel: null,
          qty: 2,
        },
      ]);
    });
  });

  it("relit le panier persisté au montage et ignore le bruit", async () => {
    window.localStorage.setItem(
      "coquelicot.cart.v1",
      JSON.stringify([
        { slug: "gabut", name: "gabut", priceCents: 3800, qty: 3 },
        { hacked: true },
      ]),
    );
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("count").textContent).toBe("3"),
    );
    expect(screen.getByTestId("subtotal").textContent).toBe("11400");

    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});
