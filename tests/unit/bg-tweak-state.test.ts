import { describe, it, expect } from "vitest";
import {
  DEFAULT_PALETTE,
  INK_FOR_BG,
  PARAM,
  contrastRatio,
  decodeState,
  encodeState,
  isBgName,
  isHex,
} from "@/lib/bg-tweak/state";

describe("isHex", () => {
  it("accepte un hex 6 chiffres, majuscules ou minuscules", () => {
    expect(isHex("#870c20")).toBe(true);
    expect(isHex("#F3EBE2")).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(isHex("870c20")).toBe(false); // sans dièse
    expect(isHex("#870c2")).toBe(false); // trop court
    expect(isHex("#870c200")).toBe(false); // trop long
    expect(isHex("#abc")).toBe(false); // forme courte non supportée
    expect(isHex("red")).toBe(false);
    expect(isHex("#870c20;}")).toBe(false);
    expect(isHex("var(--x)")).toBe(false);
    expect(isHex(null)).toBe(false);
    expect(isHex(42)).toBe(false);
  });
});

describe("isBgName", () => {
  it("accepte les cinq noms de la palette", () => {
    for (const name of Object.keys(DEFAULT_PALETTE)) {
      expect(isBgName(name)).toBe(true);
    }
  });

  it("refuse les noms hors palette", () => {
    expect(isBgName("rouge")).toBe(false);
    expect(isBgName("LINEN")).toBe(false);
    expect(isBgName("")).toBe(false);
    expect(isBgName(undefined)).toBe(false);
  });
});

describe("decodeState", () => {
  it("rend la palette d'origine quand rien n'est passé", () => {
    const state = decodeState("");
    expect(state.palette).toEqual(DEFAULT_PALETTE);
    expect(state.sections).toEqual({});
  });

  it("lit les cinq couleurs dans l'ordre burgundy, pale-oak, coffee-bean, coffee-bean-2, linen", () => {
    const state = decodeState("?c=111111,222222,333333,444444,555555");
    expect(state.palette).toEqual({
      burgundy: "#111111",
      "pale-oak": "#222222",
      "coffee-bean": "#333333",
      "coffee-bean-2": "#444444",
      linen: "#555555",
    });
  });

  it("lit les assignations de sections", () => {
    const state = decodeState("?s=hero:pale-oak,about:burgundy");
    expect(state.sections).toEqual({ hero: "pale-oak", about: "burgundy" });
  });

  it("ignore une couleur invalide et garde l'originale à sa place", () => {
    const state = decodeState("?c=111111,red,333333,444444,555555");
    expect(state.palette["pale-oak"]).toBe(DEFAULT_PALETTE["pale-oak"]);
    expect(state.palette.burgundy).toBe("#111111");
    expect(state.palette["coffee-bean"]).toBe("#333333");
  });

  it("rejette une couleur qui tenterait de sortir de la déclaration CSS", () => {
    const state = decodeState("?c=" + encodeURIComponent("red;}html{display:none"));
    expect(state.palette.burgundy).toBe(DEFAULT_PALETTE.burgundy);
  });

  it("ignore une liste de couleurs qui n'a pas cinq entrées", () => {
    expect(decodeState("?c=111111,222222").palette).toEqual(DEFAULT_PALETTE);
  });

  it("ignore une assignation vers un nom hors palette", () => {
    const state = decodeState("?s=hero:fuchsia,about:burgundy");
    expect(state.sections).toEqual({ about: "burgundy" });
  });

  it("ignore une clé de section malformée", () => {
    const state = decodeState(
      "?s=" + encodeURIComponent('hero"],section[x:burgundy') + ",about:burgundy"
    );
    expect(state.sections).toEqual({ about: "burgundy" });
  });

  it("ignore une paire sans deux-points", () => {
    expect(decodeState("?s=hero,about:burgundy").sections).toEqual({ about: "burgundy" });
  });

  it("accepte un URLSearchParams aussi bien qu'une chaîne", () => {
    const params = new URLSearchParams("s=hero:burgundy");
    expect(decodeState(params).sections).toEqual({ hero: "burgundy" });
  });
});

describe("encodeState", () => {
  it("n'écrit que le paramètre d'ouverture quand rien n'est modifié", () => {
    const params = encodeState({ palette: DEFAULT_PALETTE, sections: {} });
    expect(params.get(PARAM)).toBe("1");
    expect(params.get("c")).toBeNull();
    expect(params.get("s")).toBeNull();
  });

  it("écrit la palette dès qu'une couleur change", () => {
    const params = encodeState({
      palette: { ...DEFAULT_PALETTE, linen: "#ffffff" },
      sections: {},
    });
    expect(params.get("c")).toBe("870c20,e0caaf,6d4d36,130105,ffffff");
  });

  it("écrit les sections réassignées", () => {
    const params = encodeState({
      palette: DEFAULT_PALETTE,
      sections: { hero: "pale-oak", about: "burgundy" },
    });
    expect(params.get("s")).toBe("hero:pale-oak,about:burgundy");
  });

  it("fait l'aller-retour sans perte", () => {
    const state = {
      palette: { ...DEFAULT_PALETTE, burgundy: "#123456", linen: "#abcdef" },
      sections: { hero: "coffee-bean" as const, contact: "linen" as const },
    };
    expect(decodeState(encodeState(state).toString())).toEqual(state);
  });
});

describe("contrastRatio", () => {
  it("donne 21 pour noir sur blanc", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("donne 1 pour deux couleurs identiques", () => {
    expect(contrastRatio("#870c20", "#870c20")).toBeCloseTo(1, 5);
  });

  it("est symétrique", () => {
    expect(contrastRatio("#870c20", "#f3ebe2")).toBeCloseTo(
      contrastRatio("#f3ebe2", "#870c20"),
      5
    );
  });

  it("confirme que les couples de la palette d'origine tiennent le niveau AA", () => {
    for (const [bg, ink] of Object.entries(INK_FOR_BG)) {
      const ratio = contrastRatio(
        DEFAULT_PALETTE[bg as keyof typeof DEFAULT_PALETTE],
        DEFAULT_PALETTE[ink]
      );
      expect(ratio, `${bg} / ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
