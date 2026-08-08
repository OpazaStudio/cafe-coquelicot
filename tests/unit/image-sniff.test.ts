import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/lib/product-image";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
// "RIFF" + 4 octets de taille + "WEBP"
const WEBP = [
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

function bytes(head: number[]): Uint8Array {
  return new Uint8Array([...head, ...new Array(20).fill(0)]);
}

describe("sniffImageType", () => {
  it("reconnaît un PNG", () => {
    expect(sniffImageType(bytes(PNG))).toBe("image/png");
  });

  it("reconnaît un JPEG", () => {
    expect(sniffImageType(bytes(JPEG))).toBe("image/jpeg");
  });

  it("reconnaît un WebP (RIFF….WEBP)", () => {
    expect(sniffImageType(bytes(WEBP))).toBe("image/webp");
  });

  it("rejette un RIFF qui n'est pas du WebP (ex. wav)", () => {
    const wav = [...WEBP];
    wav[8] = 0x57; wav[9] = 0x41; wav[10] = 0x56; wav[11] = 0x45; // "WAVE"
    expect(sniffImageType(bytes(wav))).toBeNull();
  });

  it("rejette du HTML déguisé", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)");
    expect(sniffImageType(html)).toBeNull();
  });

  it("rejette un SVG (texte, non autorisé par le bucket)", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffImageType(svg)).toBeNull();
  });

  it("rejette une entrée trop courte", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});
