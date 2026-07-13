"use client";

import { useActionState } from "react";
import { btnPrimary } from "../../ui";
import { generateRelayLabel, type StatusActionState } from "../actions";

export function LabelButton({ orderId, hasLabel }: { orderId: string; hasLabel: boolean }) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(
    async () => generateRelayLabel(orderId),
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Génération…" : hasLabel ? "Régénérer l'étiquette" : "Générer l'étiquette"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>
      )}
    </form>
  );
}
