import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  orderItems,
  orders,
  productSizes,
  products,
  type ProductSizeRow,
} from "@/lib/db/schema";
import { resolveStockKey } from "@/lib/products";
import { reservedStockKey, stockKeyToken } from "@/lib/stock/key-order";

export type CartLine = { slug: string; sizeId: string | null };
export type LineAvailability = CartLine & {
  maxQty: number | null;
  reason?: "size_required";
};

async function ownHolds(db: Db, ownOrderId: string | null): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (ownOrderId === null) return held;
  const rows = await db
    .select({
      sizeId: orderItems.stockReservedSizeId,
      productId: orderItems.stockReservedProductId,
      qty: orderItems.stockReservedQty,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.orderId, ownOrderId),
        eq(orders.status, "pending"),
        gt(orderItems.stockReservedQty, 0),
      ),
    );
  for (const row of rows) {
    const key = reservedStockKey(row.sizeId, row.productId);
    if (key === null) continue;
    const token = stockKeyToken(key);
    held.set(token, (held.get(token) ?? 0) + row.qty);
  }
  return held;
}

export async function cartAvailabilityFor(
  db: Db,
  lines: CartLine[],
  ownOrderId: string | null,
): Promise<LineAvailability[]> {
  const slugs = [...new Set(lines.map((line) => line.slug))];
  if (slugs.length === 0) return [];

  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.slug, slugs), eq(products.active, true)));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const ids = rows.map((row) => row.id);
  const sizes: ProductSizeRow[] = ids.length
    ? await db
        .select()
        .from(productSizes)
        .where(
          and(inArray(productSizes.productId, ids), eq(productSizes.active, true)),
        )
    : [];
  const sizesByProduct = new Map<string, ProductSizeRow[]>();
  for (const size of sizes) {
    const list = sizesByProduct.get(size.productId);
    if (list) list.push(size);
    else sizesByProduct.set(size.productId, [size]);
  }
  const held = await ownHolds(db, ownOrderId);

  return lines.map((line) => {
    const product = bySlug.get(line.slug);
    if (!product) return { ...line, maxQty: 0 };
    const active = sizesByProduct.get(product.id) ?? [];
    if (active.length > 0 && line.sizeId === null) {
      return { ...line, maxQty: 0, reason: "size_required" as const };
    }
    let resolved: ReturnType<typeof resolveStockKey>;
    try {
      resolved = resolveStockKey(product, active, line.sizeId);
    } catch {
      return { ...line, maxQty: 0 };
    }
    return {
      ...line,
      maxQty:
        resolved.stockQty === null
          ? null
          : resolved.stockQty + (held.get(stockKeyToken(resolved)) ?? 0),
    };
  });
}
