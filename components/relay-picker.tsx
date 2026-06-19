"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export type RelaySelection = {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
};

// Le widget Mondial Relay est un plugin jQuery ; il étend `$.fn`.
type MRParcelShopPickerFn = (opts: Record<string, unknown>) => void;
interface MRJQueryObject {
  MR_ParcelShopPicker: MRParcelShopPickerFn;
}
interface MRJQueryStatic {
  (selector: string): MRJQueryObject;
  fn?: { MR_ParcelShopPicker?: MRParcelShopPickerFn };
}
declare global {
  interface Window {
    jQuery?: MRJQueryStatic;
  }
}

const BRAND = process.env.NEXT_PUBLIC_MONDIAL_RELAY_BRAND ?? "BDTEST";

// Ordre de chargement imposé par Mondial Relay : jQuery d'abord, puis le plugin
// (qui enregistre $.fn.MR_ParcelShopPicker). Cf. doc officielle.
// Mode liste (pas de carte) : on n'embarque pas Leaflet — plus robuste pour un
// widget de checkout (la carte interne déclenche des erreurs d'init Leaflet).
const JQUERY_SRC = "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js";
const MR_PLUGIN_SRC =
  "https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js";

/** Charge un script <src> une seule fois ; résout quand il est exécuté. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error(`Échec de chargement : ${src}`)),
        );
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false; // préserve l'ordre relatif
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () =>
      reject(new Error(`Échec de chargement : ${src}`)),
    );
    document.head.appendChild(script);
  });
}

export function RelayPicker({
  value,
  onSelect,
}: {
  value: RelaySelection | null;
  onSelect: (s: RelaySelection) => void;
}) {
  const ready = useRef(false);
  // Toujours pointer le dernier onSelect pour que le callback du widget
  // n'appelle jamais une closure périmée.
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      // Séquentiel : le plugin a besoin de jQuery déjà présent à son exécution.
      await loadScript(JQUERY_SRC);
      await loadScript(MR_PLUGIN_SRC);
      if (cancelled || ready.current) return;

      const $ = window.jQuery;
      if (!$ || typeof $.fn?.MR_ParcelShopPicker !== "function") return;
      ready.current = true;

      $("#mr-widget").MR_ParcelShopPicker({
        Target: "#mr-relay-id",
        Brand: BRAND,
        Country: "FR",
        AllowedCountries: "FR",
        ShowResultsOnMap: false,
        Responsive: true,
        OnParcelShopSelected: (data: Record<string, string>) => {
          onSelectRef.current({
            id: data.ID,
            name: data.Nom ?? data.name ?? "",
            street: data.Adresse1 ?? data.Adresse ?? "",
            postalCode: data.CP ?? "",
            city: data.Ville ?? "",
          });
        },
      });
    }

    setup().catch((err) =>
      console.error("[relay-picker] chargement du widget Mondial Relay échoué", err),
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relay-picker">
      <div id="mr-widget" style={{ minHeight: 420 }} />
      {/* Cible interne du widget (id du point relais) — NON soumise avec le
          formulaire. Les données du relais transitent par onSelect → état parent
          → les champs cachés nommés du formulaire. */}
      <input type="hidden" id="mr-relay-id" />
      {value && (
        <p className="relay-picker__selected" data-testid="relay-selected">
          Point relais : <strong>{value.name}</strong> — {value.street},{" "}
          {value.postalCode} {value.city}
        </p>
      )}
    </div>
  );
}
