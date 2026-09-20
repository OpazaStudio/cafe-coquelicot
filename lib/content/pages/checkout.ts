import { definePage, f, type ContentOf } from "../fields";

export const CHECKOUT_DEF = definePage({
  label: "Commander",
  previewPath: "/checkout",
  revalidate: ["/checkout"],
  sections: {
    hero: {
      title: "En-tête",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
      },
    },
  },
});

export type CheckoutContent = ContentOf<typeof CHECKOUT_DEF>;

export const DEFAULT_CHECKOUT: CheckoutContent = {
  hero: { title: "commander", script: "encore un instant…" },
};
