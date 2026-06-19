import { describe, expect, it } from "vitest";
import {
  MONDIAL_RELAY_FEE_CENTS,
  SHIPPING_COUNTRY_CODES,
  isShippingCountry,
  statusTransitions,
  canTransition,
} from "@/lib/order-status";

describe("order-status — Mondial Relay", () => {
  it("ne dessert que la France", () => {
    expect([...SHIPPING_COUNTRY_CODES]).toEqual(["FR"]);
    expect(isShippingCountry("FR")).toBe(true);
    expect(isShippingCountry("BE")).toBe(false);
  });

  it("a un forfait de livraison positif", () => {
    expect(MONDIAL_RELAY_FEE_CENTS).toBeGreaterThan(0);
  });

  it("transition terminale = shipped pour mondial_relay", () => {
    expect(statusTransitions("preparing", "mondial_relay")).toEqual([
      "shipped",
      "cancelled",
    ]);
    expect(canTransition("preparing", "shipped", "mondial_relay")).toBe(true);
    expect(canTransition("preparing", "picked_up", "mondial_relay")).toBe(false);
  });
});
