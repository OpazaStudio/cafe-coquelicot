import { MAX_IMAGE_BYTES, type AllowedImageType } from "./product-image";

export const MAX_IMAGE_EDGE = 2000;
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

const QUALITY_STEPS = [0.85, 0.72, 0.6];
const EDGE_STEPS = [MAX_IMAGE_EDGE, 1400, 1000];

export function targetSize(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export function renameTo(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${extensionFor(type)}`;
}

type Source = { image: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      "Format d'image non reconnu par le navigateur — convertissez-la en JPG ou PNG (les HEIC d'iPhone ne s'ouvrent que dans Safari).",
    );
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(
  source: Source,
  edge: number,
  quality: number,
): Promise<Blob | null> {
  const { width, height } = targetSize(source.width, source.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Traitement d'image indisponible dans ce navigateur.");
  ctx.drawImage(source.image, 0, 0, width, height);
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.type === "image/webp") return webp;
  return toBlob(canvas, "image/png", quality);
}

export async function normalizeImageFile(file: File): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image trop lourde — 40 Mo maximum en entrée.");
  }
  const source = await decode(file);
  try {
    let smallest: Blob | null = null;
    for (const edge of EDGE_STEPS) {
      for (const quality of QUALITY_STEPS) {
        const blob = await encode(source, edge, quality);
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= MAX_IMAGE_BYTES) {
          return new File([blob], renameTo(file.name, blob.type), { type: blob.type });
        }
      }
    }
    if (!smallest) throw new Error("Conversion de l'image impossible.");
    throw new Error("Image trop lourde même après compression — réduisez-la avant l'envoi.");
  } finally {
    source.close();
  }
}

export function isAllowedOutput(type: string): type is AllowedImageType {
  return type === "image/png" || type === "image/webp" || type === "image/jpeg";
}
