import { describe, expect, it } from "vitest";
import { GALLERY_COLUMNS, GALLERY_SLOTS, gallerySlotHint, gallerySlotSizes, spanFrame } from "@/lib/gallery-layout";
import { isProductFrame } from "@/lib/product-frame";

describe("grille de la galerie", () => {
  it("compte huit tuiles dont chaque cadre est un format standard, sur ordinateur comme sur téléphone", () => {
    expect(GALLERY_SLOTS).toHaveLength(8);
    for (const s of GALLERY_SLOTS) {
      expect(isProductFrame(spanFrame(s.desktop))).toBe(true);
      expect(isProductFrame(spanFrame(s.mobile))).toBe(true);
    }
  });

  it("remplit chaque bande de colonnes sans trou", () => {
    for (const bp of ["desktop", "mobile"] as const) {
      let filled = 0;
      let rows: number | null = null;
      for (const s of GALLERY_SLOTS) {
        const span = s[bp];
        if (rows === null) rows = span.rows;
        expect(span.rows).toBe(rows);
        filled += span.cols;
        if (filled === GALLERY_COLUMNS[bp]) {
          filled = 0;
          rows = null;
        }
        expect(filled).toBeLessThan(GALLERY_COLUMNS[bp]);
      }
      expect(filled).toBe(0);
    }
  });

  it("dérive des tailles d'image et une aide lisible pour le back-office", () => {
    expect(gallerySlotSizes(GALLERY_SLOTS[0])).toBe("(max-width: 700px) 100vw, 577px");
    expect(gallerySlotHint(GALLERY_SLOTS[1])).toContain("portrait 3:4 sur ordinateur");
    expect(gallerySlotHint(GALLERY_SLOTS[1])).toContain("carré 1:1 sur téléphone");
  });
});
