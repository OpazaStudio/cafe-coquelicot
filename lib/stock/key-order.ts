export type StockKeyTable = "product_sizes" | "products";

export type StockKey = { table: StockKeyTable; id: string };

export function stockKeyToken(key: StockKey): string {
  return `${key.table}:${key.id}`;
}

export function reservedStockKey(sizeId: string | null, productId: string): StockKey;
export function reservedStockKey(
  sizeId: string | null,
  productId: string | null,
): StockKey | null;
export function reservedStockKey(
  sizeId: string | null,
  productId: string | null,
): StockKey | null {
  const id = sizeId ?? productId;
  if (id === null) return null;
  return { table: sizeId !== null ? "product_sizes" : "products", id };
}

export function compareStockKeys(a: StockKey, b: StockKey): number {
  if (a.table !== b.table) return a.table < b.table ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}
