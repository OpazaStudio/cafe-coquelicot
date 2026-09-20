import { definePage, f, type ContentOf } from "../fields";

export const PANIER_DEF = definePage({
  label: "Panier",
  previewPath: "/panier",
  revalidate: ["/panier"],
  sections: {
    hero: {
      title: "En-tête",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
      },
    },
    empty: {
      title: "Panier vide",
      fields: {
        text: f.text({ label: "Message", max: 200 }),
        cta: f.text({ label: "Texte du bouton", required: true, max: 60, hint: "Le bouton mène toujours à la boutique." }),
      },
    },
    summary: {
      title: "Récapitulatif",
      fields: {
        note: f.textarea({ label: "Note sous le sous-total", rows: 2, max: 300 }),
        cta: f.text({ label: "Bouton « commander »", required: true, max: 40 }),
        continue: f.text({ label: "Lien « continuer »", required: true, max: 60 }),
      },
    },
    vases: {
      title: "Suggestion de vases",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        lead: f.text({ label: "Texte", max: 200 }),
      },
    },
  },
});

export type PanierContent = ContentOf<typeof PANIER_DEF>;

export const DEFAULT_PANIER: PanierContent = {
  hero: { title: "votre panier", script: "prêt à fleurir ?" },
  empty: { text: "Votre panier est vide pour l'instant.", cta: "Découvrir la boutique" },
  summary: {
    note: "Livraison en point relais Mondial Relay ou à domicile par Colissimo — frais affichés à l'étape suivante.",
    cta: "Commander",
    continue: "Continuer mes achats",
  },
  vases: { title: "Et pourquoi pas un vase ?", lead: "Faits main, à offrir ou pour vos prochains bouquets." },
};
