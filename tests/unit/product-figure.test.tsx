import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ProductFigure } from "@/components/illustrations";

describe("ProductFigure", () => {
  it("rend un <svg> pour un vase et pour un bouquet", () => {
    const vase = render(<ProductFigure category="vase" variant={0} />);
    const bouquet = render(<ProductFigure category="frais" variant={0} />);
    expect(vase.container.querySelector("svg")).not.toBeNull();
    expect(bouquet.container.querySelector("svg")).not.toBeNull();
  });
  it("le visuel d'un vase diffère de celui d'un bouquet", () => {
    const vase = render(<ProductFigure category="vase" variant={0} />).container.innerHTML;
    const bouquet = render(<ProductFigure category="frais" variant={0} />).container.innerHTML;
    expect(vase).not.toBe(bouquet);
  });
});
