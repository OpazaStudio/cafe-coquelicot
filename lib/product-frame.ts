import type { CSSProperties } from "react";

export const PRODUCT_FRAMES = [
  { id: "1:1", label: "Carré 1:1", w: 1, h: 1 },
  { id: "4:5", label: "Portrait 4:5", w: 4, h: 5 },
  { id: "3:4", label: "Portrait 3:4", w: 3, h: 4 },
  { id: "2:3", label: "Portrait 2:3", w: 2, h: 3 },
  { id: "5:4", label: "Paysage 5:4", w: 5, h: 4 },
  { id: "4:3", label: "Paysage 4:3", w: 4, h: 3 },
  { id: "3:2", label: "Paysage 3:2", w: 3, h: 2 },
  { id: "16:9", label: "Paysage 16:9", w: 16, h: 9 },
] as const;

export type ProductFrameId = (typeof PRODUCT_FRAMES)[number]["id"];

export const PRODUCT_FRAME_IDS = PRODUCT_FRAMES.map((f) => f.id) as [
  ProductFrameId,
  ...ProductFrameId[],
];

export const DEFAULT_PRODUCT_FRAME: ProductFrameId = "1:1";

export function isProductFrame(value: unknown): value is ProductFrameId {
  return typeof value === "string" && PRODUCT_FRAME_IDS.includes(value as ProductFrameId);
}

export function normalizeProductFrame(value: unknown): ProductFrameId {
  return isProductFrame(value) ? value : DEFAULT_PRODUCT_FRAME;
}

export function productFrame(id: ProductFrameId) {
  return PRODUCT_FRAMES.find((f) => f.id === id) ?? PRODUCT_FRAMES[0];
}

export function productFrameRatio(id: ProductFrameId): string {
  const { w, h } = productFrame(id);
  return `${w} / ${h}`;
}

export function productFrameStyle(id: ProductFrameId) {
  const { w, h } = productFrame(id);
  return { "--frame-w": w, "--frame-h": h } as CSSProperties;
}
