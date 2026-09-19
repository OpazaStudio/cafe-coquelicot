import { describe, expect, it } from "vitest";
import {
  COLISSIMO_FEE_CENTS,
  DEFAULT_SHIPPING_FEES,
  FULFILLMENT_LABELS,
  MONDIAL_RELAY_FEE_CENTS,
  SHIPPING_COUNTRY_CODES,
  SHIPPING_LINE_LABELS,
  canTransition,
  formatFeeInput,
  isShippingCountry,
  parseFeeInput,
  shippingFeeFor,
  statusTransitions,
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

describe("order-status — forfaits de livraison", () => {
  it("parseFeeInput accepte virgule, point, entier et décimale unique", () => {
    expect(parseFeeInput("7,90")).toBe(790);
    expect(parseFeeInput("7.90")).toBe(790);
    expect(parseFeeInput("7,9")).toBe(790);
    expect(parseFeeInput("7")).toBe(700);
    expect(parseFeeInput(" 4,90 ")).toBe(490);
    expect(parseFeeInput("0")).toBe(0);
  });

  it("parseFeeInput renvoie null pour vide ou invalide", () => {
    expect(parseFeeInput("")).toBeNull();
    expect(parseFeeInput("abc")).toBeNull();
    expect(parseFeeInput("7,999")).toBeNull();
    expect(parseFeeInput("-1")).toBeNull();
    expect(parseFeeInput("12345")).toBeNull();
  });

  it("formatFeeInput écrit le montant à la française", () => {
    expect(formatFeeInput(490)).toBe("4,90");
    expect(formatFeeInput(790)).toBe("7,90");
    expect(formatFeeInput(0)).toBe("0,00");
  });

  it("les défauts reprennent les constantes", () => {
    expect(DEFAULT_SHIPPING_FEES).toEqual({
      mondialRelay: MONDIAL_RELAY_FEE_CENTS,
      colissimo: COLISSIMO_FEE_CENTS,
    });
    expect(COLISSIMO_FEE_CENTS).toBe(790);
  });

  it("shippingFeeFor choisit le forfait selon le mode", () => {
    const fees = { mondialRelay: 111, colissimo: 222 };
    expect(shippingFeeFor("mondial_relay", fees)).toBe(111);
    expect(shippingFeeFor("poste", fees)).toBe(222);
    expect(shippingFeeFor("retrait", fees)).toBe(0);
  });

  it("chaque mode a un libellé admin et une ligne Stripe", () => {
    expect(FULFILLMENT_LABELS).toEqual({
      retrait: "Retrait",
      poste: "Colissimo",
      mondial_relay: "Mondial Relay",
    });
    expect(SHIPPING_LINE_LABELS.poste).toBe("Livraison Colissimo — à domicile");
    expect(SHIPPING_LINE_LABELS.mondial_relay).toBe("Livraison Mondial Relay — point relais");
  });
});
