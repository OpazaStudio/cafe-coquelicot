import type { OrderStatus } from "@/lib/db/schema";
import { STATUS_LABELS } from "@/lib/order-status";
import { pillBase } from "../ui";

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  preparing: "bg-blue-100 text-blue-800",
  shipped: "bg-violet-100 text-violet-800",
  picked_up: "bg-fill text-ink",
  cancelled: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`${pillBase} ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
