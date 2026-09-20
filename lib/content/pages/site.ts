import { definePage, f, type ContentOf } from "../fields";

export const SITE_DEF = definePage({
  label: "Navigation et pied de page",
  previewPath: "/",
  revalidate: [
    "/",
    "/boutique",
    "/panier",
    "/checkout",
    "/commande/confirmee",
    "/mentions-legales",
    "/cgv",
    "/livraison-retours",
    "/confidentialite",
  ],
  sections: {
    header: {
      title: "Menu de navigation",
      hint: "Les liens du haut de page, sur toutes les pages.",
      fields: {
        nav: f.list({
          label: "Liens du menu",
          labels: { singular: "lien", plural: "liens", add: "Ajouter un lien" },
          min: 1,
          max: 6,
          fields: {
            label: f.text({ label: "Texte", required: true, max: 40 }),
            href: f.text({ label: "Lien", required: true, href: true }),
          },
        }),
      },
    },
    footer: {
      title: "Pied de page",
      fields: {
        script: f.text({ label: "Mot manuscrit sous le logo", max: 60 }),
        columns: f.list({
          label: "Colonnes de liens",
          labels: { singular: "colonne", plural: "colonnes" },
          min: 3,
          max: 3,
          fixed: true,
          fields: {
            title: f.text({ label: "Titre de la colonne", required: true, max: 40 }),
            links: f.list({
              label: "Liens",
              labels: { singular: "lien", plural: "liens", add: "Ajouter un lien" },
              max: 6,
              fields: {
                label: f.text({ label: "Texte", required: true, max: 40 }),
                href: f.text({ label: "Lien", required: true, href: true }),
              },
            }),
          },
        }),
        instagram: f.text({ label: "Adresse Instagram", url: true, hint: "Vide : le lien n'apparaît pas." }),
        presse: f.text({ label: "Adresse de la page presse", url: true, hint: "Vide : le lien n'apparaît pas." }),
      },
    },
  },
});

export type SiteContent = ContentOf<typeof SITE_DEF>;

export const DEFAULT_SITE: SiteContent = {
  header: {
    nav: [
      { label: "Boutique", href: "/boutique" },
      { label: "Galerie", href: "/#gallery" },
      { label: "Prestations", href: "/#prestations" },
      { label: "À propos", href: "/#about" },
      { label: "Contact", href: "/#contact" },
    ],
  },
  footer: {
    script: "à très vite",
    columns: [
      {
        title: "Boutique",
        links: [
          { label: "Bouquets frais", href: "/boutique" },
          { label: "Bouquets séchés", href: "/boutique" },
          { label: "Compositions séchées", href: "/boutique" },
          { label: "Cartes cadeaux", href: "/boutique" },
        ],
      },
      {
        title: "Prestations",
        links: [
          { label: "Mariages", href: "/#prestations" },
          { label: "Événementiel", href: "/#prestations" },
          { label: "Abonnement", href: "/#prestations" },
          { label: "Ateliers", href: "/#prestations" },
        ],
      },
      {
        title: "Studio",
        links: [
          { label: "À propos", href: "/#about" },
          { label: "Contact", href: "/#contact" },
        ],
      },
    ],
    instagram: "",
    presse: "",
  },
};
