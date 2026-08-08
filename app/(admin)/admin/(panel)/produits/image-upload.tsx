"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { productImageUrl, validateImageFile } from "@/lib/product-image";

const UPLOAD_ENDPOINT = "/api/admin/product-image";

type Props = {
  value: string | null;
  bgColor: string | null;
  onChange: (v: { imagePath: string | null; imageBgColor: string | null }) => void;
  fallback: ReactNode;
  label?: string;
  size?: "sm" | "md";
};

export function ImageUpload({ value, bgColor, onChange, fallback, label, size = "md" }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = size === "sm" ? "h-10 w-10" : "h-24 w-24";

  async function handleFile(file: File) {
    const v = validateImageFile(file);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch(UPLOAD_ENDPOINT, { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { path?: string; error?: string }
        | null;
      if (!res.ok || !data?.path) {
        setError(data?.error ?? "Échec de l'upload.");
        return;
      }
      onChange({ imagePath: data.path, imageBgColor: bgColor });
    } catch {
      setError("Envoi impossible — vérifiez votre connexion.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <span className="text-xs text-muted">{label}</span>}
      <div
        className={`relative overflow-hidden rounded-lg border border-line ${box} [&_svg]:h-full [&_svg]:w-full`}
        style={bgColor ? { background: bgColor } : undefined}
      >
        {value ? (
          <Image src={productImageUrl(value)} alt="" fill sizes="96px" style={{ objectFit: "cover" }} />
        ) : (
          fallback
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <label className="cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-medium text-ink transition hover:bg-stone-100">
          {pending ? "Envoi…" : value ? "Remplacer" : "Ajouter une image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label="Couleur de fond"
            value={bgColor ?? "#ffffff"}
            onChange={(e) => onChange({ imagePath: value, imageBgColor: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border border-line bg-transparent p-0"
          />
          {(bgColor || value) && (
            <button
              type="button"
              onClick={() => onChange({ imagePath: null, imageBgColor: null })}
              className="text-xs text-danger hover:underline"
            >
              Retirer
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
