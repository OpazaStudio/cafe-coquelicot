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

const RESTOCK_LABEL = "Remettre en stock les unités réservées par cette commande";

export function StatusActions({
  orderId,
  status,
  fulfillment,
  canRestock,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  canRestock: boolean;
}) {
  const [state, action, pending] = useActionState<
    StatusActionState,
    FormData
  >(async (_prev, formData) => {
    const to = String(formData.get("to"));
    return changeOrderStatus(
      orderId,
      to,
      to === "cancelled" && formData.get("restock") === "on",
    );
  }, undefined);

  const messages = (
    <>
      {state?.ok && (
        <p role="status" className="text-sm font-medium text-ink">
          {state.ok}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
    </>
  );

  const targets = statusTransitions(status, fulfillment);
  if (targets.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          Statut final — plus aucune transition possible.
        </p>
        {messages}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {status === "paid" && canRestock && (
        <label className="flex basis-full items-center gap-2.5">
          <input
            type="checkbox"
            name="restock"
            className="size-5 accent-wine focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <span className="text-sm font-medium text-ink">{RESTOCK_LABEL}</span>
        </label>
      )}
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
      {messages}
    </form>
  );
}
