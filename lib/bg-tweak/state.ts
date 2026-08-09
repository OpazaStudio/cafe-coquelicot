// Atelier couleurs — état du panneau de réglage des fonds.
//
// Logique pure : aucune touche au DOM ici. Le panneau étant joignable en
// production, tout ce qui vient de l'URL est attaquant-contrôlé — d'où la
// validation systématique en sortie de `decodeState`, avant que quoi que ce
// soit n'atteigne le document.

import type { SectionBg } from "@/components/sections";

export type BgName = SectionBg;

/** Paramètre d'ouverture du panneau : `?atelier=1`. */
export const PARAM = "atelier";

/** Les cinq couleurs de marque, telles que `:root` les pose dans globals.css. */
export const DEFAULT_PALETTE: Record<BgName, string> = {
  burgundy: "#870c20",
  "pale-oak": "#e0caaf",
  "coffee-bean": "#6d4d36",
  "coffee-bean-2": "#130105",
  linen: "#f3ebe2",
};

/** Ordre d'encodage dans l'URL — figé, changer l'ordre invalide les liens partagés. */
export const PALETTE_ORDER: readonly BgName[] = [
  "burgundy",
  "pale-oak",
  "coffee-bean",
  "coffee-bean-2",
  "linen",
];

/** L'encre que `section[data-bg]` associe à chaque fond (globals.css:140-144). */
export const INK_FOR_BG: Record<BgName, BgName> = {
  linen: "burgundy",
  burgundy: "linen",
  "pale-oak": "burgundy",
  "coffee-bean": "linen",
  "coffee-bean-2": "linen",
};

export type TweakState = {
  /** Les cinq couleurs, valeur d'origine comprise. */
  palette: Record<BgName, string>;
  /** Uniquement les sections réassignées, indexées par leur clé. */
  sections: Record<string, BgName>;
};

export const INITIAL_STATE: TweakState = { palette: DEFAULT_PALETTE, sections: {} };

const HEX = /^#[0-9a-f]{6}$/i;
const SECTION_KEY = /^[a-z0-9-]+$/i;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function isBgName(value: unknown): value is BgName {
  return typeof value === "string" && value in DEFAULT_PALETTE;
}

export function isSectionKey(value: unknown): value is string {
  return typeof value === "string" && SECTION_KEY.test(value);
}

function toParams(source: string | URLSearchParams): URLSearchParams {
  if (source instanceof URLSearchParams) return source;
  const q = source.startsWith("?") ? source.slice(1) : source;
  return new URLSearchParams(q);
}

/**
 * Lit un état depuis la query string. Toute valeur douteuse est écartée et
 * laisse l'originale en place : on ne renvoie jamais une chaîne non validée.
 */
export function decodeState(source: string | URLSearchParams): TweakState {
  const params = toParams(source);
  const palette = { ...DEFAULT_PALETTE };
  const sections: Record<string, BgName> = {};

  const raw = params.get("c");
  if (raw) {
    const parts = raw.split(",");
    // Une liste tronquée signale une URL abîmée : on préfère tout ignorer
    // plutôt que de décaler les couleurs les unes sur les autres.
    if (parts.length === PALETTE_ORDER.length) {
      PALETTE_ORDER.forEach((name, i) => {
        const hex = `#${parts[i].trim()}`;
        if (isHex(hex)) palette[name] = hex.toLowerCase();
      });
    }
  }

  const assigned = params.get("s");
  if (assigned) {
    for (const pair of assigned.split(",")) {
      const at = pair.indexOf(":");
      if (at < 0) continue;
      const key = pair.slice(0, at).trim();
      const bg = pair.slice(at + 1).trim();
      if (isSectionKey(key) && isBgName(bg)) sections[key] = bg;
    }
  }

  return { palette, sections };
}

/** Écrit l'état dans une query string. Ce qui vaut l'original n'est pas écrit. */
export function encodeState(state: TweakState): URLSearchParams {
  const params = new URLSearchParams();
  params.set(PARAM, "1");

  const touched = PALETTE_ORDER.some(
    (name) => state.palette[name].toLowerCase() !== DEFAULT_PALETTE[name]
  );
  if (touched) {
    params.set("c", PALETTE_ORDER.map((name) => state.palette[name].slice(1)).join(","));
  }

  const entries = Object.entries(state.sections);
  if (entries.length > 0) {
    params.set("s", entries.map(([key, bg]) => `${key}:${bg}`).join(","));
  }

  return params;
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = channel(parseInt(hex.slice(1, 3), 16) / 255);
  const g = channel(parseInt(hex.slice(3, 5), 16) / 255);
  const b = channel(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.1, de 1 (identiques) à 21 (noir sur blanc). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
