"use client";

import { useState } from "react";
import Image from "next/image";
import { productImageUrl } from "@/lib/product-image";
import {
  PRODUCT_FRAMES,
  productFrameRatio,
  type ProductFrameId,
} from "@/lib/product-frame";
import { uploadImageFile } from "./image-upload";

export type ImageDraft = {
  key: string;
  id?: string;
  path: string;
  bgColor: string | null;
  alt: string | null;
  sizeKey: string | null;
  colorKey: string | null;
};

export type VariantOption = { key: string; label: string };

const inputCls =
  "rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-wine focus:ring-2 focus:ring-wine/25";
const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-md border border-line text-sm text-ink transition hover:bg-stone-100 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none";

export function ImageGallery({
  images,
  sizes,
  colors,
  onChange,
  nextKey,
  frame,
  onFrameChange,
}: {
  images: ImageDraft[];
  sizes: VariantOption[];
  colors: VariantOption[];
  onChange: (next: ImageDraft[]) => void;
  nextKey: () => string;
  frame: ProductFrameId;
  onFrameChange: (next: ProductFrameId) => void;
}) {
  const ratio = productFrameRatio(frame);
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  async function addFiles(files: File[]) {
    setErrors([]);
    setPending(files.length);
    const added: ImageDraft[] = [];
    const failures: string[] = [];
    for (const file of files) {
      const result = await uploadImageFile(file);
      if ("error" in result) failures.push(`${file.name} — ${result.error}`);
      else
        added.push({
          key: nextKey(),
          path: result.path,
          bgColor: null,
          alt: null,
          sizeKey: null,
          colorKey: null,
        });
      setPending((n) => n - 1);
    }
    setErrors(failures);
    if (added.length) onChange([...images, ...added]);
  }

  function update(i: number, patch: Partial<ImageDraft>) {
    onChange(images.map((img, j) => (j === i ? { ...img, ...patch } : img)));
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-stone-700">
        Photos{" "}
        <span className="font-normal text-muted">
          (la première sert de couverture en boutique)
        </span>
      </legend>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-48 flex-col gap-1">
          <span className="text-xs text-muted">Format du cadre</span>
          <select
            name="imageFrame"
            aria-label="Format du cadre"
            value={frame}
            onChange={(e) => onFrameChange(e.target.value as ProductFrameId)}
            className={inputCls}
          >
            {PRODUCT_FRAMES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-xs text-muted">
          Toutes les photos du produit s&apos;affichent dans ce cadre en boutique ;
          les vignettes ci-dessous montrent le recadrage obtenu.
        </span>
      </div>

      {images.length === 0 && (
        <p className="text-sm text-muted">
          Aucune photo — le produit s&apos;affiche avec son illustration au trait.
        </p>
      )}

      {images.map((img, i) => (
        <div
          key={img.key}
          className="flex items-end gap-2"
          data-testid={`image-row-${i}`}
        >
          <div
            className="relative w-20 shrink-0 overflow-hidden rounded-lg border border-line"
            data-testid={`image-frame-${i}`}
            style={{ aspectRatio: ratio, ...(img.bgColor ? { background: img.bgColor } : {}) }}
          >
            <Image
              src={productImageUrl(img.path)}
              alt=""
              fill
              sizes="80px"
              style={{ objectFit: "cover" }}
            />
            {i === 0 && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-wine/85 text-center text-[9px] font-medium text-white">
                couverture
              </span>
            )}
          </div>

          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Texte alternatif</span>
            <input
              aria-label={`Texte alternatif photo ${i + 1}`}
              value={img.alt ?? ""}
              onChange={(e) => update(i, { alt: e.target.value || null })}
              className={inputCls}
              placeholder="Le bouquet grand format, de face"
            />
          </label>

          <label className="flex w-36 flex-col gap-1">
            <span className="text-xs text-muted">Taille montrée</span>
            <select
              aria-label={`Taille montrée photo ${i + 1}`}
              value={img.sizeKey ?? ""}
              onChange={(e) => update(i, { sizeKey: e.target.value || null })}
              className={inputCls}
              disabled={sizes.length === 0}
            >
              <option value="">Toutes</option>
              {sizes.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label || "(sans nom)"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-36 flex-col gap-1">
            <span className="text-xs text-muted">Coloris montré</span>
            <select
              aria-label={`Coloris montré photo ${i + 1}`}
              value={img.colorKey ?? ""}
              onChange={(e) => update(i, { colorKey: e.target.value || null })}
              className={inputCls}
              disabled={colors.length === 0}
            >
              <option value="">Tous</option>
              {colors.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label || "(sans nom)"}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-1.5 flex gap-1">
            <button
              type="button"
              className={iconBtn}
              disabled={i === 0}
              aria-label={`Monter la photo ${i + 1}`}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={iconBtn}
              disabled={i === images.length - 1}
              aria-label={`Descendre la photo ${i + 1}`}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-sm text-danger transition hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
              aria-label={`Supprimer la photo ${i + 1}`}
              onClick={() => onChange(images.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <label className="cursor-pointer self-start rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-stone-100">
          {pending > 0 ? `Optimisation… (${pending})` : "+ Ajouter des photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={pending > 0}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void addFiles(files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-muted">
          N&apos;importe quel format : converti en WebP, redimensionné et nettoyé de
          ses métadonnées automatiquement.
        </span>
      </div>

      {errors.map((e) => (
        <p key={e} role="alert" className="text-sm font-medium text-danger">
          {e}
        </p>
      ))}
    </fieldset>
  );
}
