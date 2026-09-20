import { cache } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "./db/client";
import {
  productColors,
  productImages,
  productSizes,
  products,
  type ProductCategory,
  type ProductColorRow,
  type ProductImageRow,
  type ProductRow,
  type ProductSizeRow,
} from "./db/schema";
import { sanitizeRichDoc, type RichDoc } from "./rich-text/schema";
import { HOME_PICKS, SEED_PRODUCTS } from "./db/seed-data";
import { formatFromPrice } from "./money";
import { normalizeProductFrame, type ProductFrameId } from "./product-frame";
import { isUuid } from "./uuid";

export type ShopSize = { id: string; label: string; priceCents: number };
export type ShopImage = {
  id: string;
  path: string;
  bgColor: string | null;
  alt: string | null;
  sizeId: string | null;
  colorId: string | null;
};
export type ShopColor = {
  id: string;
  label: string;
  illustrationVariant: number;
};

// Forme consommée par les cartes produit (boutique + home). Les composants
// client n'importent ce module que via `import type` (le client db reste côté serveur).
export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  desc: string;
  descRich: RichDoc | null;
  price: string; // affichage « dès 48€ » (min des tailles, ou prix de base)
  priceCents: number;
  variant: number; // illustration par défaut (aucun coloris)
  imagePath: string | null; // image produit (null → SVG fallback)
  imageBgColor: string | null; // fond de l'image (null → fond gris)
  imageFrame: ProductFrameId;
  images: ShopImage[];
  badge: string | null;
  category: ProductCategory;
  sizes: ShopSize[]; // [] si le produit n'a pas de taille
  colors: ShopColor[]; // [] si le produit n'a pas de coloris
};

function assemble(
  row: ProductRow,
  sizes: ProductSizeRow[],
  colors: ProductColorRow[],
  images: ProductImageRow[],
): ShopProduct {
  const minCents = sizes.length
    ? Math.min(...sizes.map((s) => s.priceCents))
    : row.priceCents;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    desc: row.description,
    descRich: sanitizeRichDoc(row.descriptionRich),
    price: formatFromPrice(minCents),
    priceCents: minCents,
    variant: row.illustrationVariant,
    imagePath: row.imagePath,
    imageBgColor: row.imageBgColor,
    imageFrame: normalizeProductFrame(row.imageFrame),
    images: images.map((i) => ({
      id: i.id,
      path: i.path,
      bgColor: i.bgColor,
      alt: i.alt,
      sizeId: i.sizeId,
      colorId: i.colorId,
    })),
    badge: row.badge,
    category: row.category,
    sizes: sizes.map((s) => ({ id: s.id, label: s.label, priceCents: s.priceCents })),
    colors: colors.map((c) => ({
      id: c.id,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
    })),
  };
}

function groupByProduct<T extends { productId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.productId);
    if (list) list.push(r);
    else m.set(r.productId, [r]);
  }
  return m;
}

// Tailles & coloris ACTIFS des produits donnés (boutique), triés par sortOrder.
async function activeChildren(db: Db, ids: string[]) {
  if (ids.length === 0) {
    return {
      sizes: new Map<string, ProductSizeRow[]>(),
      colors: new Map<string, ProductColorRow[]>(),
      images: new Map<string, ProductImageRow[]>(),
    };
  }
  const sizes = await db
    .select()
    .from(productSizes)
    .where(and(inArray(productSizes.productId, ids), eq(productSizes.active, true)))
    .orderBy(asc(productSizes.sortOrder));
  const colors = await db
    .select()
    .from(productColors)
    .where(and(inArray(productColors.productId, ids), eq(productColors.active, true)))
    .orderBy(asc(productColors.sortOrder));
  const images = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, ids))
    .orderBy(asc(productImages.sortOrder));
  return {
    sizes: groupByProduct(sizes),
    colors: groupByProduct(colors),
    images: groupByProduct(images),
  };
}

// L'ordre d'affichage historique de la boutique ; les produits créés ensuite
// arrivent en fin de grille, par date de création.
const CATALOG_ORDER = new Map(SEED_PRODUCTS.map((p, i) => [p.slug, i]));

function bySeedOrder(a: ProductRow, b: ProductRow): number {
  const ia = CATALOG_ORDER.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
  const ib = CATALOG_ORDER.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
  if (ia !== ib) return ia - ib;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

// ── Boutique (produits actifs) — db injectable pour les tests ──────

export async function queryActiveProducts(db: Db): Promise<ShopProduct[]> {
  const rows = (
    await db.select().from(products).where(eq(products.active, true))
  ).sort(bySeedOrder);
  const { sizes, colors, images } = await activeChildren(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) =>
    assemble(r, sizes.get(r.id) ?? [], colors.get(r.id) ?? [], images.get(r.id) ?? []),
  );
}

export const getActiveProducts = cache(
  async (): Promise<ShopProduct[]> => queryActiveProducts(await getDb()),
);

// Vases actifs (cross-sell panier). Filtre la requête déjà mise en cache.
export async function queryActiveVases(db: Db): Promise<ShopProduct[]> {
  return (await queryActiveProducts(db)).filter((p) => p.category === "vase");
}

export const getActiveVases = cache(
  async (): Promise<ShopProduct[]> =>
    (await getActiveProducts()).filter((p) => p.category === "vase"),
);

// Sélection de la home, dans l'ordre de HOME_PICKS.
export const getHomeProducts = cache(async (): Promise<ShopProduct[]> => {
  const all = await getActiveProducts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  return HOME_PICKS.flatMap((slug) => bySlug.get(slug) ?? []);
});

// Page produit (vitrine) : produits actifs uniquement — un produit masqué
// (ou inconnu) renvoie null → la route répond 404.
export async function queryProductBySlug(
  db: Db,
  slug: string,
): Promise<ShopProduct | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.active, true)))
    .limit(1);
  if (!row) return null;
  const { sizes, colors, images } = await activeChildren(db, [row.id]);
  return assemble(
    row,
    sizes.get(row.id) ?? [],
    colors.get(row.id) ?? [],
    images.get(row.id) ?? [],
  );
}

export const getProductBySlug = cache(
  async (slug: string): Promise<ShopProduct | null> =>
    queryProductBySlug(await getDb(), slug),
);

// ── Back-office (produits inactifs inclus) ────────────────────────

export async function getAllProductRows(): Promise<ProductRow[]> {
  const db = await getDb();
  const rows = await db.select().from(products).orderBy(asc(products.createdAt));
  return rows.sort(bySeedOrder);
}

export async function getProductRow(id: string): Promise<ProductRow | null> {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Produit + TOUTES ses variantes (actives ou non), triées — pour l'édition admin.
export async function getProductWithVariants(
  db: Db,
  id: string,
): Promise<{
  product: ProductRow;
  sizes: ProductSizeRow[];
  colors: ProductColorRow[];
  images: ProductImageRow[];
} | null> {
  if (!isUuid(id)) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) return null;
  const sizes = await db
    .select()
    .from(productSizes)
    .where(eq(productSizes.productId, id))
    .orderBy(asc(productSizes.sortOrder));
  const colors = await db
    .select()
    .from(productColors)
    .where(eq(productColors.productId, id))
    .orderBy(asc(productColors.sortOrder));
  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.sortOrder));
  return { product, sizes, colors, images };
}

// Liste admin avec récap variantes (tailles/coloris ACTIFS) et prix « dès ».
export async function listProductsForAdmin(db: Db): Promise<
  { row: ProductRow; sizeCount: number; colorCount: number; fromCents: number }[]
> {
  const rows = (
    await db.select().from(products).orderBy(asc(products.createdAt))
  ).sort(bySeedOrder);
  const { sizes, colors } = await activeChildren(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => {
    const s = sizes.get(row.id) ?? [];
    const c = colors.get(row.id) ?? [];
    const fromCents = s.length
      ? Math.min(...s.map((x) => x.priceCents))
      : row.priceCents;
    return { row, sizeCount: s.length, colorCount: c.length, fromCents };
  });
}

export async function queryActiveProductsForSitemap(
  db: Db,
): Promise<Array<{ slug: string; updatedAt: Date }>> {
  return db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(eq(products.active, true));
}

export async function getActiveProductsForSitemap() {
  return queryActiveProductsForSitemap(await getDb());
}
