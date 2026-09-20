import { describe, expect, it } from "vitest";
import {
  buildOrderAckEmail,
  buildOrderShopEmail,
  type OrderEmailContext,
  type OrderEmailItem,
  type OrderEmailOrder,
} from "@/lib/email/order";
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplates } from "@/lib/email/templates";

const CONTEXT: OrderEmailContext = {
  pickupAddress: "12 rue du Gabut, 17000 La Rochelle",
  preparationDelay: "24 à 48 h ouvrées",
  shippingDelay: "2 à 4 jours ouvrés",
  shippingDelayColissimo: "2 à 3 jours ouvrés",
};

const ITEMS: OrderEmailItem[] = [
  {
    nameSnapshot: "Bouquet Estran",
    sizeLabelSnapshot: "Moyen",
    colorLabelSnapshot: "Rose poudré",
    qty: 2,
    priceCentsSnapshot: 2400,
  },
];

const RELAY_ORDER: OrderEmailOrder = {
  number: "CQ-20260920-0001",
  customerName: "Camille",
  customerEmail: "camille@exemple.fr",
  customerPhone: "06 12 34 56 78",
  fulfillment: "mondial_relay",
  shippingAddress: "2 rue des Lilas",
  shippingPostalCode: "17000",
  shippingCity: "La Rochelle",
  shippingCountry: "FR",
  relayPointName: "Tabac du Port",
  deliveryDate: "2026-09-25",
  cardMessage: "Joyeux anniversaire !",
  subtotalCents: 4800,
  deliveryFeeCents: 490,
  cardFeeCents: 200,
  totalCents: 5490,
};

function orderWith(overrides: Partial<OrderEmailOrder>): OrderEmailOrder {
  return { ...RELAY_ORDER, ...overrides };
}

describe("buildOrderAckEmail — substitutions", () => {
  it("remplace {{nom}} et {{numero}} dans l'objet et le corps", () => {
    const templates: EmailTemplates = {
      ...DEFAULT_EMAIL_TEMPLATES,
      orderAckSubject: "Commande {{numero}} pour {{nom}}",
      orderAckBody: "Bonjour {{nom}},\n\nVotre commande {{numero}} est confirmée.",
      orderAckSignature: "L'atelier",
    };
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, templates, CONTEXT);

    expect(mail.subject).toBe("Commande CQ-20260920-0001 pour Camille");
    expect(mail.text).toContain("Bonjour Camille,");
    expect(mail.text).toContain("Votre commande CQ-20260920-0001 est confirmée.");
    expect(mail.html).toContain("Votre commande CQ-20260920-0001 est confirmée.");
    expect(mail.html).toContain("L&#39;atelier");
  });

  it("neutralise les retours à la ligne dans l'objet", () => {
    const templates: EmailTemplates = {
      ...DEFAULT_EMAIL_TEMPLATES,
      orderAckSubject: "Commande\r\nBcc: pirate@exemple.fr",
    };
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, templates, CONTEXT);
    expect(mail.subject).toBe("Commande Bcc: pirate@exemple.fr");
  });
});

describe("buildOrderAckEmail — récapitulatif", () => {
  it("liste les articles avec variante, quantité et total de ligne", () => {
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Bouquet Estran — Moyen · Rose poudré");
    expect(mail.text).toContain("× 2");
    expect(mail.text).toContain("48€");
    expect(mail.html).toContain("Bouquet Estran — Moyen · Rose poudré");
  });

  it("détaille sous-total, livraison, carte et total", () => {
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Sous-total");
    expect(mail.text).toContain("Livraison Mondial Relay — point relais");
    expect(mail.text).toContain("4,90€");
    expect(mail.text).toContain("Carte manuscrite");
    expect(mail.text).toContain("2€");
    expect(mail.text).toContain("Total");
    expect(mail.text).toContain("54,90€");
  });

  it("masque les lignes livraison et carte quand elles sont à zéro", () => {
    const order = orderWith({
      fulfillment: "retrait",
      deliveryFeeCents: 0,
      cardFeeCents: 0,
      cardMessage: null,
      totalCents: 4800,
    });
    const mail = buildOrderAckEmail(order, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).not.toContain("Carte manuscrite");
    expect(mail.text).not.toContain("Retrait à l'atelier : ");
    expect(mail.text).toContain("Sous-total : 48€\nTotal : 48€");
  });

  it("échappe le HTML des libellés d'article", () => {
    const items: OrderEmailItem[] = [
      { ...ITEMS[0], nameSnapshot: "<b>Bouquet</b>", sizeLabelSnapshot: null, colorLabelSnapshot: null },
    ];
    const mail = buildOrderAckEmail(RELAY_ORDER, items, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.html).toContain("&lt;b&gt;Bouquet&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Bouquet</b>");
  });
});

describe("buildOrderAckEmail — bloc livraison", () => {
  it("retrait : adresse de l'atelier et délai de préparation", () => {
    const order = orderWith({ fulfillment: "retrait" });
    const mail = buildOrderAckEmail(order, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Retrait à l'atelier");
    expect(mail.text).toContain("12 rue du Gabut, 17000 La Rochelle");
    expect(mail.text).toContain("24 à 48 h ouvrées");
  });

  it("mondial relay : nom du point relais, adresse et délai d'acheminement", () => {
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Tabac du Port");
    expect(mail.text).toContain("2 rue des Lilas");
    expect(mail.text).toContain("17000 La Rochelle");
    expect(mail.text).toContain("France");
    expect(mail.text).toContain("2 à 4 jours ouvrés");
  });

  it("colissimo : adresse de livraison et délai colissimo", () => {
    const order = orderWith({ fulfillment: "poste", relayPointName: null });
    const mail = buildOrderAckEmail(order, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Livraison Colissimo — à domicile");
    expect(mail.text).toContain("2 rue des Lilas");
    expect(mail.text).toContain("2 à 3 jours ouvrés");
    expect(mail.text).not.toContain("Tabac du Port");
  });

  it("omet les délais laissés vides dans les réglages", () => {
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, {
      ...CONTEXT,
      shippingDelay: "",
    });
    expect(mail.text).not.toContain("Acheminement");
  });

  it("affiche la date souhaitée au format français", () => {
    const mail = buildOrderAckEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("25/09/2026");
  });
});

describe("buildOrderShopEmail", () => {
  it("reprend les coordonnées du client et le message de carte", () => {
    const mail = buildOrderShopEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Camille");
    expect(mail.text).toContain("camille@exemple.fr");
    expect(mail.text).toContain("06 12 34 56 78");
    expect(mail.text).toContain("Joyeux anniversaire !");
    expect(mail.html).toContain("mailto:camille@exemple.fr");
  });

  it("reprend le récapitulatif et le bloc livraison", () => {
    const mail = buildOrderShopEmail(RELAY_ORDER, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).toContain("Bouquet Estran — Moyen · Rose poudré");
    expect(mail.text).toContain("54,90€");
    expect(mail.text).toContain("Tabac du Port");
  });

  it("substitue {{nom}} et {{numero}} dans l'objet", () => {
    const templates: EmailTemplates = {
      ...DEFAULT_EMAIL_TEMPLATES,
      orderShopSubject: "Commande {{numero}} — {{nom}}",
    };
    const mail = buildOrderShopEmail(RELAY_ORDER, ITEMS, templates, CONTEXT);
    expect(mail.subject).toBe("Commande CQ-20260920-0001 — Camille");
  });

  it("omet le téléphone absent sans afficher de ligne vide", () => {
    const order = orderWith({ customerPhone: null });
    const mail = buildOrderShopEmail(order, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.text).not.toContain("Téléphone");
  });

  it("échappe le message de carte dans le HTML", () => {
    const order = orderWith({ cardMessage: '<script>alert("x")</script>' });
    const mail = buildOrderShopEmail(order, ITEMS, DEFAULT_EMAIL_TEMPLATES, CONTEXT);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
