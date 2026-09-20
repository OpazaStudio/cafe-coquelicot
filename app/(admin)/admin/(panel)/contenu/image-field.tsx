"use client";

import { useState } from "react";
import Image from "next/image";
import type { ImageValue } from "@/lib/content/fields";
import { productImageUrl } from "@/lib/product-image";
import { uploadImageFile } from "../produits/image-upload";
import { input } from "../ui";

export function ImageField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: ImageValue;
  onChange: (v: ImageValue) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setPending(true);
    const result = await uploadImageFile(file);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onChange({ ...value, path: result.path });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="flex items-start gap-3">
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-panel">
          {value.path && (
            <Image src={productImageUrl(value.path)} alt="" fill sizes="112px" style={{ objectFit: "cover" }} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-medium text-ink transition hover:bg-hover">
            {pending ? "Envoi…" : value.path ? "Remplacer la photo" : "Ajouter une photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {value.path && (
            <button type="button" onClick={() => onChange({ ...value, path: null })} className="text-left text-xs text-danger hover:underline">
              Retirer la photo
            </button>
          )}
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      <label htmlFor={`${id}-alt`} className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">{"Description de la photo (lue par Google et les lecteurs d'écran)"}</span>
        <input id={`${id}-alt`} type="text" value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} maxLength={200} className={input} />
      </label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </fieldset>
  );
}
