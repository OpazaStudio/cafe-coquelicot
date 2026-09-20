import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_IMAGE_EDGE,
  extensionFor,
  normalizeImageFile,
  renameTo,
  targetSize,
} from "@/lib/image-normalize";
import { MAX_IMAGE_BYTES } from "@/lib/product-image";

describe("targetSize", () => {
  it("laisse intacte une image déjà sous la limite", () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("ramène le grand côté à la limite en gardant le ratio", () => {
    expect(targetSize(4000, 3000)).toEqual({ width: MAX_IMAGE_EDGE, height: 1500 });
    expect(targetSize(3000, 4000)).toEqual({ width: 1500, height: MAX_IMAGE_EDGE });
  });

  it("ne descend jamais sous 1 pixel", () => {
    expect(targetSize(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });

  it("accepte une limite personnalisée", () => {
    expect(targetSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe("renameTo", () => {
  it("remplace l'extension par celle du format produit", () => {
    expect(renameTo("IMG_2843.HEIC", "image/webp")).toBe("IMG_2843.webp");
    expect(renameTo("photo.jpeg", "image/png")).toBe("photo.png");
  });

  it("ajoute une extension à un nom qui n'en a pas", () => {
    expect(renameTo("scan", "image/webp")).toBe("scan.webp");
  });

  it("retombe sur un nom générique quand il n'en reste rien", () => {
    expect(renameTo(".webp", "image/webp")).toBe("image.webp");
  });

  it("déduit l'extension du type", () => {
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });
});

type Encoded = { type: string; size: number };
let encodeCalls: { width: number; height: number; type: string; quality: number }[] = [];
let encoder: (type: string, quality: number, w: number, h: number) => Encoded | null;

function stubCanvas() {
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob | null) => void, type: string, quality: number) => {
        encodeCalls.push({ width: canvas.width, height: canvas.height, type, quality });
        const out = encoder(type, quality, canvas.width, canvas.height);
        if (!out) return cb(null);
        const blob = new Blob(["."], { type: out.type });
        Object.defineProperty(blob, "size", { value: out.size });
        cb(blob);
      },
    };
    return canvas as unknown as HTMLElement;
  }) as typeof document.createElement);
}

beforeEach(() => {
  encodeCalls = [];
  encoder = (type) => ({ type, size: 1000 });
  vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 3000, close: () => {} }));
  stubCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function source() {
  return new File(["x"], "IMG_2843.HEIC", { type: "image/heic" });
}

describe("normalizeImageFile", () => {
  it("convertit en WebP et redimensionne au grand côté", async () => {
    const out = await normalizeImageFile(source());
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("IMG_2843.webp");
    expect(encodeCalls[0]).toMatchObject({ width: 2000, height: 1500, type: "image/webp" });
  });

  it("retombe sur PNG quand le navigateur refuse le WebP", async () => {
    encoder = (type) => (type === "image/webp" ? { type: "image/png", size: 900 } : { type, size: 900 });
    const out = await normalizeImageFile(source());
    expect(out.type).toBe("image/png");
    expect(out.name).toBe("IMG_2843.png");
  });

  it("baisse la qualité puis la taille tant que le fichier dépasse la limite", async () => {
    const big = MAX_IMAGE_BYTES * 2;
    encoder = (type, quality, w) => ({ type, size: w > 1400 || quality > 0.6 ? big : 1000 });
    await normalizeImageFile(source());
    expect(encodeCalls.map((c) => [c.width, c.quality])).toEqual([
      [2000, 0.85],
      [2000, 0.72],
      [2000, 0.6],
      [1400, 0.85],
      [1400, 0.72],
      [1400, 0.6],
    ]);
  });

  it("refuse une image qui reste trop lourde après compression", async () => {
    encoder = (type) => ({ type, size: MAX_IMAGE_BYTES * 2 });
    await expect(normalizeImageFile(source())).rejects.toThrow(/trop lourde/);
  });

  it("refuse un fichier source démesuré sans même le décoder", async () => {
    const huge = new File(["x"], "enorme.jpg", { type: "image/jpeg" });
    Object.defineProperty(huge, "size", { value: 60 * 1024 * 1024 });
    await expect(normalizeImageFile(huge)).rejects.toThrow(/40 Mo/);
    expect(encodeCalls.length).toBe(0);
  });

  it("explique quoi faire quand le navigateur ne sait pas décoder le format", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("unsupported");
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode() {
          return Promise.reject(new Error("decode failed"));
        }
      },
    );
    await expect(normalizeImageFile(source())).rejects.toThrow(/Safari/);
  });
});
