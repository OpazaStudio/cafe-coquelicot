export type LoggedStatement = { sql: string; params: unknown[] };

export function collectStatements(statements: LoggedStatement[]): {
  logQuery: (sql: string, params: unknown[]) => void;
} {
  return { logQuery: (sql, params) => statements.push({ sql, params }) };
}

const STOCK_WRITE = /update "(product_sizes|products)" set "stock_qty"/;

export function stockWriteOrder(
  statements: LoggedStatement[],
  keys: readonly string[],
): string[] {
  const known = new Set<unknown>(keys);
  return statements.flatMap((statement) => {
    const table = STOCK_WRITE.exec(statement.sql);
    if (table === null) return [];
    const id = statement.params.find((value) => known.has(value));
    return id === undefined ? [] : [`${table[1]}:${String(id)}`];
  });
}
