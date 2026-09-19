import { describe, expect, it } from "vitest";
import { CheckoutSchema, rawCheckoutValues, toCustomerInput } from "@/app/checkout/schema";

const base = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  phone: "06 12 34 56 78",
  deliveryDate: "",
  cardMessage: "",
};

const relay = {
  ...base,
  fulfillment: "mondial_relay",
  relayPointId: "012345",
  relayPointName: "Tabac de la Gare",
  relayStreet: "1 rue des Lilas",
  relayPostalCode: "17000",
  relayCity: "La Rochelle",
  relayCountry: "FR",
};

const colissimo = {
  ...base,
  fulfillment: "poste",
  address: "3 quai Valin",
  postalCode: "17000",
  city: "La Rochelle",
};

function firstError(input: unknown): string {
  const r = CheckoutSchema.safeParse(input);
  return r.success ? "" : (r.error.issues[0]?.message ?? "?");
}

describe("CheckoutSchema — Mondial Relay", () => {
  it("accepte un point relais français complet", () => {
    expect(CheckoutSchema.safeParse(relay).success).toBe(true);
  });

  it("refuse sans point relais", () => {
    expect(firstError({ ...relay, relayPointId: "" })).toBe("Choisissez un point relais.");
  });

  it("refuse un relais hors France", () => {
    expect(firstError({ ...relay, relayCountry: "BE" })).toBe("Mondial Relay : France uniquement.");
  });
});

describe("CheckoutSchema — Colissimo", () => {
  it("accepte une adresse en France métropolitaine, Corse comprise", () => {
    expect(CheckoutSchema.safeParse(colissimo).success).toBe(true);
    expect(CheckoutSchema.safeParse({ ...colissimo, postalCode: "20000" }).success).toBe(true);
    expect(CheckoutSchema.safeParse({ ...colissimo, postalCode: " 75001 " }).success).toBe(true);
  });

  it("refuse les DOM-TOM et les codes postaux mal formés", () => {
    expect(firstError({ ...colissimo, postalCode: "97400" })).toBe("Colissimo : France métropolitaine uniquement.");
    expect(firstError({ ...colissimo, postalCode: "98000" })).toBe("Colissimo : France métropolitaine uniquement.");
    expect(firstError({ ...colissimo, postalCode: "1234" })).toBe("Code postal invalide.");
    expect(firstError({ ...colissimo, postalCode: "17 000" })).toBe("Code postal invalide.");
  });

  it("refuse sans adresse ou sans ville", () => {
    expect(firstError({ ...colissimo, address: "" })).toBe("Votre adresse est requise.");
    expect(firstError({ ...colissimo, city: "  " })).toBe("Votre ville est requise.");
  });

  it("ignore les champs relais résiduels envoyés avec un mode Colissimo", () => {
    const r = CheckoutSchema.safeParse({ ...colissimo, relayPointId: "012345" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect("relayPointId" in r.data).toBe(false);
  });
});

describe("CheckoutSchema — commun", () => {
  it("exige un téléphone dans les deux modes", () => {
    expect(firstError({ ...relay, phone: "" })).toBe("Téléphone requis (suivi de livraison).");
    expect(firstError({ ...colissimo, phone: "" })).toBe("Téléphone requis (suivi de livraison).");
  });

  it("refuse un mode inconnu", () => {
    expect(CheckoutSchema.safeParse({ ...base, fulfillment: "retrait" }).success).toBe(false);
  });
});

describe("rawCheckoutValues / toCustomerInput", () => {
  it("lit tous les champs du formulaire en chaînes", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(colissimo)) fd.set(k, v);
    const raw = rawCheckoutValues(fd);
    expect(raw.fulfillment).toBe("poste");
    expect(raw.address).toBe("3 quai Valin");
    expect(raw.relayPointId).toBe("");
    expect(raw.deliveryDate).toBe("");
  });

  it("mappe Colissimo vers l'adresse client, pays FR", () => {
    const parsed = CheckoutSchema.parse(colissimo);
    expect(toCustomerInput(parsed)).toEqual({
      name: "Camille Martin",
      email: "camille@exemple.fr",
      phone: "06 12 34 56 78",
      fulfillment: "poste",
      shippingAddress: "3 quai Valin",
      shippingPostalCode: "17000",
      shippingCity: "La Rochelle",
      shippingCountry: "FR",
      deliveryDate: undefined,
      cardMessage: "",
    });
  });

  it("mappe Mondial Relay vers les champs relais", () => {
    const parsed = CheckoutSchema.parse({ ...relay, deliveryDate: "2026-10-01" });
    expect(toCustomerInput(parsed)).toEqual({
      name: "Camille Martin",
      email: "camille@exemple.fr",
      phone: "06 12 34 56 78",
      fulfillment: "mondial_relay",
      relayPointId: "012345",
      relayPointName: "Tabac de la Gare",
      relayStreet: "1 rue des Lilas",
      relayPostalCode: "17000",
      relayCity: "La Rochelle",
      deliveryDate: "2026-10-01",
      cardMessage: "",
    });
  });
});
