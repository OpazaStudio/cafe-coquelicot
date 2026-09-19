import * as z from "zod";
import type { CheckoutCustomerInput } from "@/lib/orders";

const BaseSchema = z.object({
  name: z.string().trim().min(1, { error: "Votre nom est requis." }).max(120),
  email: z.email({ error: "Adresse email invalide." }),
  phone: z.string().trim().min(6, { error: "Téléphone requis (suivi de livraison)." }).max(25),
  deliveryDate: z.union([z.literal(""), z.iso.date({ error: "Date invalide." })]).optional(),
  cardMessage: z.string().trim().max(300, { error: "300 caractères max." }).optional(),
});

const RelaySchema = BaseSchema.extend({
  fulfillment: z.literal("mondial_relay"),
  relayPointId: z.string().trim().min(1, { error: "Choisissez un point relais." }).max(20),
  relayPointName: z.string().trim().min(1).max(120),
  relayStreet: z.string().trim().min(1).max(200),
  relayPostalCode: z.string().trim().regex(/^\d{5}$/, { error: "Code postal du relais invalide." }),
  relayCity: z.string().trim().min(1).max(100),
  relayCountry: z.literal("FR", { error: "Mondial Relay : France uniquement." }),
});

const ColissimoSchema = BaseSchema.extend({
  fulfillment: z.literal("poste"),
  address: z.string().trim().min(1, { error: "Votre adresse est requise." }).max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: "Code postal invalide." })
    .refine((cp) => !/^9[78]/.test(cp), { error: "Colissimo : France métropolitaine uniquement." }),
  city: z.string().trim().min(1, { error: "Votre ville est requise." }).max(100),
});

export const CheckoutSchema = z.discriminatedUnion(
  "fulfillment",
  [RelaySchema, ColissimoSchema],
  { error: "Mode de livraison invalide." },
);

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

const FORM_KEYS = [
  "fulfillment",
  "name",
  "email",
  "phone",
  "deliveryDate",
  "cardMessage",
  "relayPointId",
  "relayPointName",
  "relayStreet",
  "relayPostalCode",
  "relayCity",
  "relayCountry",
  "address",
  "postalCode",
  "city",
] as const;

export function rawCheckoutValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(FORM_KEYS.map((key) => [key, String(formData.get(key) ?? "")]));
}

export function toCustomerInput(data: CheckoutInput): CheckoutCustomerInput {
  const common = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    deliveryDate: data.deliveryDate || undefined,
    cardMessage: data.cardMessage,
  };
  if (data.fulfillment === "poste") {
    return {
      ...common,
      fulfillment: "poste",
      shippingAddress: data.address,
      shippingPostalCode: data.postalCode,
      shippingCity: data.city,
      shippingCountry: "FR",
    };
  }
  return {
    ...common,
    fulfillment: "mondial_relay",
    relayPointId: data.relayPointId,
    relayPointName: data.relayPointName,
    relayStreet: data.relayStreet,
    relayPostalCode: data.relayPostalCode,
    relayCity: data.relayCity,
  };
}
