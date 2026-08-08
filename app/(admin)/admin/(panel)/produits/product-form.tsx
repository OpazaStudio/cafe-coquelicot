"use client";

import { useActionState, useRef, useState } from "react";
import { CATEGORY_LABELS, VARIANT_LABELS } from "@/lib/categories";
import type {
  ProductCategory,
  ProductColorRow,
  ProductRow,
  ProductSizeRow,
} from "@/lib/db/schema";
import { Bouquet } from "@/components/illustrations";
import { btnPrimary } from "../ui";
import type { ProductFormState } from "./actions";
import { ImageUpload } from "./image-upload";

type Props = {
  action: (
    prev: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;
  product?: ProductRow;
  sizes?: ProductSizeRow[];
  colors?: ProductColorRow[];
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
  imagePath: string | null;
  imageBgColor: string | null;
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
  submitLabel,
}: Props) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    undefined,
  );
  const [variant, setVariant] = useState(product?.illustrationVariant ?? 0);
  const [productImage, setProductImage] = useState<{
    imagePath: string | null;
    imageBgColor: string | null;
  }>({
    imagePath: product?.imagePath ?? null,
    imageBgColor: product?.imageBgColor ?? null,
  });
  // Compteur pour les clés des lignes ajoutées à la volée.
  const uid = useRef(0);
  const nextKey = () => `new-${uid.current++}`;
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
      imagePath: c.imagePath,
      imageBgColor: c.imageBgColor,
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
      <div className="grid grid-cols-[1fr_auto] gap-6">
        <div className="flex flex-col gap-5">
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

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">
              Sous-titre
            </span>
            <input
              name="tag"
              defaultValue={product?.tag}
              required
              className={inputCls}
              placeholder="Bouquet signature"
            />
            <FieldErrors errors={state?.errors?.tag} />
          </label>
        </div>

        <div className="flex w-36 flex-col items-center gap-2 rounded-xl border border-line bg-panel p-3">
          <ImageUpload
            value={productImage.imagePath}
            bgColor={productImage.imageBgColor}
            onChange={setProductImage}
            fallback={<Bouquet variant={variant} />}
            label="Image du produit"
          />
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">Description</span>
        <textarea
          name="description"
          defaultValue={product?.description}
          required
          rows={2}
          className={inputCls}
          placeholder="Pivoines, eucalyptus, blé, ruban lin."
        />
        <FieldErrors errors={state?.errors?.description} />
      </label>

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
            (optionnel — même prix, illustration différente)
          </span>
        </legend>
        {colors.map((c, i) => (
          <div key={c.key} className="flex items-end gap-2" data-testid={`color-row-${i}`}>
            <div className="shrink-0 text-wine">
              <ImageUpload
                value={c.imagePath}
                bgColor={c.imageBgColor}
                onChange={(v) => updateColor(i, v)}
                fallback={<Bouquet variant={c.illustrationVariant} />}
                size="sm"
              />
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
              { key: nextKey(), label: "", illustrationVariant: 0, imagePath: null, imageBgColor: null, active: true },
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

      <input type="hidden" name="imagePath" value={productImage.imagePath ?? ""} />
      <input type="hidden" name="imageBgColor" value={productImage.imageBgColor ?? ""} />

      {/* Variantes sérialisées (parsées et validées côté serveur). */}
      <input type="hidden" name="sizes" value={JSON.stringify(sizes)} />
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />

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
