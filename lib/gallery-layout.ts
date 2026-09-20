import { productFrame, type ProductFrameId } from "./product-frame";

export const GALLERY_COLUMNS = { desktop: 12, mobile: 6 } as const;
export const GALLERY_CONTAINER_WIDTH = 1384;

type Span = { cols: number; rows: number };

export type GallerySlot = {
  cls: string;
  variant: number;
  desktop: Span;
  mobile: Span;
};

const slot = (
  i: number,
  variant: number,
  desktop: [number, number],
  mobile: [number, number],
): GallerySlot => ({
  cls: `gallery__tile--${i}`,
  variant,
  desktop: { cols: desktop[0], rows: desktop[1] },
  mobile: { cols: mobile[0], rows: mobile[1] },
});

export const GALLERY_SLOTS: readonly GallerySlot[] = [
  slot(1, 0, [5, 4], [6, 4]),
  slot(2, 2, [3, 4], [3, 3]),
  slot(3, 4, [4, 4], [3, 3]),
  slot(4, 3, [8, 6], [6, 4]),
  slot(5, 5, [4, 6], [3, 4]),
  slot(6, 5, [4, 4], [3, 4]),
  slot(7, 2, [3, 4], [3, 3]),
  slot(8, 1, [5, 4], [3, 3]),
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function spanFrame(span: Span): ProductFrameId {
  const d = gcd(span.cols, span.rows);
  return `${span.cols / d}:${span.rows / d}` as ProductFrameId;
}

export function gallerySlotSizes(s: GallerySlot): string {
  const mobile = Math.round((s.mobile.cols / GALLERY_COLUMNS.mobile) * 100);
  const desktop = Math.round((s.desktop.cols / GALLERY_COLUMNS.desktop) * GALLERY_CONTAINER_WIDTH);
  return `(max-width: 700px) ${mobile}vw, ${desktop}px`;
}

export function gallerySlotHint(s: GallerySlot): string {
  const d = productFrame(spanFrame(s.desktop));
  const m = productFrame(spanFrame(s.mobile));
  return `Cadre ${d.label.toLowerCase()} sur ordinateur, ${m.label.toLowerCase()} sur téléphone. La photo est recadrée au centre : garder le sujet au milieu.`;
}
