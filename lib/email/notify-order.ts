import type { Db } from "@/lib/db/client";
import type { OrderRow } from "@/lib/db/schema";
import { formatEuros } from "@/lib/money";
import { getOrderWithItems } from "@/lib/orders";
import {
  DEFAULT_SETTINGS,
  emailTemplatesFromSettings,
  orderEmailContextFromSettings,
  querySettings,
  type Settings,
} from "@/lib/settings";
import { buildOrderAckEmail, buildOrderShopEmail } from "./order";
import { getMailer } from "./resend";

async function loadSettings(db: Db): Promise<Settings> {
  try {
    return await querySettings(db);
  } catch (err) {
    console.error("[commande] lecture des paramètres impossible", err);
    return DEFAULT_SETTINGS;
  }
}

export async function notifyOrderPaid(db: Db, orderId: string): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    if (process.env.NODE_ENV === "production") {
      console.error("[commande] RESEND_API_KEY manquante — e-mails non envoyés");
    } else {
      console.warn("[commande] RESEND_API_KEY absente — envoi simulé (dev).");
    }
    return;
  }

  const found = await getOrderWithItems(db, orderId);
  if (!found) return;

  const settings = await loadSettings(db);
  const templates = emailTemplatesFromSettings(settings);
  const context = orderEmailContextFromSettings(settings);
  const { resend, to, from, bcc } = mailer;
  const { order, items } = found;

  const shop = buildOrderShopEmail(order, items, templates, context);
  try {
    const notify = await resend.emails.send({
      from,
      bcc,
      to: [to],
      replyTo: order.customerEmail,
      subject: shop.subject,
      text: shop.text,
      html: shop.html,
    });
    if (notify.error) {
      console.error("[commande] échec d'envoi (notification boutique)", notify.error);
    }
  } catch (err) {
    console.error("[commande] exception réseau (notification boutique)", err);
  }

  const ack = buildOrderAckEmail(order, items, templates, context);
  try {
    const confirm = await resend.emails.send({
      from,
      bcc,
      to: [order.customerEmail],
      replyTo: to,
      subject: ack.subject,
      text: ack.text,
      html: ack.html,
    });
    if (confirm.error) {
      console.error("[commande] échec d'envoi (confirmation client)", confirm.error);
    }
  } catch (err) {
    console.error("[commande] exception réseau (confirmation client)", err);
  }
}

export async function alertPaidOnCancelledOrder(order: OrderRow): Promise<void> {
  const mailer = getMailer();
  if (!mailer) return;

  const { resend, to, from, bcc } = mailer;
  const lines = [
    `Stripe a encaissé un paiement sur la commande ${order.number}, qui était annulée.`,
    "",
    `Commande : ${order.number}`,
    `Client : ${order.customerEmail}`,
    `Total : ${formatEuros(order.totalCents)}`,
    ...(order.stripeSessionId ? [`Session Stripe : ${order.stripeSessionId}`] : []),
    "",
    "Vérifiez le paiement dans Stripe, puis remboursez le client ou honorez la commande.",
    "Rien n'a été modifié : la commande reste annulée dans le back-office.",
  ];

  try {
    const alert = await resend.emails.send({
      from,
      bcc,
      to: [to],
      replyTo: order.customerEmail,
      subject: `Commande annulée mais payée — ${order.number}`,
      text: lines.join("\n"),
    });
    if (alert.error) {
      console.error("[commande] échec d'envoi (alerte commande annulée payée)", alert.error);
    }
  } catch (err) {
    console.error("[commande] exception réseau (alerte commande annulée payée)", err);
  }
}
