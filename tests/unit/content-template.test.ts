import { describe, expect, it } from "vitest";
import { fillTemplate } from "@/lib/content/template";

describe("fillTemplate", () => {
  it("remplace les jetons connus", () => {
    expect(fillTemplate("Commande {{numero}} — payée", { numero: "CQ-12" })).toBe("Commande CQ-12 — payée");
  });
  it("tolère les espaces dans le jeton et laisse un jeton inconnu", () => {
    expect(fillTemplate("{{ numero }} / {{autre}}", { numero: "1" })).toBe("1 / {{autre}}");
  });
});
