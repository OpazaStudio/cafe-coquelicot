import { describe, expect, it } from "vitest";
import { composeItemName } from "@/lib/item-label";

describe("composeItemName", () => {
  it("nom seul quand pas de variante", () => {
    expect(composeItemName("rivage")).toBe("rivage");
    expect(composeItemName("rivage", null, null)).toBe("rivage");
  });
  it("taille seule : nom — taille", () => {
    expect(composeItemName("rivage", "Moyen")).toBe("rivage — Moyen");
  });
  it("coloris seul : nom · coloris", () => {
    expect(composeItemName("rivage", null, "Vif")).toBe("rivage · Vif");
  });
  it("taille + coloris : nom — taille · coloris", () => {
    expect(composeItemName("rivage", "Moyen", "Vif")).toBe("rivage — Moyen · Vif");
  });
});
