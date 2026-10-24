export type StockKeyTable = "product_sizes" | "products";

export function compareStockKeys(
  a: { table: StockKeyTable; id: string },
  b: { table: StockKeyTable; id: string },
): number {
  if (a.table !== b.table) return a.table < b.table ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}
