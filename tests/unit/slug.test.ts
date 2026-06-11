import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("retire les accents", () => {
    expect(slugify("alizé")).toBe("alize");
    expect(slugify("crème brûlée")).toBe("creme-brulee");
  });

  it("remplace espaces et ponctuation par des tirets", () => {
    expect(slugify("carte fleurie")).toBe("carte-fleurie");
    expect(slugify("Bouquet — d'été !")).toBe("bouquet-d-ete");
  });

  it("nettoie les tirets en tête et en queue", () => {
    expect(slugify("  pivoine  ")).toBe("pivoine");
    expect(slugify("---rose---")).toBe("rose");
  });
});
