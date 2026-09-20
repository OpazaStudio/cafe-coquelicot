import { definePage, f, type ContentOf } from "../fields";

export const CONFIRMATION_DEF = definePage({
  label: "Confirmation de commande",
  previewPath: "/commande/confirmee",
  revalidate: ["/commande/confirmee"],
  sections: {
    paid: {
      title: "Commande payée",
      hint: "Jetons disponibles : {{numero}}, {{email}}, {{adresse}}.",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        orderLine: f.text({ label: "Ligne de commande", required: true, max: 100, hint: "{{numero}} = numéro de commande." }),
        emailNote: f.text({ label: "Phrase sur l'e-mail", max: 200, hint: "{{email}} = adresse du client." }),
        noteColissimo: f.text({ label: "Suite pour une livraison Colissimo", max: 200 }),
        noteRelay: f.text({ label: "Suite pour un point relais", max: 200 }),
        notePickup: f.text({ label: "Suite pour un retrait à l'atelier", max: 200, hint: "{{adresse}} = adresse de l'atelier (Paramètres)." }),
      },
    },
    pending: {
      title: "Paiement en cours",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        text: f.textarea({ label: "Texte", rows: 2, max: 300, hint: "{{numero}} = numéro de commande." }),
      },
    },
    notFound: {
      title: "Commande introuvable",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 80 }),
        script: f.text({ label: "Partie manuscrite", max: 80 }),
        text: f.textarea({ label: "Texte", rows: 2, max: 300, hint: "{{contact}} = e-mail de contact (Paramètres)." }),
      },
    },
    back: {
      title: "Retour",
      fields: {
        label: f.text({ label: "Texte du lien vers la boutique", required: true, max: 60 }),
      },
    },
  },
});

export type ConfirmationContent = ContentOf<typeof CONFIRMATION_DEF>;

export const DEFAULT_CONFIRMATION: ConfirmationContent = {
  paid: {
    title: "merci !",
    script: "c'est commandé.",
    orderLine: "Commande {{numero}} — payée",
    emailNote: "Un email de confirmation Stripe a été envoyé à {{email}}.",
    noteColissimo: "Votre commande partira par Colissimo à votre domicile très vite.",
    noteRelay: "Votre commande partira en point relais Mondial Relay très vite.",
    notePickup: "Votre commande vous attendra à l'atelier, {{adresse}}.",
  },
  pending: {
    title: "un instant",
    script: "paiement en cours…",
    text: "Le paiement de la commande {{numero}} est en cours de validation. Rechargez cette page dans un instant.",
  },
  notFound: {
    title: "hmm…",
    script: "commande introuvable",
    text: "Nous ne retrouvons pas cette commande. Si vous avez été débité·e, écrivez-nous : {{contact}}.",
  },
  back: { label: "Retour à la boutique" },
};
