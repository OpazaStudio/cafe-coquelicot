"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { verifySession } from "@/lib/auth/dal";
import { getDb, type Db } from "@/lib/db/client";
import {
  productCategory,
  productColors,
  productSizes,
  products,
} from "@/lib/db/schema";
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

// Variantes sérialisées en JSON par le formulaire client.
const SizeSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, { error: "Libellé de taille requis." }).max(40),
  price: z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, {
    error: "Prix de taille invalide.",
  }),
  active: z.boolean(),
});
const ColorSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, { error: "Libellé de coloris requis." }).max(40),
  illustrationVariant: z.coerce.number().int().min(0).max(5),
  active: z.boolean(),
});
const SizesSchema = z.array(SizeSchema).max(12, { error: "12 tailles maximum." });
const ColorsSchema = z.array(ColorSchema).max(12, { error: "12 coloris maximum." });

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

type SizeInput = z.infer<typeof SizeSchema>;
type ColorInput = z.infer<typeof ColorSchema>;

// Parse + valide les deux listes de variantes (JSON des champs cachés).
function readVariants(
  formData: FormData,
): { sizes: SizeInput[]; colors: ColorInput[] } | ProductFormState {
  let rawSizes: unknown;
  let rawColors: unknown;
  try {
    rawSizes = JSON.parse(String(formData.get("sizes") ?? "[]"));
    rawColors = JSON.parse(String(formData.get("colors") ?? "[]"));
  } catch {
    return { errors: { sizes: ["Variantes illisibles — rechargez la page."] } };
  }
  const s = SizesSchema.safeParse(rawSizes);
  if (!s.success) {
    return { errors: { sizes: [s.error.issues[0]?.message ?? "Tailles invalides."] } };
  }
  const c = ColorsSchema.safeParse(rawColors);
  if (!c.success) {
    return { errors: { colors: [c.error.issues[0]?.message ?? "Coloris invalides."] } };
  }
  return { sizes: s.data, colors: c.data };
}

// Réconcilie tailles & coloris par id : update existants, insert nouveaux,
// delete ceux retirés (l'ordre de soumission devient le sortOrder).
async function syncChildren(
  tx: Db,
  productId: string,
  sizes: SizeInput[],
  colors: ColorInput[],
): Promise<void> {
  const existingSizes = await tx
    .select({ id: productSizes.id })
    .from(productSizes)
    .where(eq(productSizes.productId, productId));
  const keepSizes = new Set(sizes.flatMap((s) => (s.id ? [s.id] : [])));
  const dropSizes = existingSizes.filter((s) => !keepSizes.has(s.id)).map((s) => s.id);
  if (dropSizes.length) {
    await tx.delete(productSizes).where(inArray(productSizes.id, dropSizes));
  }
  for (const [i, s] of sizes.entries()) {
    const values = {
      productId,
      label: s.label,
      priceCents: parsePriceToCents(s.price),
      sortOrder: i,
      active: s.active,
    };
    if (s.id) {
      await tx
        .update(productSizes)
        .set(values)
        .where(and(eq(productSizes.id, s.id), eq(productSizes.productId, productId)));
    } else {
      await tx.insert(productSizes).values(values);
    }
  }

  const existingColors = await tx
    .select({ id: productColors.id })
    .from(productColors)
    .where(eq(productColors.productId, productId));
  const keepColors = new Set(colors.flatMap((c) => (c.id ? [c.id] : [])));
  const dropColors = existingColors.filter((c) => !keepColors.has(c.id)).map((c) => c.id);
  if (dropColors.length) {
    await tx.delete(productColors).where(inArray(productColors.id, dropColors));
  }
  for (const [i, c] of colors.entries()) {
    const values = {
      productId,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
      sortOrder: i,
      active: c.active,
    };
    if (c.id) {
      await tx
        .update(productColors)
        .set(values)
        .where(and(eq(productColors.id, c.id), eq(productColors.productId, productId)));
    } else {
      await tx.insert(productColors).values(values);
    }
  }
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
  const variants = readVariants(formData);
  if (variants && "errors" in variants) return variants;
  const { sizes, colors } = variants as { sizes: SizeInput[]; colors: ColorInput[] };

  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  const slug = await uniqueSlug(rest.name);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        ...rest,
        slug,
        priceCents: parsePriceToCents(price),
        badge: badge === "" ? null : badge,
      })
      .returning({ id: products.id });
    await syncChildren(tx as unknown as Db, created.id, sizes, colors);
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
  const variants = readVariants(formData);
  if (variants && "errors" in variants) return variants;
  const { sizes, colors } = variants as { sizes: SizeInput[]; colors: ColorInput[] };

  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  let found = true;
  await db.transaction(async (tx) => {
    const updated = await tx
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
      found = false;
      return;
    }
    await syncChildren(tx as unknown as Db, id, sizes, colors);
  });
  if (!found) {
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
