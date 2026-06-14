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
import {
  isShippingCountry,
  type ShippingCountryCode,
} from "@/lib/order-status";

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

const CheckoutSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Votre nom est requis." })
      .max(120),
    email: z.email({ error: "Adresse email invalide." }),
    phone: z.string().trim().max(25).optional(),
    fulfillment: z.enum(["retrait", "poste"], {
      error: "Choisissez retrait ou envoi postal.",
    }),
    shippingAddress: z.string().trim().max(200).optional(),
    shippingPostalCode: z.string().trim().max(10).optional(),
    shippingCity: z.string().trim().max(100).optional(),
    shippingCountry: z.string().trim().optional(),
    deliveryDate: z
      .union([z.literal(""), z.iso.date({ error: "Date invalide." })])
      .optional(),
    cardMessage: z.string().trim().max(300, { error: "300 caractères max." }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment !== "poste") return;
    if ((v.shippingAddress ?? "").length < 5) {
      ctx.addIssue({
        code: "custom",
        message: "Adresse d'expédition requise.",
        path: ["shippingAddress"],
      });
    }
    const country = v.shippingCountry ?? "";
    if (!isShippingCountry(country)) {
      ctx.addIssue({
        code: "custom",
        message: "Pays de destination non desservi.",
        path: ["shippingCountry"],
      });
      return; // la validation du code postal dépend du pays
    }
    const pc = v.shippingPostalCode ?? "";
    const pcOk =
      country === "FR" ? /^\d{5}$/.test(pc) : pc.length >= 2 && pc.length <= 10;
    if (!pcOk) {
      ctx.addIssue({
        code: "custom",
        message: "Code postal invalide.",
        path: ["shippingPostalCode"],
      });
    }
    if (!(v.shippingCity ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Ville requise.",
        path: ["shippingCity"],
      });
    }
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
    fulfillment: formData.get("fulfillment"),
    shippingAddress: formData.get("shippingAddress") ?? "",
    shippingPostalCode: formData.get("shippingPostalCode") ?? "",
    shippingCity: formData.get("shippingCity") ?? "",
    shippingCountry: formData.get("shippingCountry") ?? "",
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
        fulfillment: parsed.data.fulfillment,
        shippingAddress: parsed.data.shippingAddress,
        shippingPostalCode: parsed.data.shippingPostalCode,
        shippingCity: parsed.data.shippingCity,
        shippingCountry: parsed.data.shippingCountry as
          | ShippingCountryCode
          | undefined,
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
                  product_data: { name: "Envoi postal — Colissimo" },
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
