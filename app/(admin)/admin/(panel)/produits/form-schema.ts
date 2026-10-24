import * as z from "zod";
import { productCategory } from "@/lib/db/schema";
import { PRODUCT_FRAME_IDS } from "@/lib/product-frame";

const ProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Le nom est requis." })
    .max(80, { error: "80 caractères maximum." }),
  price: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, {
      error: "Prix invalide — ex : 48 ou 48,50.",
    }),
  category: z.enum(productCategory.enumValues, {
    error: "Catégorie invalide.",
  }),
  badge: z.string().trim().max(20, { error: "20 caractères maximum." }),
  illustrationVariant: z.coerce
    .number()
    .int()
    .min(0)
    .max(5, { error: "Variante entre 0 et 5." }),
  imageFrame: z.enum(PRODUCT_FRAME_IDS, { error: "Format de cadre invalide." }),
  active: z.boolean(),
});

export function readForm(formData: FormData) {
  return ProductSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    category: formData.get("category"),
    badge: formData.get("badge") ?? "",
    illustrationVariant: formData.get("illustrationVariant"),
    imageFrame: formData.get("imageFrame") ?? "1:1",
    active: formData.get("active") === "on",
  });
}
