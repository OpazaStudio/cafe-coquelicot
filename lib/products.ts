import { cache } from "react";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb, type Db } from "./db/client";
import {
  orderItems,
  orders,
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

export type ShopSize = {
  id: string;
  label: string;
  priceCents: number;
  soldOut: boolean;
};
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
  soldOut: boolean;
};

export function resolveStockKey(
  product: ProductRow,
  activeSizes: ProductSizeRow[],
  sizeId: string | null,
): { table: "product_sizes" | "products"; id: string; stockQty: number | null } {
  if (activeSizes.length === 0) {
    return { table: "products", id: product.id, stockQty: product.stockQty };
  }
  const size = sizeId
    ? activeSizes.find((s) => s.id === sizeId && s.productId === product.id)
    : undefined;
  if (!size) {
    throw new Error(`Taille introuvable parmi les tailles actives de ${product.slug}.`);
  }
  return { table: "product_sizes", id: size.id, stockQty: size.stockQty };
}

function assemble(
  row: ProductRow,
  sizes: ProductSizeRow[],
  colors: ProductColorRow[],
  images: ProductImageRow[],
): ShopProduct {
  const shopSizes: ShopSize[] = sizes.map((s) => ({
    id: s.id,
    label: s.label,
    priceCents: s.priceCents,
    soldOut: s.stockQty === 0,
  }));
  const available = shopSizes.filter((s) => !s.soldOut);
  const priced = available.length > 0 ? available : shopSizes;
  const minCents = priced.length
    ? Math.min(...priced.map((s) => s.priceCents))
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
    sizes: shopSizes,
    colors: colors.map((c) => ({
      id: c.id,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
    })),
    soldOut: shopSizes.length > 0 ? available.length === 0 : row.stockQty === 0,
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

const HOME_SLOTS = 8;

// Sélection de la home, dans l'ordre de HOME_PICKS.
export const getHomeProducts = cache(async (): Promise<ShopProduct[]> => {
  const all = await getActiveProducts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const picked = HOME_PICKS.flatMap((slug) => bySlug.get(slug) ?? []);
  const taken = new Set(picked.map((p) => p.slug));
  const rest = all.filter((p) => !taken.has(p.slug));
  const fill = [
    ...rest.filter((p) => p.category !== "vase"),
    ...rest.filter((p) => p.category === "vase"),
  ];
  return [...picked, ...fill].slice(0, HOME_SLOTS);
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

export type PendingHold = { units: number; orders: number };

export async function pendingHoldsBySizeId(
  db: Db,
  sizeIds: string[],
): Promise<Map<string, PendingHold>> {
  const held = new Map<string, PendingHold>();
  if (sizeIds.length === 0) return held;
  const rows = await db
    .select({
      sizeId: orderItems.stockReservedSizeId,
      orderId: orderItems.orderId,
      qty: orderItems.stockReservedQty,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.status, "pending"),
        gt(orderItems.stockReservedQty, 0),
        inArray(orderItems.stockReservedSizeId, sizeIds),
      ),
    );
  const units = new Map<string, number>();
  const orderIds = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.sizeId) continue;
    units.set(row.sizeId, (units.get(row.sizeId) ?? 0) + row.qty);
    const seen = orderIds.get(row.sizeId) ?? new Set<string>();
    seen.add(row.orderId);
    orderIds.set(row.sizeId, seen);
  }
  for (const [sizeId, qty] of units) {
    held.set(sizeId, { units: qty, orders: orderIds.get(sizeId)?.size ?? 0 });
  }
  return held;
}

export async function pendingHoldForProduct(
  db: Db,
  productId: string,
): Promise<PendingHold> {
  const rows = await db
    .select({ orderId: orderItems.orderId, qty: orderItems.stockReservedQty })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.status, "pending"),
        gt(orderItems.stockReservedQty, 0),
        eq(orderItems.stockReservedProductId, productId),
      ),
    );
  return {
    units: rows.reduce((total, row) => total + row.qty, 0),
    orders: new Set(rows.map((row) => row.orderId)).size,
  };
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
  pendingBySizeId: Map<string, number>;
  pendingProductQty: number;
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
  const holds = await pendingHoldsBySizeId(
    db,
    sizes.map((s) => s.id),
  );
  const pendingBySizeId = new Map(
    [...holds].map(([sizeId, hold]) => [sizeId, hold.units]),
  );
  const pendingProductQty = (await pendingHoldForProduct(db, id)).units;
  return { product, sizes, colors, images, pendingBySizeId, pendingProductQty };
}

function stockSummary(
  row: ProductRow,
  activeSizes: ProductSizeRow[],
): { soldOut: boolean; remaining: number | null } {
  if (activeSizes.length === 0) {
    return { soldOut: row.stockQty === 0, remaining: row.stockQty };
  }
  return {
    soldOut: activeSizes.every((s) => s.stockQty === 0),
    remaining: activeSizes.some((s) => s.stockQty === null)
      ? null
      : activeSizes.reduce((total, s) => total + (s.stockQty ?? 0), 0),
  };
}

// Liste admin avec récap variantes (tailles/coloris ACTIFS) et prix « dès ».
export async function listProductsForAdmin(db: Db): Promise<
  {
    row: ProductRow;
    sizeCount: number;
    colorCount: number;
    fromCents: number;
    soldOut: boolean;
    remaining: number | null;
  }[]
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
    return {
      row,
      sizeCount: s.length,
      colorCount: c.length,
      fromCents,
      ...stockSummary(row, s),
    };
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
