"use server";

import * as z from "zod";
import { readReservedOrderId } from "@/lib/checkout/reservation";
import { getDb } from "@/lib/db/client";
import {
  cartAvailabilityFor,
  type CartLine,
  type LineAvailability,
} from "@/lib/stock/availability";

const MAX_LINES = 50;

const LineSchema = z.object({
  slug: z.string().min(1).max(120),
  sizeId: z.uuid().nullable(),
});

export async function cartAvailability(
  lines: Array<{ slug: string; sizeId: string | null }>,
): Promise<LineAvailability[]> {
  if (!Array.isArray(lines)) return [];
  const asked: CartLine[] = [];
  for (const line of lines.slice(0, MAX_LINES)) {
    const parsed = LineSchema.safeParse(line);
    if (parsed.success) asked.push(parsed.data);
  }
  if (asked.length === 0) return [];
  return cartAvailabilityFor(await getDb(), asked, await readReservedOrderId());
}
