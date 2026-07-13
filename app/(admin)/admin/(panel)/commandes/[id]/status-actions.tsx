"use client";

import { useActionState } from "react";
import type { Fulfillment, OrderStatus } from "@/lib/db/schema";
import { statusTransitions, STATUS_LABELS } from "@/lib/order-status";
import { btnDanger, btnPrimary } from "../../ui";
import { changeOrderStatus, type StatusActionState } from "../actions";

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  paid: "Marquer payée",
  preparing: "Passer en préparation",
  shipped: "Marquer expédiée",
  picked_up: "Marquer retirée",
  cancelled: "Annuler la commande",
};

export function StatusActions({
  orderId,
  status,
  fulfillment,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
}) {
  const [state, action, pending] = useActionState<
    StatusActionState,
    FormData
  >(async (_prev, formData) => {
    return changeOrderStatus(orderId, String(formData.get("to")));
  }, undefined);

  const targets = statusTransitions(status, fulfillment);
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted">
        Statut final — plus aucune transition possible.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {targets.map((to) => (
        <button
          key={to}
          type="submit"
          name="to"
          value={to}
          disabled={pending}
          className={to === "cancelled" ? btnDanger : btnPrimary}
        >
          {ACTION_LABELS[to] ?? STATUS_LABELS[to]}
        </button>
      ))}
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
