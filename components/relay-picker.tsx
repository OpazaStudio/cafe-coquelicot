"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

export type RelaySelection = {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
};

declare global {
  interface JQuery {
    MR_ParcelShopPicker(opts: Record<string, unknown>): void;
  }
  interface Window {
    jQuery?: (selector: string | HTMLElement) => JQuery;
  }
}

const BRAND = process.env.NEXT_PUBLIC_MONDIAL_RELAY_BRAND ?? "BDTEST";

export function RelayPicker({
  value,
  onSelect,
}: {
  value: RelaySelection | null;
  onSelect: (s: RelaySelection) => void;
}) {
  const ready = useRef(false);

  function init() {
    const $ = window.jQuery;
    if (!$ || ready.current) return;
    ready.current = true;
    $("#mr-widget").MR_ParcelShopPicker({
      Target: "#mr-relay-id",
      Brand: BRAND,
      Country: "FR",
      AllowedCountries: "FR",
      EnableGeolocalisatedSearch: true,
      OnParcelShopSelected: (data: Record<string, string>) => {
        onSelect({
          id: data.ID,
          name: data.Nom ?? data.name ?? "",
          street: data.Adresse1 ?? data.Adresse ?? "",
          postalCode: data.CP ?? "",
          city: data.Ville ?? "",
        });
      },
    });
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relay-picker">
      <Script
        src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"
        strategy="afterInteractive"
        onLoad={init}
      />
      <Script
        src="https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js"
        strategy="afterInteractive"
        onLoad={init}
      />
      <div id="mr-widget" />
      <input type="hidden" id="mr-relay-id" />
      {value && (
        <p className="relay-picker__selected" data-testid="relay-selected">
          Point relais : <strong>{value.name}</strong> — {value.street}, {value.postalCode} {value.city}
        </p>
      )}
    </div>
  );
}
