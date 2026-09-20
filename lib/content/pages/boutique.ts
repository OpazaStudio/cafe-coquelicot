import { definePage, f, type ContentOf } from "../fields";

const link = (label: string) =>
  f.group({
    label,
    fields: {
      label: f.text({ label: "Texte", required: true, max: 60 }),
      href: f.text({ label: "Lien", required: true, href: true }),
    },
  });

export const BOUTIQUE_DEF = definePage({
  label: "Boutique",
  previewPath: "/boutique",
  revalidate: ["/boutique"],
  sections: {
    meta: {
      title: "Référencement",
      hint: "Titre et description affichés par Google et lors d'un partage.",
      fields: {
        title: f.text({ label: "Titre de la page", required: true, max: 70 }),
        description: f.textarea({ label: "Description", rows: 2, max: 200 }),
      },
    },
    hero: {
      title: "En-tête",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        eyebrow: f.text({ label: "Surtitre", max: 60 }),
        intro: f.textarea({ label: "Introduction", rows: 4, max: 600, hint: "Un saut de ligne = une ligne." }),
      },
    },
    catalogue: {
      title: "Catalogue",
      fields: {
        countSuffix: f.text({ label: "Texte après le nombre de compositions", max: 100 }),
        empty: f.textarea({ label: "Message quand une catégorie est vide", rows: 3, max: 400, hint: "Un saut de ligne = une ligne." }),
      },
    },
    bespoke: {
      title: "Bloc « sur mesure »",
      fields: {
        eyebrow: f.text({ label: "Surtitre", max: 60 }),
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 60 }),
        sub: f.textarea({ label: "Texte", rows: 3, max: 400 }),
        primary: link("Bouton principal"),
        secondary: link("Bouton secondaire"),
      },
    },
  },
});

export type BoutiqueContent = ContentOf<typeof BOUTIQUE_DEF>;

export const DEFAULT_BOUTIQUE: BoutiqueContent = {
  meta: {
    title: "La boutique",
    description: "Bouquets frais & séchés et compositions. La boutique en ligne de l'atelier Coquelicot, cueilli le matin même à La Rochelle.",
  },
  hero: {
    title: "la boutique",
    eyebrow: "Collection du moment",
    intro: "Une collection permanente, ponctuée de créations éphémères au gré des saisons et des arrivages.\nFleurs fraîches en livraison sur Salon-de-Provence et ses environs.\nFleurs séchées livrées partout en France.",
  },
  catalogue: {
    countSuffix: "cueillies ou réceptionnées le matin même",
    empty: "Aucune composition dans cette catégorie pour le moment. Ne partez pas trop loin, on vous prépare plein de belles surprises !\nRestez informé sur notre Instagram.",
  },
  bespoke: {
    eyebrow: "Une envie particulière ?",
    title: "On compose aussi",
    script: "sur mesure.",
    sub: "Mariage, événement, cadeau d'entreprise ou simple coup de cœur, dites-nous ce que vous imaginez, on s'occupe du reste.",
    primary: { label: "Voir nos prestations", href: "/#prestations" },
    secondary: { label: "Nous écrire", href: "/#contact" },
  },
};
