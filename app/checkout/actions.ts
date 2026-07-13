"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { getDb } from "@/lib/db/client";
import {
  attachStripeSession,
  createPendingOrder,
  CheckoutError,
} from "@/lib/orders";
import { composeItemName } from "@/lib/item-label";
import { getSiteUrl, getStripe } from "@/lib/stripe";
const ItemsSchema = z
  .array(
    z.object({
      slug: z.string().min(1),
      sizeId: z.uuid().nullish(),
      colorId: z.uuid().nullish(),
      qty: z.number().int().min(1).max(99),
    }),
  )
  .min(1, { error: "Le panier est vide." })
  .max(50);

const CheckoutSchema = z.object({
  name: z.string().trim().min(1, { error: "Votre nom est requis." }).max(120),
  email: z.email({ error: "Adresse email invalide." }),
  phone: z.string().trim().min(6, { error: "Téléphone requis (notification du point relais)." }).max(25),
  relayPointId: z.string().trim().min(1, { error: "Choisissez un point relais." }).max(20),
  relayPointName: z.string().trim().min(1).max(120),
  relayStreet: z.string().trim().min(1).max(200),
  relayPostalCode: z.string().trim().regex(/^\d{5}$/, { error: "Code postal du relais invalide." }),
  relayCity: z.string().trim().min(1).max(100),
  relayCountry: z.literal("FR", { error: "Mondial Relay : France uniquement." }),
  deliveryDate: z.union([z.literal(""), z.iso.date({ error: "Date invalide." })]).optional(),
  cardMessage: z.string().trim().max(300, { error: "300 caractères max." }).optional(),
});

export type CheckoutState = { error: string } | undefined;

export async function startCheckout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  let items: z.infer<typeof ItemsSchema>;
  try {
    items = ItemsSchema.parse(JSON.parse(String(formData.get("items") ?? "")));
  } catch {
    return { error: "Panier invalide — rechargez la page et réessayez." };
  }

  const parsed = CheckoutSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    relayPointId: formData.get("relayPointId") ?? "",
    relayPointName: formData.get("relayPointName") ?? "",
    relayStreet: formData.get("relayStreet") ?? "",
    relayPostalCode: formData.get("relayPostalCode") ?? "",
    relayCity: formData.get("relayCity") ?? "",
    relayCountry: formData.get("relayCountry") ?? "",
    deliveryDate: formData.get("deliveryDate") ?? "",
    cardMessage: formData.get("cardMessage") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  let checkoutUrl: string;
  try {
    const db = await getDb();
    const { order, items: orderLines } = await createPendingOrder(
      db,
      {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        fulfillment: "mondial_relay",
        relayPointId: parsed.data.relayPointId,
        relayPointName: parsed.data.relayPointName,
        relayStreet: parsed.data.relayStreet,
        relayPostalCode: parsed.data.relayPostalCode,
        relayCity: parsed.data.relayCity,
        deliveryDate: parsed.data.deliveryDate || undefined,
        cardMessage: parsed.data.cardMessage,
      },
      items,
    );

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      customer_email: order.customerEmail,
      client_reference_id: order.id,
      metadata: { orderId: order.id, orderNumber: order.number },
      payment_intent_data: {
        metadata: { orderId: order.id, orderNumber: order.number },
      },
      line_items: [
        ...orderLines.map((line) => ({
          quantity: line.qty,
          price_data: {
            currency: "eur",
            unit_amount: line.priceCentsSnapshot,
            product_data: {
              name: composeItemName(
                line.nameSnapshot,
                line.sizeLabelSnapshot,
                line.colorLabelSnapshot,
              ),
            },
          },
        })),
        ...(order.deliveryFeeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: order.deliveryFeeCents,
                  product_data: { name: "Livraison Mondial Relay — point relais" },
                },
              },
            ]
          : []),
        ...(order.cardFeeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: order.cardFeeCents,
                  product_data: { name: "Carte manuscrite" },
                },
              },
            ]
          : []),
      ],
      success_url: `${getSiteUrl()}/commande/confirmee?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getSiteUrl()}/panier`,
    });

    if (!session.url) {
      return { error: "Stripe n'a pas renvoyé d'URL de paiement. Réessayez." };
    }
    await attachStripeSession(db, order.id, session.id);
    checkoutUrl = session.url;
  } catch (err) {
    if (err instanceof CheckoutError) {
      return { error: err.message };
    }
    console.error("[checkout] échec d'initialisation", err);
    return {
      error: "Le paiement n'a pas pu être initialisé. Réessayez dans un instant.",
    };
  }

  redirect(checkoutUrl);
}
