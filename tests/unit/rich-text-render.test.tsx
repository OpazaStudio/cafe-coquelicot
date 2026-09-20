import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichText } from "@/components/rich-text";
import type { RichDoc } from "@/lib/rich-text/schema";

const doc = (...content: unknown[]) => ({ type: "doc", content }) as RichDoc;
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

describe("RichText", () => {
  it("rend un paragraphe par bloc", () => {
    const { container } = render(<RichText doc={doc(para(text("Un")), para(text("Deux")))} />);
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBe(2);
    expect(ps[0].textContent).toBe("Un");
    expect(ps[1].textContent).toBe("Deux");
  });

  it("rend le gras et l'italique en <strong> et <em>", () => {
    const { container } = render(
      <RichText doc={doc(para(text("a", [{ type: "bold" }]), text("b", [{ type: "italic" }])))} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("a");
    expect(container.querySelector("em")?.textContent).toBe("b");
  });

  it("combine plusieurs marques sur un même fragment", () => {
    const { container } = render(
      <RichText doc={doc(para(text("ab", [{ type: "bold" }, { type: "italic" }])))} />,
    );
    expect(container.querySelector("strong em")?.textContent).toBe("ab");
  });

  it("rend les listes en <ul> et <ol>", () => {
    const list = (type: string, label: string) => ({
      type,
      content: [{ type: "listItem", content: [para(text(label))] }],
    });
    const { container } = render(
      <RichText doc={doc(list("bulletList", "puce"), list("orderedList", "numéro"))} />,
    );
    expect(container.querySelector("ul li")?.textContent).toBe("puce");
    expect(container.querySelector("ol li")?.textContent).toBe("numéro");
  });

  it("rend un hardBreak en <br>", () => {
    const { container } = render(<RichText doc={doc(para(text("a"), { type: "hardBreak" }, text("b")))} />);
    expect(container.querySelectorAll("br").length).toBe(1);
  });

  it("rend un lien externe avec rel et target sûrs", () => {
    render(
      <RichText
        doc={doc(para(text("ici", [{ type: "link", attrs: { href: "https://exemple.fr" } }])))}
      />,
    );
    const a = screen.getByRole("link", { name: "ici" });
    expect(a.getAttribute("href")).toBe("https://exemple.fr");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("n'émet aucun lien quand le href est refusé par la grammaire", () => {
    const { container } = render(
      <RichText
        doc={doc(para(text("piège", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))}
      />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("piège");
  });

  it("retombe sur le texte brut quand le document est absent", () => {
    const { container } = render(<RichText doc={null} fallback={"Ligne 1\nLigne 2"} />);
    expect(container.textContent).toBe("Ligne 1Ligne 2");
    expect(container.querySelectorAll("br").length).toBe(1);
  });

  it("ne rend rien quand il n'y a ni document ni texte de repli", () => {
    const { container } = render(<RichText doc={null} fallback="" />);
    expect(container.innerHTML).toBe("");
  });
});
