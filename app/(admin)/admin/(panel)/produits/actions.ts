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
  productImages,
  productSizes,
  products,
  type NewProductColorRow,
  type NewProductImageRow,
  type NewProductSizeRow,
} from "@/lib/db/schema";
import { parsePriceToCents } from "@/lib/money";
import { IMAGE_PATH_RE } from "@/lib/product-image";
import {
  RichDocSchema,
  isRichDocEmpty,
  richDocToPlainText,
  type RichDoc,
} from "@/lib/rich-text/schema";
import { slugify } from "@/lib/slug";
import { deleteImage } from "@/lib/storage";

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
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, { error: "Libellé de taille requis." }).max(40),
  price: z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, {
    error: "Prix de taille invalide.",
  }),
  active: z.boolean(),
});
const ColorSchema = z.object({
  id: z.uuid().optional(),
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, { error: "Libellé de coloris requis." }).max(40),
  illustrationVariant: z.coerce.number().int().min(0).max(5),
  active: z.boolean(),
});
// Le chemin transite par un <input hidden> — un POST modifié pourrait injecter
// une chaîne arbitraire concaténée dans productImageUrl. M6 : defense-in-depth,
// on contraint au format généré par uploadImage (lib/storage.ts) : uuid v4 +
// extension autorisée (cf. extFor()).
const ImageSchema = z.object({
  id: z.uuid().optional(),
  path: z.string().trim().regex(IMAGE_PATH_RE, { error: "Chemin d'image invalide." }),
  bgColor: optionalHexColor,
  alt: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().max(120, { error: "120 caractères maximum." }).nullable(),
  ),
  sizeKey: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().max(64).nullable(),
  ),
  colorKey: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().max(64).nullable(),
  ),
});
const SizesSchema = z.array(SizeSchema).max(12, { error: "12 tailles maximum." });
const ColorsSchema = z.array(ColorSchema).max(12, { error: "12 coloris maximum." });
const ImagesSchema = z.array(ImageSchema).max(12, { error: "12 photos maximum." });

export type ProductFormState =
  | { errors: Partial<Record<string, string[]>>; message?: string }
  | undefined;

function readForm(formData: FormData) {
  return ProductSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    category: formData.get("category"),
    badge: formData.get("badge") ?? "",
    illustrationVariant: formData.get("illustrationVariant"),
    active: formData.get("active") === "on",
  });
}

type DescriptionResult =
  | { rich: RichDoc; plain: string }
  | { errors: Partial<Record<string, string[]>> };

function readDescription(formData: FormData): DescriptionResult {
  const fail = (msg: string): DescriptionResult => ({ errors: { description: [msg] } });
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("descriptionRich") ?? "null"));
  } catch {
    return fail("Description illisible — rechargez la page.");
  }
  const parsed = RichDocSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Description invalide.");
  }
  const rich = parsed.data as RichDoc;
  if (isRichDocEmpty(rich)) return fail("La description est requise.");
  const plain = richDocToPlainText(rich);
  if (plain.length > 2000) return fail("2000 caractères maximum.");
  return { rich, plain };
}

type SizeInput = z.infer<typeof SizeSchema>;
type ColorInput = z.infer<typeof ColorSchema>;
type ImageInput = z.infer<typeof ImageSchema>;
type Variants = { sizes: SizeInput[]; colors: ColorInput[]; images: ImageInput[] };

// Parse + valide les listes de variantes et de photos (JSON des champs cachés).
function readVariants(formData: FormData): Variants | ProductFormState {
  let rawSizes: unknown;
  let rawColors: unknown;
  let rawImages: unknown;
  try {
    rawSizes = JSON.parse(String(formData.get("sizes") ?? "[]"));
    rawColors = JSON.parse(String(formData.get("colors") ?? "[]"));
    rawImages = JSON.parse(String(formData.get("images") ?? "[]"));
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
  const i = ImagesSchema.safeParse(rawImages);
  if (!i.success) {
    return { errors: { images: [i.error.issues[0]?.message ?? "Photos invalides."] } };
  }
  return { sizes: s.data, colors: c.data, images: i.data };
}

// Réconcilie tailles & coloris par id : update existants, insert nouveaux,
// delete ceux retirés (l'ordre de soumission devient le sortOrder).
// I4 : renvoie les chemins Storage devenus orphelins (photos retirées ou
// remplacées, coloris supprimé qui portait encore une image d'avant la
// migration 0013) — jamais d'appel réseau Storage à l'intérieur de la
// transaction DB, l'appelant purge ces chemins une fois le commit acquis.
async function syncChildren(
  tx: Tx,
  productId: string,
  { sizes, colors, images }: Variants,
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
  const sizeIdByKey = new Map<string, string>();
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
      sizeIdByKey.set(s.key, s.id);
      await tx
        .update(productSizes)
        .set(values)
        .where(and(eq(productSizes.id, s.id), eq(productSizes.productId, productId)));
    } else {
      newSizes.push(values);
    }
  }
  if (newSizes.length) {
    const inserted = await tx
      .insert(productSizes)
      .values(newSizes)
      .returning({ id: productSizes.id, sortOrder: productSizes.sortOrder });
    const idBySortOrder = new Map(inserted.map((r) => [r.sortOrder, r.id]));
    for (const [i, s] of sizes.entries()) {
      const id = idBySortOrder.get(i);
      if (!s.id && id) sizeIdByKey.set(s.key, id);
    }
  }

  const existingColors = await tx
    .select({ id: productColors.id, imagePath: productColors.imagePath })
    .from(productColors)
    .where(eq(productColors.productId, productId));
  const keepColors = new Set(colors.flatMap((c) => (c.id ? [c.id] : [])));
  const dropColors = existingColors.filter((c) => !keepColors.has(c.id)).map((c) => c.id);
  // Coloris retiré qui portait encore une image d'avant 0013 : elle n'est
  // référencée par rien d'autre, son objet Storage devient orphelin.
  const staleImagePaths = existingColors
    .filter((c) => !keepColors.has(c.id) && c.imagePath)
    .map((c) => c.imagePath as string);
  if (dropColors.length) {
    await tx.delete(productColors).where(inArray(productColors.id, dropColors));
  }
  const colorIdByKey = new Map<string, string>();
  const newColors: NewProductColorRow[] = [];
  for (const [i, c] of colors.entries()) {
    const values = {
      productId,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
      sortOrder: i,
      active: c.active,
    };
    if (c.id) {
      colorIdByKey.set(c.key, c.id);
      await tx
        .update(productColors)
        .set(values)
        .where(and(eq(productColors.id, c.id), eq(productColors.productId, productId)));
    } else {
      newColors.push(values);
    }
  }
  if (newColors.length) {
    const inserted = await tx
      .insert(productColors)
      .values(newColors)
      .returning({ id: productColors.id, sortOrder: productColors.sortOrder });
    const idBySortOrder = new Map(inserted.map((r) => [r.sortOrder, r.id]));
    for (const [i, c] of colors.entries()) {
      const id = idBySortOrder.get(i);
      if (!c.id && id) colorIdByKey.set(c.key, id);
    }
  }

  const existingImages = await tx
    .select({ id: productImages.id, path: productImages.path })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  const existingImagePaths = new Map(existingImages.map((i) => [i.id, i.path]));
  const keepImages = new Set(images.flatMap((i) => (i.id ? [i.id] : [])));
  const dropImages = existingImages.filter((i) => !keepImages.has(i.id)).map((i) => i.id);
  staleImagePaths.push(
    ...existingImages.filter((i) => !keepImages.has(i.id)).map((i) => i.path),
  );
  if (dropImages.length) {
    await tx.delete(productImages).where(inArray(productImages.id, dropImages));
  }
  const newImages: NewProductImageRow[] = [];
  for (const [i, img] of images.entries()) {
    const values = {
      productId,
      path: img.path,
      bgColor: img.bgColor,
      alt: img.alt,
      sizeId: (img.sizeKey && sizeIdByKey.get(img.sizeKey)) || null,
      colorId: (img.colorKey && colorIdByKey.get(img.colorKey)) || null,
      sortOrder: i,
    };
    if (img.id) {
      const prevPath = existingImagePaths.get(img.id);
      if (prevPath && prevPath !== img.path) staleImagePaths.push(prevPath);
      await tx
        .update(productImages)
        .set(values)
        .where(and(eq(productImages.id, img.id), eq(productImages.productId, productId)));
    } else {
      newImages.push(values);
    }
  }
  if (newImages.length) await tx.insert(productImages).values(newImages);
  return staleImagePaths;
}

function coverOf(images: ImageInput[]) {
  return {
    imagePath: images[0]?.path ?? null,
    imageBgColor: images[0]?.bgColor ?? null,
  };
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
  const description = readDescription(formData);
  if ("errors" in description) return description;
  const variants = readVariants(formData);
  if (variants && "errors" in variants) return variants;
  const v = variants as Variants;

  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  const slug = await uniqueSlug(rest.name);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        ...rest,
        ...coverOf(v.images),
        slug,
        description: description.plain,
        descriptionRich: description.rich,
        priceCents: parsePriceToCents(price),
        badge: badge === "" ? null : badge,
      })
      .returning({ id: products.id });
    await syncChildren(tx, created.id, v);
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
  const description = readDescription(formData);
  if ("errors" in description) return description;
  const variants = readVariants(formData);
  if (variants && "errors" in variants) return variants;
  const v = variants as Variants;

  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  // I2 : l'ancienne couverture est lue AVANT la transaction (simple lecture,
  // pas un appel Storage) et purgée seulement après le commit. Elle a
  // normalement son pendant dans product_images, mais pas si la migration
  // 0012 n'a été appliquée qu'en partie — la relire garantit qu'aucun objet
  // ne reste orphelin dans le bucket.
  const [prevRow] = await db
    .select({ imagePath: products.imagePath })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  const cover = coverOf(v.images);
  let found = true;
  let stalePaths: string[] = [];
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(products)
      .set({
        ...rest,
        ...cover,
        description: description.plain,
        descriptionRich: description.rich,
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
    stalePaths = await syncChildren(tx, id, v);
  });
  if (!found) {
    return { errors: {}, message: "Produit introuvable." };
  }
  // Purge Storage best-effort (photos et coloris remplacés/retirés) —
  // uniquement maintenant que la transaction a commité. La couverture n'est
  // qu'une copie d'une photo de la galerie : jamais purgée pour elle-même.
  const kept = new Set(v.images.map((i) => i.path));
  const cleanup = new Set(stalePaths);
  if (prevRow?.imagePath) cleanup.add(prevRow.imagePath);
  await Promise.all(
    [...cleanup].filter((p) => !kept.has(p)).map((p) => deleteImage(p)),
  );
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
  // I3 : collecte les chemins Storage (photos + coloris) avant la
  // suppression — les lignes filles disparaissent en cascade (FK), on ne
  // pourrait plus les lire après.
  const imageRows = await db
    .select({ path: productImages.path })
    .from(productImages)
    .where(eq(productImages.productId, id));
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
    ...new Set([
      ...imageRows.map((i) => i.path),
      ...colorRows.flatMap((c) => (c.imagePath ? [c.imagePath] : [])),
    ]),
  ];
  await Promise.all(imagePaths.map((p) => deleteImage(p)));
}

// L'upload d'image ne passe PAS par une Server Action : il vit dans
// app/api/admin/product-image/route.ts, pour que serverActions.bodySizeLimit
// (global à l'app) reste au défaut de 1 Mo sur checkout et contact.
