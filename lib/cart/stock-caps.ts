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

export const ADD_CAP_TIMEOUT_MS = 2500;

export const BUSY_LABEL_DELAY_MS = 150;

export type AddCapReason =
  | "uncapped"
  | "capped"
  | "none_left"
  | "unavailable"
  | "size_required";

export type AddCap = { qty: number; asked: number; reason: AddCapReason };

type AnswerRow = { slug: string; sizeId: string | null; maxQty: number | null; reason?: string };

function matchingRow(
  answer: unknown,
  line: { slug: string; sizeId: string | null },
): AnswerRow | null {
  if (!Array.isArray(answer)) return null;
  for (const raw of answer) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const sizeId = typeof row.sizeId === "string" ? row.sizeId : null;
    if (row.slug !== line.slug || sizeId !== line.sizeId) continue;
    if (row.maxQty !== null && !Number.isInteger(row.maxQty)) continue;
    return {
      slug: line.slug,
      sizeId,
      maxQty: row.maxQty as number | null,
      reason: typeof row.reason === "string" ? row.reason : undefined,
    };
  }
  return null;
}

function heldInCart(items: Cart, line: { slug: string; sizeId: string | null }): number {
  const wanted = stockKeyOf(line);
  return items.reduce(
    (total, item) => (stockKeyOf(item) === wanted ? total + item.qty : total),
    0,
  );
}

export function resolveAddCap(
  answer: unknown,
  items: Cart,
  line: { slug: string; sizeId: string | null },
  asked: number,
): AddCap {
  const uncapped: AddCap = { qty: asked, asked, reason: "uncapped" };
  const row = matchingRow(answer, line);
  if (row === null) return uncapped;
  if (row.reason === "size_required") return { qty: 0, asked, reason: "size_required" };
  if (row.maxQty === null || row.maxQty < 0) return uncapped;
  const room = Math.max(0, row.maxQty - heldInCart(items, line));
  if (room >= asked) return uncapped;
  if (room > 0) return { qty: room, asked, reason: "capped" };
  return { qty: 0, asked, reason: row.maxQty === 0 ? "unavailable" : "none_left" };
}

export async function checkAddCap(
  cartNow: () => Cart,
  line: { slug: string; sizeId: string | null },
  asked: number,
): Promise<AddCap> {
  const uncapped: AddCap = { qty: asked, asked, reason: "uncapped" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = Symbol("expired");
  try {
    const answer = await Promise.race([
      cartAvailability([line]),
      new Promise<typeof expired>((resolve) => {
        timer = setTimeout(() => resolve(expired), ADD_CAP_TIMEOUT_MS);
      }),
    ]);
    if (answer === expired) return uncapped;
    return resolveAddCap(answer, cartNow(), line, asked);
  } catch {
    return uncapped;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function addCapNotice(cap: AddCap): string | null {
  switch (cap.reason) {
    case "capped":
      return `Stock limité : ${cap.qty} ajouté${cap.qty > 1 ? "s" : ""} au panier au lieu de ${cap.asked}.`;
    case "none_left":
      return "Votre panier contient déjà tout ce qui reste disponible.";
    case "unavailable":
      return "Cet article n'est plus disponible : rien n'a été ajouté au panier.";
    case "size_required":
      return "Les tailles de cet article ont changé : rechargez la page pour en choisir une.";
    default:
      return null;
  }
}
