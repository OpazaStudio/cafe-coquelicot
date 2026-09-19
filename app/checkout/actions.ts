"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { getDb } from "@/lib/db/client";
import {
  attachStripeSession,
  createPendingOrder,
  CheckoutError,
} from "@/lib/orders";
import { SHIPPING_LINE_LABELS } from "@/lib/order-status";
import { composeItemName } from "@/lib/item-label";
import { getSettings, shippingFeesFromSettings } from "@/lib/settings";
import { getSiteUrl, getStripe } from "@/lib/stripe";
import { CheckoutSchema, rawCheckoutValues, toCustomerInput } from "./schema";

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

  const parsed = CheckoutSchema.safeParse(rawCheckoutValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  let checkoutUrl: string;
  try {
    const db = await getDb();
    const fees = shippingFeesFromSettings(await getSettings());
    const { order, items: orderLines } = await createPendingOrder(
      db,
      toCustomerInput(parsed.data),
      items,
      fees,
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
                  product_data: { name: SHIPPING_LINE_LABELS[order.fulfillment] },
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
