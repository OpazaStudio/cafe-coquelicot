import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import {
  products,
  type ProductCategory,
  type ProductRow,
} from "./db/schema";
import { HOME_PICKS, SEED_PRODUCTS } from "./db/seed-data";
import { formatFromPrice } from "./money";

// Forme consommée par les cartes produit (boutique + home). Les composants
// client n'importent ce module que via `import type` (le client db reste côté serveur).
export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  tag: string;
  desc: string;
  price: string; // affichage historique « dès 48€ »
  priceCents: number;
  variant: number;
  badge: string | null;
  category: ProductCategory;
};

export function toShopProduct(row: ProductRow): ShopProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tag: row.tag,
    desc: row.description,
    price: formatFromPrice(row.priceCents),
    priceCents: row.priceCents,
    variant: row.illustrationVariant,
    badge: row.badge,
    category: row.category,
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

export const getActiveProducts = cache(async (): Promise<ShopProduct[]> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.createdAt));
  return rows.sort(bySeedOrder).map(toShopProduct);
});

// Sélection de la home, dans l'ordre de HOME_PICKS.
export const getHomeProducts = cache(async (): Promise<ShopProduct[]> => {
  const all = await getActiveProducts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  return HOME_PICKS.flatMap((slug) => bySlug.get(slug) ?? []);
});

// ── Requêtes back-office (produits inactifs inclus) ──────────────

export async function getAllProductRows(): Promise<ProductRow[]> {
  const db = await getDb();
  const rows = await db.select().from(products).orderBy(asc(products.createdAt));
  return rows.sort(bySeedOrder);
}

export async function getProductRow(id: string): Promise<ProductRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export const getProductBySlug = cache(
  async (slug: string): Promise<ShopProduct | null> => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return rows[0] ? toShopProduct(rows[0]) : null;
  },
);
