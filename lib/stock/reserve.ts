import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { InsufficientStockError } from "@/lib/checkout/errors";
import type { Tx } from "@/lib/db/client";
import { productSizes, products } from "@/lib/db/schema";
import { composeItemName } from "@/lib/item-label";
import {
  compareStockKeys,
  reservedStockKey,
  stockKeyToken,
  type StockKey as StockKeyRef,
  type StockKeyTable,
} from "@/lib/stock/key-order";

export type StockReservation = {
  orderItemIndex: number;
  reservedQty: number;
  sizeId: string | null;
  productId: string | null;
};

type StockKey = {
  table: StockKeyTable;
  id: string;
  productId: string;
  qty: number;
  productName: string;
  sizeLabel: string | null;
  lineIndexes: number[];
};

async function availableFor(tx: Tx, key: StockKeyRef): Promise<number | null> {
  if (key.table === "product_sizes") {
    const [row] = await tx
      .select({ stockQty: productSizes.stockQty })
      .from(productSizes)
      .where(eq(productSizes.id, key.id));
    return row?.stockQty ?? null;
  }
  const [row] = await tx
    .select({ stockQty: products.stockQty })
    .from(products)
    .where(eq(products.id, key.id));
  return row?.stockQty ?? null;
}

export async function reserveStock(
  tx: Tx,
  lines: Array<{
    productId: string;
    sizeId: string | null;
    qty: number;
    productName: string;
    sizeLabel: string | null;
  }>,
): Promise<StockReservation[]> {
  const keys = new Map<string, StockKey>();
  lines.forEach((line, index) => {
    const { table, id } = reservedStockKey(line.sizeId, line.productId);
    const token = stockKeyToken({ table, id });
    const found = keys.get(token);
    if (found) {
      found.qty += line.qty;
      found.lineIndexes.push(index);
      return;
    }
    keys.set(token, {
      table,
      id,
      productId: line.productId,
      qty: line.qty,
      productName: line.productName,
      sizeLabel: line.sizeLabel,
      lineIndexes: [index],
    });
  });

  const ordered = [...keys.values()].sort(compareStockKeys);

  const reservations: StockReservation[] = [];
  for (const key of ordered) {
    let decremented: { stockQty: number | null }[];
    if (key.table === "product_sizes") {
      decremented = await tx
        .update(productSizes)
        .set({ stockQty: sql`${productSizes.stockQty} - ${key.qty}` })
        .where(
          and(
            eq(productSizes.id, key.id),
            eq(productSizes.productId, key.productId),
            eq(productSizes.active, true),
            or(isNull(productSizes.stockQty), gte(productSizes.stockQty, key.qty)),
          ),
        )
        .returning({ stockQty: productSizes.stockQty });
    } else {
      decremented = await tx
        .update(products)
        .set({ stockQty: sql`${products.stockQty} - ${key.qty}` })
        .where(
          and(
            eq(products.id, key.id),
            or(isNull(products.stockQty), gte(products.stockQty, key.qty)),
          ),
        )
        .returning({ stockQty: products.stockQty });
    }

    if (decremented.length === 0) {
      const available = await availableFor(tx, key);
      throw new InsufficientStockError(
        `Stock insuffisant pour ${composeItemName(key.productName, key.sizeLabel)} ` +
          `(${key.qty} demandé${key.qty > 1 ? "s" : ""}). ` +
          (available === 0
            ? `Retirez-le du panier.`
            : `Réduisez la quantité ou retirez-le du panier.`),
        stockKeyToken(key),
        key.productName,
        key.sizeLabel,
      );
    }
    if (decremented[0].stockQty === null) continue;

    for (const index of key.lineIndexes) {
      reservations.push({
        orderItemIndex: index,
        reservedQty: lines[index].qty,
        sizeId: key.table === "product_sizes" ? key.id : null,
        productId: key.table === "products" ? key.id : null,
      });
    }
  }
  return reservations;
}
