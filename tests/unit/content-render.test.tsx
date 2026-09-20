import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Lines, Paragraphs } from "@/components/content/text";
import { ContentImage, hasContentImage } from "@/components/content/content-image";

const IMG = "123e4567-e89b-12d3-a456-426614174000.png";

describe("Lines", () => {
  it("transforme les sauts de ligne en <br>", () => {
    const { container } = render(<Lines text={"Café\nCoquelicot"} />);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toBe("CaféCoquelicot");
  });
});

describe("Paragraphs", () => {
  it("découpe sur les lignes vides et ignore les paragraphes vides", () => {
    const { container } = render(<Paragraphs text={"Un\n\n\nDeux\nsuite\n\n"} className="body" />);
    const ps = container.querySelectorAll("p.body");
    expect(ps).toHaveLength(2);
    expect(ps[1].querySelectorAll("br")).toHaveLength(1);
  });
});

describe("ContentImage", () => {
  it("rend le repli sans chemin", () => {
    const { container } = render(
      <ContentImage image={{ path: null, alt: "" }} fallback={<svg data-testid="svg" />} sizes="100px" />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
  it("rend la photo avec son alt quand le chemin est posé", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const { container } = render(
      <ContentImage image={{ path: IMG, alt: "la devanture" }} fallback={<svg />} sizes="100px" />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("la devanture");
    expect(img?.getAttribute("src")).toContain(IMG);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("hasContentImage", () => {
  it("est fausse sans chemin", () => {
    expect(hasContentImage({ path: null, alt: "" })).toBe(false);
  });
  it("est vraie avec un chemin quand la variable Supabase est posée", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(hasContentImage({ path: IMG, alt: "" })).toBe(true);
  });
});
