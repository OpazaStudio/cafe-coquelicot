// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import {
  DEFAULT_SETTINGS,
  SETTING_FIELDS,
  parseSettings,
  querySettings,
  readSettingsForm,
  saveSettings,
  shippingFeesFromSettings,
  type SettingKey,
} from "@/lib/settings";

describe("parseSettings", () => {
  it("renvoie les valeurs par défaut quand la table est vide", () => {
    const s = parseSettings([]);
    expect(s.host_name).toBe("Vercel Inc.");
    expect(s.legal_name).toBe("Café Coquelicot");
    expect(s.siret).toBe("");
  });

  it("superpose les lignes connues et ignore les clés inconnues", () => {
    const s = parseSettings([
      { key: "siret", value: "123 456 789 00012" },
      { key: "inconnue", value: "x" },
    ]);
    expect(s.siret).toBe("123 456 789 00012");
    expect((s as Record<string, string>).inconnue).toBeUndefined();
  });

  it("chaque champ déclaré a une valeur par défaut", () => {
    for (const f of SETTING_FIELDS) {
      expect(typeof DEFAULT_SETTINGS[f.key]).toBe("string");
    }
  });
});

describe("readSettingsForm", () => {
  function form(entries: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return fd;
  }

  it("rogne les espaces et convertit les champs absents en chaîne vide", () => {
    const r = readSettingsForm(form({ siret: "  123  " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.siret).toBe("123");
    expect(r.data.vat_number).toBe("");
  });

  it("refuse une valeur trop longue", () => {
    const r = readSettingsForm(form({ siret: "x".repeat(501) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/SIRET/);
  });

  it("refuse une URL de médiateur qui n'est pas http(s)", () => {
    const r = readSettingsForm(form({ mediator_website: "javascript:alert(1)" }));
    expect(r.ok).toBe(false);
  });

  it("accepte une URL de médiateur http(s)", () => {
    const r = readSettingsForm(form({ mediator_website: "https://www.mediateur.fr" }));
    expect(r.ok).toBe(true);
  });

  it("accepte un frais de livraison à la française ou vide", () => {
    expect(readSettingsForm(form({ shipping_fee_colissimo: "7,90" })).ok).toBe(true);
    expect(readSettingsForm(form({ shipping_fee_colissimo: "7.9" })).ok).toBe(true);
    expect(readSettingsForm(form({ shipping_fee_colissimo: "" })).ok).toBe(true);
  });

  it("refuse un frais de livraison qui n'est pas un montant", () => {
    for (const bad of ["abc", "7,999", "-1", "1 000"]) {
      const r = readSettingsForm(form({ shipping_fee_mondial_relay: bad }));
      expect(r.ok, bad).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatch(/Frais Mondial Relay/);
    }
  });
});

describe("saveSettings / querySettings (PGlite)", () => {
  it("insère puis met à jour (upsert) et relit avec les défauts", async () => {
    const db = await createTestDb({ seed: false });
    expect((await querySettings(db)).siret).toBe("");

    await saveSettings(db, { siret: "111", legal_name: "Coquelicot SARL" });
    let s = await querySettings(db);
    expect(s.siret).toBe("111");
    expect(s.legal_name).toBe("Coquelicot SARL");
    expect(s.host_name).toBe("Vercel Inc.");

    await saveSettings(db, { siret: "222" });
    s = await querySettings(db);
    expect(s.siret).toBe("222");
    expect(s.legal_name).toBe("Coquelicot SARL");
  });

  it("une chaîne vide enregistrée redonne la valeur par défaut du champ", async () => {
    const db = await createTestDb({ seed: false });
    await saveSettings(db, { host_name: "" });
    const s = await querySettings(db);
    expect(s.host_name).toBe("Vercel Inc.");
  });

  it("n'écrit que des clés connues", async () => {
    const db = await createTestDb({ seed: false });
    await saveSettings(db, { ["bidon" as SettingKey]: "x" });
    const s = await querySettings(db);
    expect((s as Record<string, string>).bidon).toBeUndefined();
  });
});

describe("shippingFeesFromSettings", () => {
  it("renvoie les défauts quand les champs sont vides", () => {
    expect(shippingFeesFromSettings({ ...DEFAULT_SETTINGS, shipping_fee_mondial_relay: "", shipping_fee_colissimo: "" }))
      .toEqual({ mondialRelay: 490, colissimo: 790 });
  });

  it("les défauts eux-mêmes valent 4,90 et 7,90", () => {
    expect(DEFAULT_SETTINGS.shipping_fee_mondial_relay).toBe("4,90");
    expect(DEFAULT_SETTINGS.shipping_fee_colissimo).toBe("7,90");
    expect(shippingFeesFromSettings(DEFAULT_SETTINGS)).toEqual({ mondialRelay: 490, colissimo: 790 });
  });

  it("convertit les montants saisis et replie clé par clé sur le défaut", () => {
    expect(shippingFeesFromSettings({ ...DEFAULT_SETTINGS, shipping_fee_colissimo: "9,50" }))
      .toEqual({ mondialRelay: 490, colissimo: 950 });
    expect(shippingFeesFromSettings({ ...DEFAULT_SETTINGS, shipping_fee_mondial_relay: "n/a", shipping_fee_colissimo: "0" }))
      .toEqual({ mondialRelay: 490, colissimo: 0 });
  });
});
