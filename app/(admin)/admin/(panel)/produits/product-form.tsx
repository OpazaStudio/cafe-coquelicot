"use client";

import { useActionState, useRef, useState } from "react";
import { CATEGORY_LABELS, VARIANT_LABELS } from "@/lib/categories";
import type {
  ProductCategory,
  ProductColorRow,
  ProductImageRow,
  ProductRow,
  ProductSizeRow,
} from "@/lib/db/schema";
import { Bouquet } from "@/components/illustrations";
import { normalizeProductFrame, type ProductFrameId } from "@/lib/product-frame";
import {
  parseRichDoc,
  richDocFromPlainText,
  type RichDoc,
} from "@/lib/rich-text/schema";
import { btnPrimary } from "../ui";
import type { ProductFormState } from "./actions";
import { ImageGallery, type ImageDraft } from "./image-gallery";
import { RichEditor } from "./rich-editor";

type Props = {
  action: (
    prev: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;
  product?: ProductRow;
  sizes?: ProductSizeRow[];
  colors?: ProductColorRow[];
  images?: ProductImageRow[];
  submitLabel: string;
};

// `key` : identité stable côté React (les lignes sont supprimables — un key
// d'index ferait glisser l'état des lignes suivantes). Distinct de `id`, qui
// est l'identifiant serveur (absent pour une ligne encore non enregistrée).
type SizeDraft = {
  key: string;
  id?: string;
  label: string;
  price: string;
  active: boolean;
};
type ColorDraft = {
  key: string;
  id?: string;
  label: string;
  illustrationVariant: number;
  active: boolean;
};

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {errors[0]}
    </p>
  );
}

const inputCls =
  "rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-wine focus:ring-2 focus:ring-wine/25";

export function ProductForm({
  action,
  product,
  sizes: initialSizes,
  colors: initialColors,
  images: initialImages,
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    undefined,
  );
  const [variant, setVariant] = useState(product?.illustrationVariant ?? 0);
  const [frame, setFrame] = useState<ProductFrameId>(() =>
    normalizeProductFrame(product?.imageFrame),
  );
  const [description, setDescription] = useState<RichDoc>(
    () =>
      parseRichDoc(product?.descriptionRich) ??
      richDocFromPlainText(product?.description ?? ""),
  );
  // Compteur pour les clés des lignes ajoutées à la volée.
  const uid = useRef(0);
  const nextKey = () => `new-${uid.current++}`;
  const [images, setImages] = useState<ImageDraft[]>(() => {
    const rows: ImageDraft[] = (initialImages ?? []).map((i) => ({
      key: i.id,
      id: i.id,
      path: i.path,
      bgColor: i.bgColor,
      alt: i.alt,
      sizeKey: i.sizeId,
      colorKey: i.colorId,
    }));
    const known = new Set(rows.map((r) => r.path));
    if (product?.imagePath && !known.has(product.imagePath)) {
      rows.unshift({
        key: "cover",
        path: product.imagePath,
        bgColor: product.imageBgColor,
        alt: null,
        sizeKey: null,
        colorKey: null,
      });
      known.add(product.imagePath);
    }
    for (const c of initialColors ?? []) {
      if (c.imagePath && !known.has(c.imagePath)) {
        rows.push({
          key: `color-${c.id}`,
          path: c.imagePath,
          bgColor: c.imageBgColor,
          alt: null,
          sizeKey: null,
          colorKey: c.id,
        });
        known.add(c.imagePath);
      }
    }
    return rows;
  });
  const [sizes, setSizes] = useState<SizeDraft[]>(
    (initialSizes ?? []).map((s) => ({
      key: s.id,
      id: s.id,
      label: s.label,
      price: centsToPrice(s.priceCents),
      active: s.active,
    })),
  );
  const [colors, setColors] = useState<ColorDraft[]>(
    (initialColors ?? []).map((c) => ({
      key: c.id,
      id: c.id,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
      active: c.active,
    })),
  );

  const defaultPrice =
    product != null ? centsToPrice(product.priceCents) : "";

  function updateSize(i: number, patch: Partial<SizeDraft>) {
    setSizes((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function updateColor(i: number, patch: Partial<ColorDraft>) {
    setColors((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">Nom</span>
        <input
          name="name"
          defaultValue={product?.name}
          required
          className={inputCls}
          placeholder="rivage"
        />
        <FieldErrors errors={state?.errors?.name} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">Description</span>
        <RichEditor value={description} onChange={setDescription} />
        <FieldErrors errors={state?.errors?.description} />
      </div>

      <ImageGallery
        images={images}
        sizes={sizes.map((s) => ({ key: s.key, label: s.label }))}
        colors={colors.map((c) => ({ key: c.key, label: c.label }))}
        onChange={setImages}
        nextKey={nextKey}
        frame={frame}
        onFrameChange={setFrame}
      />
      <FieldErrors errors={state?.errors?.images} />
      <FieldErrors errors={state?.errors?.imageFrame} />

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Prix de base (€)
          </span>
          <input
            name="price"
            defaultValue={defaultPrice}
            required
            inputMode="decimal"
            className={inputCls}
            placeholder="48"
          />
          <FieldErrors errors={state?.errors?.price} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Catégorie</span>
          <select
            name="category"
            defaultValue={product?.category ?? "frais"}
            className={inputCls}
          >
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <FieldErrors errors={state?.errors?.category} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Illustration
          </span>
          <select
            name="illustrationVariant"
            value={variant}
            onChange={(e) => setVariant(Number(e.target.value))}
            className={inputCls}
          >
            {Object.entries(VARIANT_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <FieldErrors errors={state?.errors?.illustrationVariant} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Badge <span className="font-normal text-muted">(option)</span>
          </span>
          <input
            name="badge"
            defaultValue={product?.badge ?? ""}
            className={inputCls}
            placeholder="Saison"
          />
          <FieldErrors errors={state?.errors?.badge} />
        </label>
      </div>

      {/* ── Tailles (la taille porte le prix) ─────────────────────── */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-stone-700">
          Tailles{" "}
          <span className="font-normal text-muted">
            (optionnel — chaque taille a son prix)
          </span>
        </legend>
        {sizes.map((s, i) => (
          <div key={s.key} className="flex items-end gap-2" data-testid={`size-row-${i}`}>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted">Libellé</span>
              <input
                aria-label={`Libellé taille ${i + 1}`}
                value={s.label}
                onChange={(e) => updateSize(i, { label: e.target.value })}
                className={inputCls}
                placeholder="Moyen"
              />
            </label>
            <label className="flex w-28 flex-col gap-1">
              <span className="text-xs text-muted">Prix (€)</span>
              <input
                aria-label={`Prix taille ${i + 1}`}
                value={s.price}
                inputMode="decimal"
                onChange={(e) => updateSize(i, { price: e.target.value })}
                className={inputCls}
                placeholder="48"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={s.active}
                onChange={(e) => updateSize(i, { active: e.target.checked })}
                className="size-5 accent-wine focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              Active
            </label>
            <button
              type="button"
              onClick={() => setSizes((l) => l.filter((_, j) => j !== i))}
              className="inline-flex size-9 items-center justify-center rounded-md text-sm text-danger transition hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
              aria-label={`Supprimer la taille ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setSizes((l) => [
              ...l,
              { key: nextKey(), label: "", price: "", active: true },
            ])
          }
          className="self-start rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
        >
          + Ajouter une taille
        </button>
        <FieldErrors errors={state?.errors?.sizes} />
      </fieldset>

      {/* ── Coloris (cosmétique : change l'illustration) ──────────── */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-stone-700">
          Coloris{" "}
          <span className="font-normal text-muted">
            (optionnel — même prix ; rattachez ses photos dans le bloc ci-dessus)
          </span>
        </legend>
        {colors.map((c, i) => (
          <div key={c.key} className="flex items-end gap-2" data-testid={`color-row-${i}`}>
            <div
              className="mb-1 size-10 shrink-0 text-wine [&_svg]:h-full [&_svg]:w-full"
              aria-hidden
            >
              <Bouquet variant={c.illustrationVariant} />
            </div>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted">Libellé</span>
              <input
                aria-label={`Libellé coloris ${i + 1}`}
                value={c.label}
                onChange={(e) => updateColor(i, { label: e.target.value })}
                className={inputCls}
                placeholder="Pastel"
              />
            </label>
            <label className="flex w-36 flex-col gap-1">
              <span className="text-xs text-muted">Illustration</span>
              <select
                aria-label={`Illustration coloris ${i + 1}`}
                value={c.illustrationVariant}
                onChange={(e) =>
                  updateColor(i, { illustrationVariant: Number(e.target.value) })
                }
                className={inputCls}
              >
                {Object.entries(VARIANT_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={c.active}
                onChange={(e) => updateColor(i, { active: e.target.checked })}
                className="size-5 accent-wine focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              Actif
            </label>
            <button
              type="button"
              onClick={() => setColors((l) => l.filter((_, j) => j !== i))}
              className="inline-flex size-9 items-center justify-center rounded-md text-sm text-danger transition hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
              aria-label={`Supprimer le coloris ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setColors((l) => [
              ...l,
              { key: nextKey(), label: "", illustrationVariant: 0, active: true },
            ])
          }
          className="self-start rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
        >
          + Ajouter un coloris
        </button>
        <FieldErrors errors={state?.errors?.colors} />
      </fieldset>

      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product?.active ?? true}
          className="size-5 accent-wine focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <span className="text-sm font-medium text-stone-700">
          Visible en boutique
        </span>
      </label>

      {/* Description, variantes et photos sérialisées (parsées et validées
          côté serveur). */}
      <input type="hidden" name="descriptionRich" value={JSON.stringify(description)} />
      <input type="hidden" name="sizes" value={JSON.stringify(sizes)} />
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />
      <input type="hidden" name="images" value={JSON.stringify(images)} />

      {state?.message && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.message}
        </p>
      )}

      <div>
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
