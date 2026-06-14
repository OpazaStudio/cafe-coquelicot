"use client";

import { useActionState, useState } from "react";
import { CATEGORY_LABELS, VARIANT_LABELS } from "@/lib/categories";
import type {
  ProductCategory,
  ProductColorRow,
  ProductRow,
  ProductSizeRow,
} from "@/lib/db/schema";
import { Bouquet } from "@/components/illustrations";
import type { ProductFormState } from "./actions";

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

type SizeDraft = { id?: string; label: string; price: string; active: boolean };
type ColorDraft = {
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
    <p role="alert" className="text-sm font-medium text-red-700">
      {errors[0]}
    </p>
  );
}

const inputCls =
  "rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-wine focus:ring-2 focus:ring-wine/15";

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
  const [sizes, setSizes] = useState<SizeDraft[]>(
    (initialSizes ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      price: centsToPrice(s.priceCents),
      active: s.active,
    })),
  );
  const [colors, setColors] = useState<ColorDraft[]>(
    (initialColors ?? []).map((c) => ({
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

        <div className="flex w-36 flex-col items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <span className="text-xs text-stone-500">Aperçu</span>
          <div className="h-24 w-24 text-wine [&_svg]:h-full [&_svg]:w-full">
            <Bouquet variant={variant} />
          </div>
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
            Badge <span className="font-normal text-stone-400">(option)</span>
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
      <fieldset className="flex flex-col gap-3 rounded-xl border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold text-stone-700">
          Tailles{" "}
          <span className="font-normal text-stone-400">
            (optionnel — chaque taille a son prix)
          </span>
        </legend>
        {sizes.map((s, i) => (
          <div key={i} className="flex items-end gap-2" data-testid={`size-row-${i}`}>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-stone-500">Libellé</span>
              <input
                aria-label={`Libellé taille ${i + 1}`}
                value={s.label}
                onChange={(e) => updateSize(i, { label: e.target.value })}
                className={inputCls}
                placeholder="Moyen"
              />
            </label>
            <label className="flex w-28 flex-col gap-1">
              <span className="text-xs text-stone-500">Prix (€)</span>
              <input
                aria-label={`Prix taille ${i + 1}`}
                value={s.price}
                inputMode="decimal"
                onChange={(e) => updateSize(i, { price: e.target.value })}
                className={inputCls}
                placeholder="48"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={s.active}
                onChange={(e) => updateSize(i, { active: e.target.checked })}
                className="h-4 w-4 accent-wine"
              />
              Active
            </label>
            <button
              type="button"
              onClick={() => setSizes((l) => l.filter((_, j) => j !== i))}
              className="pb-2.5 text-sm text-red-700 hover:underline"
              aria-label={`Supprimer la taille ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setSizes((l) => [...l, { label: "", price: "", active: true }])
          }
          className="self-start rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          + Ajouter une taille
        </button>
        <FieldErrors errors={state?.errors?.sizes} />
      </fieldset>

      {/* ── Coloris (cosmétique : change l'illustration) ──────────── */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-stone-200 p-4">
        <legend className="px-1 text-sm font-semibold text-stone-700">
          Coloris{" "}
          <span className="font-normal text-stone-400">
            (optionnel — même prix, illustration différente)
          </span>
        </legend>
        {colors.map((c, i) => (
          <div key={i} className="flex items-end gap-2" data-testid={`color-row-${i}`}>
            <div className="h-10 w-10 shrink-0 text-wine [&_svg]:h-full [&_svg]:w-full">
              <Bouquet variant={c.illustrationVariant} />
            </div>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-stone-500">Libellé</span>
              <input
                aria-label={`Libellé coloris ${i + 1}`}
                value={c.label}
                onChange={(e) => updateColor(i, { label: e.target.value })}
                className={inputCls}
                placeholder="Pastel"
              />
            </label>
            <label className="flex w-36 flex-col gap-1">
              <span className="text-xs text-stone-500">Illustration</span>
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
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={c.active}
                onChange={(e) => updateColor(i, { active: e.target.checked })}
                className="h-4 w-4 accent-wine"
              />
              Actif
            </label>
            <button
              type="button"
              onClick={() => setColors((l) => l.filter((_, j) => j !== i))}
              className="pb-2.5 text-sm text-red-700 hover:underline"
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
              { label: "", illustrationVariant: 0, active: true },
            ])
          }
          className="self-start rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
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
          className="h-4 w-4 accent-wine"
        />
        <span className="text-sm font-medium text-stone-700">
          Visible en boutique
        </span>
      </label>

      {/* Variantes sérialisées (parsées et validées côté serveur). */}
      <input type="hidden" name="sizes" value={JSON.stringify(sizes)} />
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />

      {state?.message && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-wine px-5 py-2.5 font-semibold text-linen transition hover:bg-wine-dark disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
