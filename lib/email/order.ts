import { composeItemName } from "../item-label";
import { formatEuros } from "../money";
import {
  SHIPPING_COUNTRY_LABELS,
  SHIPPING_LINE_LABELS,
  type Fulfillment,
} from "../order-status";
import {
  escapeHtml,
  fillHtmlVars,
  fillTextVars,
  headerSafe,
  paragraphsHtmlVars,
  type EmailTemplates,
  type TemplateVars,
} from "./templates";

export * from "./templates";

export type OrderEmailOrder = {
  number: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  fulfillment: Fulfillment;
  shippingAddress: string | null;
  shippingPostalCode: string | null;
  shippingCity: string | null;
  shippingCountry: string | null;
  relayPointName: string | null;
  deliveryDate: string | null;
  cardMessage: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  cardFeeCents: number;
  totalCents: number;
};

export type OrderEmailItem = {
  nameSnapshot: string;
  sizeLabelSnapshot: string | null;
  colorLabelSnapshot: string | null;
  qty: number;
  priceCentsSnapshot: number;
};

export type OrderEmailContext = {
  pickupAddress: string;
  preparationDelay: string;
  shippingDelay: string;
  shippingDelayColissimo: string;
};

export type EmailContent = { subject: string; text: string; html: string };

const HTML_WRAP = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;line-height:1.55;font-size:15px;">${inner}</div>`;

const LABEL_CELL = 'style="padding:4px 20px 4px 0;color:#8a8a8a;"';

function orderVars(order: OrderEmailOrder): TemplateVars {
  return { nom: order.customerName, numero: order.number };
}

function formatDeliveryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function itemLabel(item: OrderEmailItem): string {
  return composeItemName(item.nameSnapshot, item.sizeLabelSnapshot, item.colorLabelSnapshot);
}

function postalLines(order: OrderEmailOrder): string[] {
  const city = [order.shippingPostalCode, order.shippingCity].filter(Boolean).join(" ");
  const country = order.shippingCountry
    ? (SHIPPING_COUNTRY_LABELS[order.shippingCountry as keyof typeof SHIPPING_COUNTRY_LABELS] ??
      order.shippingCountry)
    : "";
  return [order.shippingAddress ?? "", city, country].filter((line) => line !== "");
}

function deliveryLines(order: OrderEmailOrder, context: OrderEmailContext): string[] {
  const header = SHIPPING_LINE_LABELS[order.fulfillment];
  if (order.fulfillment === "retrait") {
    return [
      header,
      ...(context.pickupAddress ? [context.pickupAddress] : []),
      ...(context.preparationDelay ? [`Préparation : ${context.preparationDelay}`] : []),
    ];
  }
  const delay =
    order.fulfillment === "mondial_relay" ? context.shippingDelay : context.shippingDelayColissimo;
  return [
    header,
    ...(order.relayPointName ? [`Point relais : ${order.relayPointName}`] : []),
    ...postalLines(order),
    ...(delay ? [`Acheminement : ${delay}`] : []),
  ];
}

type AmountLine = { label: string; cents: number };

function amountLines(order: OrderEmailOrder): AmountLine[] {
  return [
    { label: "Sous-total", cents: order.subtotalCents },
    ...(order.deliveryFeeCents > 0
      ? [{ label: SHIPPING_LINE_LABELS[order.fulfillment], cents: order.deliveryFeeCents }]
      : []),
    ...(order.cardFeeCents > 0
      ? [{ label: "Carte manuscrite", cents: order.cardFeeCents }]
      : []),
    { label: "Total", cents: order.totalCents },
  ];
}

function recapText(
  order: OrderEmailOrder,
  items: OrderEmailItem[],
  context: OrderEmailContext,
): string[] {
  return [
    `Commande n° ${order.number}`,
    ...(order.deliveryDate ? [`Date souhaitée : ${formatDeliveryDate(order.deliveryDate)}`] : []),
    "",
    "Articles",
    ...items.map(
      (item) =>
        `- ${itemLabel(item)} × ${item.qty} — ${formatEuros(item.priceCentsSnapshot * item.qty)}`,
    ),
    "",
    ...amountLines(order).map((line) => `${line.label} : ${formatEuros(line.cents)}`),
    "",
    "Livraison",
    ...deliveryLines(order, context),
  ];
}

function recapHtml(
  order: OrderEmailOrder,
  items: OrderEmailItem[],
  context: OrderEmailContext,
): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 16px 6px 0;">${escapeHtml(itemLabel(item))}</td>` +
        `<td style="padding:6px 16px 6px 0;color:#8a8a8a;white-space:nowrap;">× ${item.qty}</td>` +
        `<td style="padding:6px 0;text-align:right;white-space:nowrap;">${escapeHtml(formatEuros(item.priceCentsSnapshot * item.qty))}</td></tr>`,
    )
    .join("");

  const totals = amountLines(order)
    .map((line, index, all) => {
      const weight = index === all.length - 1 ? "font-weight:bold;" : "";
      return (
        `<tr><td style="padding:4px 16px 4px 0;${weight}">${escapeHtml(line.label)}</td>` +
        `<td style="padding:4px 0;text-align:right;white-space:nowrap;${weight}">${escapeHtml(formatEuros(line.cents))}</td></tr>`
      );
    })
    .join("");

  const delivery = deliveryLines(order, context)
    .map((line) => escapeHtml(line))
    .join("<br>");

  return (
    `<p style="margin:16px 0 6px;color:#8a8a8a;">Commande n° ${escapeHtml(order.number)}</p>` +
    (order.deliveryDate
      ? `<p style="margin:0 0 12px;">Date souhaitée : ${escapeHtml(formatDeliveryDate(order.deliveryDate))}</p>`
      : "") +
    `<table style="border-collapse:collapse;width:100%;max-width:520px;">${rows}</table>` +
    `<table style="border-collapse:collapse;width:100%;max-width:520px;margin-top:12px;border-top:1px solid #e4e0d8;">${totals}</table>` +
    `<p style="margin:20px 0 6px;color:#8a8a8a;">Livraison</p>` +
    `<div style="padding:14px 16px;background:#f6f4ef;border-radius:8px;">${delivery}</div>`
  );
}

export function buildOrderAckEmail(
  order: OrderEmailOrder,
  items: OrderEmailItem[],
  templates: EmailTemplates,
  context: OrderEmailContext,
): EmailContent {
  const vars = orderVars(order);
  const subject = headerSafe(fillTextVars(templates.orderAckSubject, vars));

  const text = [
    fillTextVars(templates.orderAckBody, vars),
    "",
    ...recapText(order, items, context),
    ...(order.cardMessage ? ["", "Votre message sur la carte", order.cardMessage] : []),
    "",
    fillTextVars(templates.orderAckSignature, vars),
  ].join("\n");

  const html = HTML_WRAP(
    paragraphsHtmlVars(templates.orderAckBody, vars) +
      recapHtml(order, items, context) +
      (order.cardMessage
        ? `<p style="margin:20px 0 6px;color:#8a8a8a;">Votre message sur la carte</p>` +
          `<div style="padding:14px 16px;background:#f6f4ef;border-radius:8px;">${escapeHtml(order.cardMessage).replace(/\n/g, "<br>")}</div>`
        : "") +
      `<div style="margin-top:20px;">${paragraphsHtmlVars(templates.orderAckSignature, vars, "margin:0;")}</div>`,
  );

  return { subject, text, html };
}

export function buildOrderShopEmail(
  order: OrderEmailOrder,
  items: OrderEmailItem[],
  templates: EmailTemplates,
  context: OrderEmailContext,
): EmailContent {
  const vars = orderVars(order);
  const subject = headerSafe(fillTextVars(templates.orderShopSubject, vars));
  const heading = fillTextVars(templates.orderShopHeading, vars);

  const text = [
    heading,
    "",
    `Nom       : ${order.customerName}`,
    `Email     : ${order.customerEmail}`,
    ...(order.customerPhone ? [`Téléphone : ${order.customerPhone}`] : []),
    "",
    ...recapText(order, items, context),
    ...(order.cardMessage ? ["", "Message de la carte", order.cardMessage] : []),
  ].join("\n");

  const html = HTML_WRAP(
    `<h2 style="margin:0 0 16px;font-size:20px;">${fillHtmlVars(templates.orderShopHeading, vars)}</h2>` +
      `<table style="border-collapse:collapse;margin-bottom:8px;">` +
      `<tr><td ${LABEL_CELL}>Nom</td><td>${escapeHtml(order.customerName)}</td></tr>` +
      `<tr><td ${LABEL_CELL}>Email</td><td><a href="mailto:${escapeHtml(order.customerEmail)}" style="color:#870c20;">${escapeHtml(order.customerEmail)}</a></td></tr>` +
      (order.customerPhone
        ? `<tr><td ${LABEL_CELL}>Téléphone</td><td>${escapeHtml(order.customerPhone)}</td></tr>`
        : "") +
      `</table>` +
      recapHtml(order, items, context) +
      (order.cardMessage
        ? `<p style="margin:20px 0 6px;color:#8a8a8a;">Message de la carte</p>` +
          `<div style="padding:14px 16px;background:#f6f4ef;border-radius:8px;">${escapeHtml(order.cardMessage).replace(/\n/g, "<br>")}</div>`
        : ""),
  );

  return { subject, text, html };
}
