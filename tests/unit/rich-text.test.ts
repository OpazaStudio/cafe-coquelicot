// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RichDocSchema,
  emptyRichDoc,
  isRichDocEmpty,
  parseRichDoc,
  richDocToPlainText,
  type RichDoc,
} from "@/lib/rich-text/schema";

const doc = (...content: unknown[]) => ({ type: "doc", content }) as RichDoc;
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

describe("RichDocSchema", () => {
  it("accepte un document paragraphes + gras + italique", () => {
    const input = doc(
      para(text("Pivoines, "), text("eucalyptus", [{ type: "bold" }]), text(" et blé.")),
      para(text("Noué au lin.", [{ type: "italic" }])),
    );
    expect(RichDocSchema.safeParse(input).success).toBe(true);
  });

  it("accepte les listes à puces et numérotées", () => {
    const list = (type: string) => ({
      type,
      content: [{ type: "listItem", content: [para(text("Livraison 24h"))] }],
    });
    expect(RichDocSchema.safeParse(doc(list("bulletList"))).success).toBe(true);
    expect(RichDocSchema.safeParse(doc(list("orderedList"))).success).toBe(true);
  });

  it("accepte un lien http, https ou mailto", () => {
    for (const href of ["https://exemple.fr/a", "http://exemple.fr", "mailto:a@b.fr"]) {
      const input = doc(para(text("ici", [{ type: "link", attrs: { href } }])));
      expect(RichDocSchema.safeParse(input).success, href).toBe(true);
    }
  });

  it("rejette un lien javascript: ou data:", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<script>", "  javascript:alert(1)"]) {
      const input = doc(para(text("ici", [{ type: "link", attrs: { href } }])));
      expect(RichDocSchema.safeParse(input).success, href).toBe(false);
    }
  });

  it("rejette un nœud hors de la grammaire autorisée", () => {
    expect(RichDocSchema.safeParse(doc({ type: "image", attrs: { src: "x" } })).success).toBe(false);
    expect(RichDocSchema.safeParse(doc({ type: "heading", content: [text("Titre")] })).success).toBe(false);
  });

  it("rejette une marque inconnue", () => {
    const input = doc(para(text("x", [{ type: "code" }])));
    expect(RichDocSchema.safeParse(input).success).toBe(false);
  });

  it("borne la profondeur des listes imbriquées", () => {
    let node: unknown = para(text("profond"));
    for (let i = 0; i < 12; i++) {
      node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
    }
    expect(RichDocSchema.safeParse(doc(node)).success).toBe(false);
  });
});

describe("parseRichDoc", () => {
  it("renvoie null pour une valeur invalide ou absente", () => {
    expect(parseRichDoc(null)).toBeNull();
    expect(parseRichDoc(undefined)).toBeNull();
    expect(parseRichDoc({ type: "doc", content: [{ type: "heading" }] })).toBeNull();
  });

  it("renvoie le document quand il est valide", () => {
    const input = doc(para(text("ok")));
    expect(parseRichDoc(input)).toEqual(input);
  });
});

describe("richDocToPlainText", () => {
  it("colle les fragments d'un paragraphe sans séparateur", () => {
    const d = doc(para(text("Pivoines, "), text("eucalyptus", [{ type: "bold" }]), text(".")));
    expect(richDocToPlainText(d)).toBe("Pivoines, eucalyptus.");
  });

  it("sépare les blocs par un saut de ligne", () => {
    const d = doc(para(text("Un")), para(text("Deux")));
    expect(richDocToPlainText(d)).toBe("Un\nDeux");
  });

  it("rend un hardBreak comme un saut de ligne", () => {
    const d = doc(para(text("Un"), { type: "hardBreak" }, text("Deux")));
    expect(richDocToPlainText(d)).toBe("Un\nDeux");
  });

  it("aplatit les items de liste, un par ligne", () => {
    const d = doc({
      type: "bulletList",
      content: [
        { type: "listItem", content: [para(text("Livraison 24h"))] },
        { type: "listItem", content: [para(text("Vase non inclus"))] },
      ],
    });
    expect(richDocToPlainText(d)).toBe("Livraison 24h\nVase non inclus");
  });

  it("ignore les paragraphes vides en tête et en queue", () => {
    const d = doc(para(), para(text("Seul")), para());
    expect(richDocToPlainText(d)).toBe("Seul");
  });
});

describe("isRichDocEmpty", () => {
  it("considère vide un document sans texte", () => {
    expect(isRichDocEmpty(emptyRichDoc())).toBe(true);
    expect(isRichDocEmpty(doc(para(), para(text("   "))))).toBe(true);
    expect(isRichDocEmpty(null)).toBe(true);
  });

  it("considère non vide dès qu'il reste un caractère", () => {
    expect(isRichDocEmpty(doc(para(text("a"))))).toBe(false);
  });
});
