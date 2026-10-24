import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { orderItems, productSizes, products } from "@/lib/db/schema";
import { compareStockKeys, type StockKeyTable } from "@/lib/stock/key-order";

type ReleaseKey = {
  table: StockKeyTable;
  id: string;
  qty: number;
};

export async function releaseOrderStock(tx: Tx, orderId: string): Promise<void> {
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
  if (reserved.length === 0) return;

  const keys = new Map<string, ReleaseKey>();
  for (const line of reserved) {
    const table = line.sizeId ? "product_sizes" : "products";
    const id = line.sizeId ?? line.productId;
    if (!id) continue;
    const found = keys.get(`${table}:${id}`);
    if (found) {
      found.qty += line.qty;
      continue;
    }
    keys.set(`${table}:${id}`, { table, id, qty: line.qty });
  }

  const ordered = [...keys.values()].sort(compareStockKeys);

  for (const key of ordered) {
    if (key.table === "product_sizes") {
      await tx
        .update(productSizes)
        .set({ stockQty: sql`${productSizes.stockQty} + ${key.qty}` })
        .where(
          and(eq(productSizes.id, key.id), isNotNull(productSizes.stockQty)),
        );
    } else {
      await tx
        .update(products)
        .set({ stockQty: sql`${products.stockQty} + ${key.qty}` })
        .where(and(eq(products.id, key.id), isNotNull(products.stockQty)));
    }
  }

  await tx
    .update(orderItems)
    .set({ stockReservedQty: 0 })
    .where(
      and(eq(orderItems.orderId, orderId), gt(orderItems.stockReservedQty, 0)),
    );
}
