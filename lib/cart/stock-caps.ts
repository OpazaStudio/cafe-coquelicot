"use client";

import { useEffect, useMemo, useState } from "react";
import { cartAvailability } from "@/app/panier/availability";
import type { Cart } from "./cart";

export type LineStock = {
  soldOut: boolean;
  sizeRequired: boolean;
  available: number | null;
  atMax: boolean;
  over: boolean;
};

export type CartStock = {
  stockByKey: Map<string, LineStock>;
  blocked: boolean;
};

const UNLIMITED: LineStock = {
  soldOut: false,
  sizeRequired: false,
  available: null,
  atMax: false,
  over: false,
};

const SEPARATOR = "\u0000";

const stockKeyOf = (line: { slug: string; sizeId: string | null }) =>
  `${line.slug}|${line.sizeId ?? ""}`;

function parseStockKey(key: string): { slug: string; sizeId: string | null } {
  const at = key.indexOf("|");
  const sizeId = key.slice(at + 1);
  return { slug: key.slice(0, at), sizeId: sizeId === "" ? null : sizeId };
}

export function useCartStock(items: Cart, ready: boolean): CartStock {
  const [rows, setRows] = useState<Map<string, LineStock>>(new Map());

  const signature = [...new Set(items.map(stockKeyOf))].join(SEPARATOR);
  const lines = useMemo(
    () => (signature === "" ? [] : signature.split(SEPARATOR).map(parseStockKey)),
    [signature],
  );

  useEffect(() => {
    if (!ready || lines.length === 0) return;
    let live = true;
    cartAvailability(lines)
      .then((answer) => {
        if (!live) return;
        setRows(
          new Map(
            answer.map((row) => [
              stockKeyOf(row),
              {
                soldOut: row.maxQty === 0,
                sizeRequired: row.reason === "size_required",
                available: row.maxQty,
                atMax: false,
                over: false,
              },
            ]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lines, ready]);

  return useMemo(() => {
    const asked = new Map<string, number>();
    for (const item of items) {
      const key = stockKeyOf(item);
      asked.set(key, (asked.get(key) ?? 0) + item.qty);
    }
    const stockByKey = new Map<string, LineStock>();
    for (const item of items) {
      const key = stockKeyOf(item);
      const row = rows.get(key);
      if (row === undefined || row.available === null) {
        stockByKey.set(item.key, UNLIMITED);
        continue;
      }
      const wanted = asked.get(key) ?? 0;
      stockByKey.set(item.key, {
        ...row,
        atMax: wanted >= row.available,
        over: wanted > row.available,
      });
    }
    return {
      stockByKey,
      blocked: [...stockByKey.values()].some(
        (stock) => stock.soldOut || stock.sizeRequired || stock.over,
      ),
    };
  }, [items, rows]);
}

export function stockNotice(stock: LineStock | undefined): string | null {
  if (stock === undefined) return null;
  if (stock.sizeRequired) return "Choix de taille requis";
  if (stock.soldOut) return "Épuisé";
  if (stock.available === null) return null;
  if (stock.over) {
    return `Plus que ${stock.available} disponible${stock.available > 1 ? "s" : ""}`;
  }
  if (stock.atMax) return `Plus que ${stock.available} en stock`;
  return null;
}
