import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gallery, Hero, Prestations, SiteFooter, SiteHeader } from "@/components/sections";
import { DEFAULT_HOME } from "@/lib/content/pages/home";
import { DEFAULT_SITE } from "@/lib/content/pages/site";
import { CartProvider } from "@/lib/cart/cart-context";

const IMG = "123e4567-e89b-12d3-a456-426614174000.png";

describe("sections à contenu", () => {
  it("Hero rend titre, manuscrit, texte et boutons depuis le contenu", () => {
    render(<Hero bg="linen" content={{ ...DEFAULT_HOME.hero, title: "Café\nTest", script: "manuscrit" }} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Test");
    expect(h1.querySelector(".script")?.textContent).toBe("manuscrit");
    expect(screen.getByRole("link", { name: /Voir la boutique/ }).getAttribute("href")).toBe("/boutique");
  });
  it("Hero garde l'illustration sans photo et rend la photo sinon", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const svg = render(<Hero bg="linen" content={DEFAULT_HOME.hero} />);
    expect(svg.container.querySelector(".hero__media svg")).not.toBeNull();
    const photo = render(<Hero bg="linen" content={{ ...DEFAULT_HOME.hero, image: { path: IMG, alt: "devanture" } }} />);
    expect(photo.container.querySelector(".hero__media img")?.getAttribute("alt")).toBe("devanture");
    expect(photo.container.querySelector(".hero__media--photo")).not.toBeNull();
  });
  it("Gallery rend huit tuiles, mots et illustrations", () => {
    const { container } = render(<Gallery bg="linen" content={DEFAULT_HOME.gallery} />);
    expect(container.querySelectorAll(".gallery__tile")).toHaveLength(8);
    expect(container.querySelectorAll(".gallery__tile--label")).toHaveLength(2);
    expect(container.querySelectorAll(".gallery__tile svg")).toHaveLength(6);
    expect(screen.getByRole("link", { name: /Toutes nos réalisations/ }).getAttribute("href")).toBe("/boutique");
  });
  it("Prestations rend une carte par élément avec son icône", () => {
    const content = { ...DEFAULT_HOME.prestations, items: DEFAULT_HOME.prestations.items.slice(0, 2) };
    const { container } = render(<Prestations bg="burgundy" content={content} />);
    expect(container.querySelectorAll(".prestation-card")).toHaveLength(2);
    expect(container.querySelectorAll(".prestation-card__icon")).toHaveLength(2);
    expect(container.querySelectorAll(".prestations__sub")).toHaveLength(3);
  });
  it("SiteHeader et SiteFooter rendent les liens du contenu", () => {
    render(
      <CartProvider>
        <SiteHeader nav={[{ label: "Atelier", href: "/#about" }]} />
      </CartProvider>,
    );
    expect(screen.getByRole("link", { name: "Atelier" }).getAttribute("href")).toBe("/#about");
    const footer = render(<SiteFooter footer={{ ...DEFAULT_SITE.footer, instagram: "https://instagram.com/x", presse: "" }} />);
    expect(footer.getByRole("link", { name: "Instagram" }).getAttribute("href")).toBe("https://instagram.com/x");
    expect(footer.queryByRole("link", { name: "Presse" })).toBeNull();
    expect(footer.getAllByRole("heading", { level: 4 })).toHaveLength(3);
  });
});
