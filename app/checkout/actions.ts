"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { abandonPendingOrder } from "@/lib/checkout/abandon";
import {
  abandonReservedOrder,
  rememberReservedOrder,
} from "@/lib/checkout/reservation";
import { getDb, type Db } from "@/lib/db/client";
import {
  attachStripeSession,
  createPendingOrder,
  CheckoutError,
} from "@/lib/orders";
import { SHIPPING_LINE_LABELS } from "@/lib/order-status";
import { composeItemName } from "@/lib/item-label";
import { getSettings, shippingFeesFromSettings } from "@/lib/settings";
import { getSiteUrl, getStripe } from "@/lib/stripe";
import { revalidateAvailability } from "@/lib/stock/revalidate";
import { InsufficientStockError } from "@/lib/checkout/errors";
import type { AbandonHeldOutcome } from "@/lib/checkout/abandon";
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

const CHECKOUT_SESSION_TTL_SECONDS = 35 * 60;

function heldReservationMessage(
  outcome: AbandonHeldOutcome,
  item: string,
): string {
  switch (outcome) {
    case "held_release_failed":
      return (
        `Une commande précédente retient encore « ${item} ». ` +
        `Réessayez dans quelques instants, ou retirez-le du panier pour ` +
        `commander le reste. Si cela persiste, contactez-nous.`
      );
    case "held_paid":
      return (
        `Un paiement pour « ${item} » vient d'être enregistré. ` +
        `Vous allez recevoir un e-mail de confirmation. ` +
        `Retirez-le du panier pour commander le reste.`
      );
    case "held_payment_pending":
      return (
        `Un paiement est en cours de confirmation pour « ${item} ». ` +
        `Retirez-le du panier pour commander le reste.`
      );
  }
}

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

  const previous = await abandonReservedOrder();
  if (previous?.outcome === "released") {
    await revalidateAvailability([previous.orderId]);
  }

  let checkoutUrl: string;
  let created: { db: Db; orderId: string } | undefined;
  try {
    const db = await getDb();
    const fees = shippingFeesFromSettings(await getSettings());
    const { order, items: orderLines } = await createPendingOrder(
      db,
      toCustomerInput(parsed.data),
      items,
      fees,
    );
    created = { db, orderId: order.id };

    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS;
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      expires_at: expiresAt,
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
      await abandonPendingOrder(db, order.id);
      await revalidateAvailability([order.id], db);
      return { error: "Stripe n'a pas renvoyé d'URL de paiement. Réessayez." };
    }
    await attachStripeSession(db, order.id, session.id);
    await rememberReservedOrder(order.id, CHECKOUT_SESSION_TTL_SECONDS);
    checkoutUrl = session.url;
  } catch (err) {
    if (created) {
      await abandonPendingOrder(created.db, created.orderId);
      await revalidateAvailability([created.orderId], created.db);
    }
    if (
      err instanceof InsufficientStockError &&
      previous !== null &&
      previous.outcome !== "released" &&
      previous.heldKeys.includes(err.stockKey)
    ) {
      return {
        error: heldReservationMessage(
          previous.outcome,
          composeItemName(err.productName, err.sizeLabel),
        ),
      };
    }
    if (err instanceof CheckoutError) {
      return { error: err.message };
    }
    console.error("[checkout] échec d'initialisation", err);
    return {
      error: "Le paiement n'a pas pu être initialisé. Réessayez dans un instant.",
    };
  }

  if (created) await revalidateAvailability([created.orderId], created.db);

  redirect(checkoutUrl);
}
