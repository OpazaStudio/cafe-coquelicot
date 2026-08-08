"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { verifySession } from "@/lib/auth/dal";
import { getDb, type Tx } from "@/lib/db/client";
import {
  productCategory,
  productColors,
  productSizes,
  products,
  type NewProductColorRow,
  type NewProductSizeRow,
} from "@/lib/db/schema";
import { parsePriceToCents } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { deleteImage } from "@/lib/storage";

// Champs image optionnels : "" → null. Le chemin transite par un
// <input hidden> — un POST modifié pourrait injecter une chaîne arbitraire
// concaténée dans productImageUrl. M6 : defense-in-depth, on contraint au
// format généré par uploadImage (lib/storage.ts) : uuid v4 + extension
// autorisée (cf. extFor()).
const optionalImagePath = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .string()
    .trim()
    .regex(/^[0-9a-f-]{36}\.(png|jpe?g|webp)$/, { error: "Chemin d'image invalide." })
    .nullable(),
);
const optionalHexColor = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { error: "Couleur invalide." })
    .nullable(),
);

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
  imagePath: optionalImagePath,
  imageBgColor: optionalHexColor,
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
  imagePath: optionalImagePath,
  imageBgColor: optionalHexColor,
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
    imagePath: formData.get("imagePath"),
    imageBgColor: formData.get("imageBgColor"),
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
// I4 : renvoie les chemins Storage des coloris retirés/remplacés — jamais
// d'appel réseau Storage à l'intérieur de la transaction DB, l'appelant
// purge ces chemins (best-effort) une fois la transaction commitée.
async function syncChildren(
  tx: Tx,
  productId: string,
  sizes: SizeInput[],
  colors: ColorInput[],
): Promise<string[]> {
  const existingSizes = await tx
    .select({ id: productSizes.id })
    .from(productSizes)
    .where(eq(productSizes.productId, productId));
  const keepSizes = new Set(sizes.flatMap((s) => (s.id ? [s.id] : [])));
  const dropSizes = existingSizes.filter((s) => !keepSizes.has(s.id)).map((s) => s.id);
  if (dropSizes.length) {
    await tx.delete(productSizes).where(inArray(productSizes.id, dropSizes));
  }
  // Les updates restent ligne à ligne (valeurs distinctes, ≤12 par liste) ;
  // les créations partent en un seul insert — `sortOrder` étant explicite,
  // l'ordre de soumission est préservé.
  const newSizes: NewProductSizeRow[] = [];
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
      newSizes.push(values);
    }
  }
  if (newSizes.length) await tx.insert(productSizes).values(newSizes);

  const existingColors = await tx
    .select({ id: productColors.id, imagePath: productColors.imagePath })
    .from(productColors)
    .where(eq(productColors.productId, productId));
  const existingColorImages = new Map(existingColors.map((c) => [c.id, c.imagePath]));
  const keepColors = new Set(colors.flatMap((c) => (c.id ? [c.id] : [])));
  const dropColors = existingColors.filter((c) => !keepColors.has(c.id)).map((c) => c.id);
  // Coloris retirés : leur chemin Storage (s'il existe) devient orphelin.
  const staleImagePaths = existingColors
    .filter((c) => !keepColors.has(c.id) && c.imagePath)
    .map((c) => c.imagePath as string);
  if (dropColors.length) {
    await tx.delete(productColors).where(inArray(productColors.id, dropColors));
  }
  const newColors: NewProductColorRow[] = [];
  for (const [i, c] of colors.entries()) {
    const values = {
      productId,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
      imagePath: c.imagePath,
      imageBgColor: c.imageBgColor,
      sortOrder: i,
      active: c.active,
    };
    if (c.id) {
      // Coloris mis à jour : si son image a été remplacée, l'ancienne
      // devient orpheline.
      const prevImagePath = existingColorImages.get(c.id);
      if (prevImagePath && prevImagePath !== c.imagePath) {
        staleImagePaths.push(prevImagePath);
      }
      await tx
        .update(productColors)
        .set(values)
        .where(and(eq(productColors.id, c.id), eq(productColors.productId, productId)));
    } else {
      newColors.push(values);
    }
  }
  if (newColors.length) await tx.insert(productColors).values(newColors);
  return staleImagePaths;
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
    await syncChildren(tx, created.id, sizes, colors);
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
  // Remplacement d'image : on récupère l'ancien chemin avant la transaction
  // (simple lecture, pas un appel réseau Storage), mais on ne le supprime
  // qu'APRÈS un commit réussi (I2) — sinon un échec de transaction laisserait
  // la ligne avec son ancien imagePath pointant vers un objet déjà supprimé.
  const [prevRow] = await db
    .select({ imagePath: products.imagePath })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  let found = true;
  let staleColorImagePaths: string[] = [];
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
    staleColorImagePaths = await syncChildren(tx, id, sizes, colors);
  });
  if (!found) {
    return { errors: {}, message: "Produit introuvable." };
  }
  // Purge Storage best-effort (produit + coloris remplacés/retirés) —
  // uniquement maintenant que la transaction a commité.
  const cleanupPaths = [...staleColorImagePaths];
  if (prevRow?.imagePath && prevRow.imagePath !== rest.imagePath) {
    cleanupPaths.push(prevRow.imagePath);
  }
  await Promise.all(cleanupPaths.map((p) => deleteImage(p)));
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
  // I3 : collecte les chemins Storage (produit + coloris) avant la
  // suppression — les lignes coloris disparaissent en cascade (FK), on ne
  // pourrait plus les lire après.
  const [productRow] = await db
    .select({ imagePath: products.imagePath })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  const colorRows = await db
    .select({ imagePath: productColors.imagePath })
    .from(productColors)
    .where(eq(productColors.productId, id));
  // order_items.product_id passe à NULL (FK on delete set null) :
  // l'historique des commandes garde ses snapshots nom/prix.
  await db.delete(products).where(eq(products.id, id));
  revalidateShop();
  // Purge Storage best-effort (deleteImage ne throw jamais) — ne bloque
  // jamais la suppression si un objet est déjà absent ou si Storage échoue.
  const imagePaths = [
    ...(productRow?.imagePath ? [productRow.imagePath] : []),
    ...colorRows.flatMap((c) => (c.imagePath ? [c.imagePath] : [])),
  ];
  await Promise.all(imagePaths.map((p) => deleteImage(p)));
}

// L'upload d'image ne passe PAS par une Server Action : il vit dans
// app/api/admin/product-image/route.ts, pour que serverActions.bodySizeLimit
// (global à l'app) reste au défaut de 1 Mo sur checkout et contact.
