import { describe, expect, it } from "vitest";
import { formatEuros, formatFromPrice, parsePriceToCents } from "@/lib/money";

describe("formatEuros", () => {
  it("formate les montants ronds sans décimales", () => {
    expect(formatEuros(4800)).toBe("48€");
    expect(formatEuros(0)).toBe("0€");
    expect(formatEuros(10000)).toBe("100€");
  });

  it("formate les centimes avec une virgule", () => {
    expect(formatEuros(4850)).toBe("48,50€");
    expect(formatEuros(999)).toBe("9,99€");
    expect(formatEuros(2990)).toBe("29,90€");
  });
});

describe("formatFromPrice", () => {
  it("reproduit le format historique des cartes produit", () => {
    expect(formatFromPrice(4800)).toBe("dès 48€");
    expect(formatFromPrice(1600)).toBe("dès 16€");
  });
});

describe("parsePriceToCents", () => {
  it("accepte virgule et point", () => {
    expect(parsePriceToCents("48")).toBe(4800);
    expect(parsePriceToCents("48,50")).toBe(4850);
    expect(parsePriceToCents("48.5")).toBe(4850);
    expect(parsePriceToCents("29,90")).toBe(2990);
  });

  it("est l'inverse de formatEuros pour les montants usuels", () => {
    for (const cents of [100, 1450, 4800, 6500, 12999]) {
      expect(parsePriceToCents(formatEuros(cents).replace("€", ""))).toBe(cents);
    }
  });
});
