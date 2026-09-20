import type { Db } from "@/lib/db/client";
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
  const { resend, to, from } = mailer;
  const { order, items } = found;

  const shop = buildOrderShopEmail(order, items, templates, context);
  try {
    const notify = await resend.emails.send({
      from,
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
