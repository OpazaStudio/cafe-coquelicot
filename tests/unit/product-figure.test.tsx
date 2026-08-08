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
  it("rend une image quand imagePath est fourni", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const { container } = render(
      <ProductFigure category="frais" imagePath="hero.png" imageBgColor="#eee" alt="rivage" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("rivage");
    // next/image encode l'URL source dans `src` (`/_next/image?url=...`) —
    // le segment de fichier reste lisible tel quel dans la query encodée.
    expect(img?.getAttribute("src")).toContain("hero.png");
    const wrapper = container.querySelector(".product-media");
    expect(wrapper?.getAttribute("style")).toContain("rgb(238, 238, 238)");
  });
  it("retombe sur le SVG quand imagePath est absent", () => {
    const { container } = render(<ProductFigure category="frais" variant={0} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
