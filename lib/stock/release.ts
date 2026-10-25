import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/client";
import { orderItems, productSizes, products } from "@/lib/db/schema";
import {
  compareStockKeys,
  reservedStockKey,
  stockKeyToken,
  type StockKeyTable,
} from "@/lib/stock/key-order";

type ReleaseKey = {
  table: StockKeyTable;
  id: string;
  qty: number;
};

export async function restockableUnits(
  db: Db | Tx,
  orderId: string,
): Promise<number> {
  const rows = await db
    .select({
      qty: orderItems.stockReservedQty,
      sizeId: orderItems.stockReservedSizeId,
      productId: orderItems.stockReservedProductId,
      sizeStockQty: productSizes.stockQty,
      productStockQty: products.stockQty,
    })
    .from(orderItems)
    .leftJoin(productSizes, eq(productSizes.id, orderItems.stockReservedSizeId))
    .leftJoin(products, eq(products.id, orderItems.stockReservedProductId))
    .where(
      and(eq(orderItems.orderId, orderId), gt(orderItems.stockReservedQty, 0)),
    );
  return rows.reduce((total, row) => {
    const key = reservedStockKey(row.sizeId, row.productId);
    if (key === null) return total;
    const stockQty =
      key.table === "product_sizes" ? row.sizeStockQty : row.productStockQty;
    return stockQty === null ? total : total + row.qty;
  }, 0);
}

export async function releaseOrderStock(tx: Tx, orderId: string): Promise<number> {
  const reserved = await tx
    .select({
      qty: orderItems.stockReservedQty,
      sizeId: orderItems.stockReservedSizeId,
      productId: orderItems.stockReservedProductId,
    })
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), gt(orderItems.stockReservedQty, 0)),
    );
  if (reserved.length === 0) return 0;

  const keys = new Map<string, ReleaseKey>();
  for (const line of reserved) {
    const key = reservedStockKey(line.sizeId, line.productId);
    if (key === null) continue;
    const token = stockKeyToken(key);
    const found = keys.get(token);
    if (found) {
      found.qty += line.qty;
      continue;
    }
    keys.set(token, { ...key, qty: line.qty });
  }

  const ordered = [...keys.values()].sort(compareStockKeys);

  let credited = 0;
  for (const key of ordered) {
    if (key.table === "product_sizes") {
      const written = await tx
        .update(productSizes)
        .set({ stockQty: sql`${productSizes.stockQty} + ${key.qty}` })
        .where(
          and(eq(productSizes.id, key.id), isNotNull(productSizes.stockQty)),
        )
        .returning({ id: productSizes.id });
      if (written.length > 0) credited += key.qty;
    } else {
      const written = await tx
        .update(products)
        .set({ stockQty: sql`${products.stockQty} + ${key.qty}` })
        .where(and(eq(products.id, key.id), isNotNull(products.stockQty)))
        .returning({ id: products.id });
      if (written.length > 0) credited += key.qty;
    }
  }

  await tx
    .update(orderItems)
    .set({ stockReservedQty: 0 })
    .where(
      and(eq(orderItems.orderId, orderId), gt(orderItems.stockReservedQty, 0)),
    );

  return credited;
}
