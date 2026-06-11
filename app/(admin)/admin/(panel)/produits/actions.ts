"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { productCategory, products } from "@/lib/db/schema";
import { parsePriceToCents } from "@/lib/money";
import { slugify } from "@/lib/slug";

const ProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Le nom est requis." })
    .max(80, { error: "80 caractères maximum." }),
  tag: z
    .string()
    .trim()
    .min(1, { error: "Le sous-titre est requis." })
    .max(80, { error: "80 caractères maximum." }),
  description: z
    .string()
    .trim()
    .min(1, { error: "La description est requise." })
    .max(300, { error: "300 caractères maximum." }),
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
  active: z.boolean(),
});

export type ProductFormState =
  | { errors: Partial<Record<string, string[]>>; message?: string }
  | undefined;

function readForm(formData: FormData) {
  return ProductSchema.safeParse({
    name: formData.get("name"),
    tag: formData.get("tag"),
    description: formData.get("description"),
    price: formData.get("price"),
    category: formData.get("category"),
    badge: formData.get("badge") ?? "",
    illustrationVariant: formData.get("illustrationVariant"),
    active: formData.get("active") === "on",
  });
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const db = await getDb();
  const base = slugify(name) || "produit";
  let candidate = base;
  for (let i = 2; ; i++) {
    const found = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, candidate))
      .limit(1);
    if (found.length === 0 || found[0].id === excludeId) return candidate;
    candidate = `${base}-${i}`;
  }
}

function revalidateShop() {
  revalidatePath("/");
  revalidatePath("/boutique");
  revalidatePath("/admin/produits");
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await verifySession();
  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  await db.insert(products).values({
    ...rest,
    slug: await uniqueSlug(rest.name),
    priceCents: parsePriceToCents(price),
    badge: badge === "" ? null : badge,
  });
  revalidateShop();
  redirect("/admin/produits");
}

export async function updateProduct(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await verifySession();
  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  const updated = await db
    .update(products)
    .set({
      ...rest,
      priceCents: parsePriceToCents(price),
      badge: badge === "" ? null : badge,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (updated.length === 0) {
    return { errors: {}, message: "Produit introuvable." };
  }
  revalidateShop();
  redirect("/admin/produits");
}

export async function setProductActive(
  id: string,
  active: boolean,
): Promise<void> {
  await verifySession();
  const db = await getDb();
  await db
    .update(products)
    .set({ active, updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateShop();
}

export async function deleteProduct(id: string): Promise<void> {
  await verifySession();
  const db = await getDb();
  // order_items.product_id passe à NULL (FK on delete set null) :
  // l'historique des commandes garde ses snapshots nom/prix.
  await db.delete(products).where(eq(products.id, id));
  revalidateShop();
}
