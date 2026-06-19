import { describe, expect, it } from "vitest";
import { productCategory } from "@/lib/db/schema";
import { CATEGORY_LABELS } from "@/lib/categories";

describe("catégorie vase", () => {
  it("la valeur d'enum 'vase' existe", () => {
    expect(productCategory.enumValues).toContain("vase");
  });
  it("le libellé de 'vase' est « Vases »", () => {
    expect(CATEGORY_LABELS.vase).toBe("Vases");
  });
});
