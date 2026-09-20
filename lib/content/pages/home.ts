import { definePage, f, type ContentOf } from "../fields";

const link = (label: string, hint?: string) =>
  f.group({
    label,
    hint,
    fields: {
      label: f.text({ label: "Texte", required: true, max: 60 }),
      href: f.text({ label: "Lien", required: true, href: true, hint: "Ex. /boutique, #prestations ou https://…" }),
    },
  });

export const PRESTATION_ICONS = [
  { value: "mariage", label: "Alliance (mariages)" },
  { value: "evenement", label: "Confettis (événementiel)" },
  { value: "abonnement", label: "Calendrier (abonnement)" },
  { value: "atelier", label: "Ciseaux (ateliers)" },
  { value: "entreprise", label: "Immeuble (entreprises)" },
  { value: "livraison", label: "Vélo (livraison)" },
] as const;

export const HOME_DEF = definePage({
  label: "Accueil",
  previewPath: "/",
  revalidate: ["/"],
  sections: {
    hero: {
      title: "Bandeau d'accueil",
      fields: {
        title: f.textarea({ label: "Titre", required: true, rows: 2, max: 60, hint: "Un saut de ligne = une ligne du titre." }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        sub: f.textarea({ label: "Texte d'accroche", rows: 3, max: 400 }),
        primary: link("Bouton principal"),
        secondary: link("Bouton secondaire"),
        image: f.image({ label: "Photo du bandeau", hint: "Sans photo, l'illustration de la devanture reste affichée. Format paysage conseillé." }),
      },
    },
    shop: {
      title: "Bloc boutique",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 60 }),
        after: f.text({ label: "Fin du titre", max: 60, hint: "Affichée juste après la partie manuscrite." }),
        eyebrow: f.text({ label: "Surtitre", max: 60 }),
        body: f.textarea({ label: "Texte", rows: 3, max: 400 }),
        link: f.text({ label: "Texte du lien", max: 60 }),
        cta: f.text({ label: "Texte du bouton", max: 60 }),
      },
    },
    gallery: {
      title: "Galerie",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        sub: f.textarea({ label: "Texte", rows: 3, max: 400 }),
        tiles: f.list({
          label: "Tuiles",
          labels: { singular: "tuile", plural: "tuiles" },
          min: 8,
          max: 8,
          fixed: true,
          hint: "Huit tuiles, dans l'ordre de la grille. Une tuile « Photo » sans photo garde son illustration.",
          fields: {
            kind: f.select({ label: "Type", options: [{ value: "photo", label: "Photo" }, { value: "mot", label: "Mot" }] }),
            image: f.image({ label: "Photo" }),
            label: f.text({ label: "Mot", max: 40 }),
            script: f.text({ label: "Mot manuscrit", max: 20 }),
          },
        }),
        cta: link("Lien sous la galerie"),
      },
    },
    prestations: {
      title: "Prestations",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        intro: f.textarea({ label: "Introduction", rows: 6, max: 1500, paragraphs: true }),
        items: f.list({
          label: "Cartes",
          labels: { singular: "carte", plural: "cartes" },
          min: 1,
          max: 6,
          fields: {
            icon: f.select({ label: "Icône", options: PRESTATION_ICONS }),
            name: f.text({ label: "Nom", required: true, max: 40 }),
            desc: f.textarea({ label: "Description", rows: 3, max: 300 }),
            price: f.text({ label: "Prix", max: 40 }),
          },
        }),
      },
    },
    atelier: {
      title: "Citation",
      fields: {
        quote: f.textarea({ label: "Citation", rows: 2, max: 200, hint: "Un saut de ligne = une ligne." }),
        script: f.text({ label: "Fin manuscrite", max: 80 }),
        author: f.text({ label: "Signature", max: 40 }),
      },
    },
    about: {
      title: "À propos",
      fields: {
        sticker: f.text({ label: "Pastille", max: 30 }),
        image: f.image({ label: "Photo", hint: "Format portrait (4/5). Sans photo, l'illustration reste." }),
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        lede: f.textarea({ label: "Paragraphes mis en avant", rows: 5, max: 1000, paragraphs: true }),
        body: f.textarea({ label: "Texte", rows: 5, max: 1500, paragraphs: true }),
      },
    },
    contact: {
      title: "Contact",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        sub: f.textarea({ label: "Texte", rows: 3, max: 400 }),
      },
    },
  },
});

export type HomeContent = ContentOf<typeof HOME_DEF>;

const noImage = { path: null, alt: "" };

export const DEFAULT_HOME: HomeContent = {
  hero: {
    title: "Café\nCoquelicot",
    script: "fleurs fraîches & séchées",
    sub: "Un atelier pensé pour celles & ceux qui veulent offrir (ou s'offrir) un bouquet qui raconte quelque chose. Brut, sincère, jamais convenu.",
    primary: { label: "Voir la boutique", href: "/boutique" },
    secondary: { label: "Nos prestations", href: "#prestations" },
    image: noImage,
  },
  shop: {
    title: "Nos bouquets,",
    script: "savamment",
    after: "composés",
    eyebrow: "Collection du moment",
    body: "Une collection permanente, ponctuée de créations éphémères au gré des saisons et des arrivages.",
    link: "Toute la boutique",
    cta: "Voir toute la boutique",
  },
  gallery: {
    title: "On aime",
    script: "le beau et le sincère.",
    sub: "Pas de fleurs hors-saison, pas de transport aérien, pas de mousse Oasis. Juste ce que la terre veut bien nous donner et qu'on assemble avec soin.",
    tiles: [
      { kind: "photo", image: noImage, label: "", script: "" },
      { kind: "mot", image: noImage, label: "tout est", script: "" },
      { kind: "photo", image: noImage, label: "", script: "" },
      { kind: "photo", image: noImage, label: "", script: "" },
      { kind: "mot", image: noImage, label: "de saison", script: "✿" },
      { kind: "photo", image: noImage, label: "", script: "" },
      { kind: "photo", image: noImage, label: "", script: "" },
      { kind: "photo", image: noImage, label: "", script: "" },
    ],
    cta: { label: "Toutes nos réalisations", href: "/boutique" },
  },
  prestations: {
    title: "Prestations",
    script: "sur mesure",
    intro:
      "Au-delà du bouquet quotidien, nous imaginons des créations florales pour chaque moment de vie.\n\nUne attention délicate, une table à fleurir, un dîner à mettre en scène, une réception à habiller ou des mariés à accompagner.\n\nDes compositions sur-mesures, fraîches ou séchées, pensées dans les moindres détails avec la même exigence de justesse, de saisonnalité et d'élégance.",
    items: [
      { icon: "mariage", name: "mariages", desc: "Bouquet de la mariée, boutonnières, arche, décor de table, on conçoit ensemble la scénographie florale de votre jour.", price: "sur devis" },
      { icon: "evenement", name: "événementiel", desc: "Galas, vernissages, lancements, anniversaires. Installations florales sur-mesure pour transformer un lieu.", price: "sur devis" },
      { icon: "atelier", name: "ateliers", desc: "Apprenez à composer chez nous : bouquet champêtre, couronne séchée. En groupe ou en privé.", price: "sur devis" },
      { icon: "entreprise", name: "entreprises", desc: "Réception, salle de réunion, vitrine, événement client. Forfait livraison régulière ou prestation ponctuelle.", price: "sur devis" },
    ],
  },
  atelier: {
    quote: "Une fleur cueillie aujourd'hui\nvaut",
    script: "mille importées d'hier.",
    author: "— Céline",
  },
  about: {
    sticker: "depuis 2026",
    image: noImage,
    title: "Café Coquelicot",
    script: "c'est qui ?",
    lede:
      "Après l'obtention d'un CAP fleuriste, Céline a choisi de quitter son métier de cheffe de projet en biotechnologie pour donner toute sa place à sa passion des fleurs.\n\nSon ambition : Créer du beau, simplement et avec justesse.",
    body: "Pas de fioritures, pas de cellophane, pas de roses équatoriennes en plein hiver. Ici la fleur est choisie pour sa beauté, sa saisonnalité et son origine. Des fleurs fraîches locales ou européennes, des fleurs séchées et naturellement teintes, travaillées avec soin.",
  },
  contact: {
    title: "Dites nous",
    script: "un petit mot",
    sub: "Mariage, atelier, commande spéciale ou simple bonjour, écrivez-nous. On répond aussi vite que possible, promis.",
  },
};
