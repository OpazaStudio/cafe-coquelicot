"use client";

import type { OrderRow } from "@/lib/db/schema";

export function KanbanBoard({ orders }: { orders: OrderRow[] }) {
  return (
    <p className="text-sm text-stone-500">
      {orders.length} carte{orders.length > 1 ? "s" : ""} — board en
      construction.
    </p>
  );
}
