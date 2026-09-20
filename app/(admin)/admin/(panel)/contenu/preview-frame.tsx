"use client";

import { useState, type Ref } from "react";

const WIDTHS = [
  { key: "mobile", label: "Téléphone", width: 390 },
  { key: "tablet", label: "Tablette", width: 820 },
  { key: "desktop", label: "Ordinateur", width: null },
] as const;

export function PreviewFrame({
  src,
  onLoad,
  ref,
}: {
  src: string;
  onLoad: () => void;
  ref: Ref<HTMLIFrameElement>;
}) {
  const [active, setActive] = useState<(typeof WIDTHS)[number]["key"]>("desktop");
  const width = WIDTHS.find((w) => w.key === active)?.width ?? null;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Largeur de l'aperçu" className="flex gap-1">
          {WIDTHS.map((w) => (
            <button
              key={w.key}
              type="button"
              aria-pressed={active === w.key}
              onClick={() => setActive(w.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${active === w.key ? "bg-wine text-linen" : "text-ink hover:bg-hover"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <a href={src} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-muted underline">
          Ouvrir la page
        </a>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-xl border border-line bg-panel p-3">
        <iframe
          ref={ref}
          title="Aperçu de la page"
          src={src}
          onLoad={onLoad}
          style={{ width: width ? `${width}px` : "100%", maxWidth: "100%" }}
          className="h-full min-h-[70vh] rounded-lg border border-line bg-white"
        />
      </div>
    </div>
  );
}
