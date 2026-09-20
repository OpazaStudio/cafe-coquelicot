import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_FRAME,
  PRODUCT_FRAMES,
  isProductFrame,
  normalizeProductFrame,
  productFrameRatio,
  productFrameStyle,
} from "@/lib/product-frame";

describe("formats de cadre", () => {
  it("propose des formats standard, carré par défaut", () => {
    expect(PRODUCT_FRAMES.map((f) => f.id)).toEqual([
      "1:1", "4:5", "3:4", "2:3", "5:4", "4:3", "3:2", "16:9",
    ]);
    expect(DEFAULT_PRODUCT_FRAME).toBe("1:1");
  });

  it("valide et normalise une valeur venue de la base ou du formulaire", () => {
    expect(isProductFrame("3:4")).toBe(true);
    expect(isProductFrame("5:7")).toBe(false);
    expect(isProductFrame(null)).toBe(false);
    expect(normalizeProductFrame("4:5")).toBe("4:5");
    expect(normalizeProductFrame("n'importe quoi")).toBe("1:1");
    expect(normalizeProductFrame(undefined)).toBe("1:1");
  });

  it("dérive un ratio CSS et des variables de cadre", () => {
    expect(productFrameRatio("3:2")).toBe("3 / 2");
    expect(productFrameStyle("4:5")).toEqual({ "--frame-w": 4, "--frame-h": 5 });
  });
});
