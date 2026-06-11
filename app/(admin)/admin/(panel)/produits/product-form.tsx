"use client";

import { useActionState, useState } from "react";
import { CATEGORY_LABELS, VARIANT_LABELS } from "@/lib/categories";
import type { ProductCategory, ProductRow } from "@/lib/db/schema";
import { Bouquet } from "@/components/illustrations";
import type { ProductFormState } from "./actions";

type Props = {
  action: (
    prev: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;
  product?: ProductRow;
  submitLabel: string;
};

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

export function ProductForm({ action, product, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    undefined,
  );
  const [variant, setVariant] = useState(product?.illustrationVariant ?? 0);

  const defaultPrice =
    product != null
      ? (product.priceCents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "")
      : "";

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
          <span className="text-sm font-medium text-stone-700">Prix (€)</span>
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
