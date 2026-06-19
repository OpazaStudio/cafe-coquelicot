"use client";

import { useActionState } from "react";
import { generateRelayLabel, type StatusActionState } from "../actions";

export function LabelButton({ orderId, hasLabel }: { orderId: string; hasLabel: boolean }) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(
    async () => generateRelayLabel(orderId),
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-wine px-3.5 py-2 text-sm font-semibold text-linen transition hover:bg-wine-dark disabled:opacity-60"
      >
        {pending ? "Génération…" : hasLabel ? "Régénérer l'étiquette" : "Générer l'étiquette"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>
      )}
    </form>
  );
}
