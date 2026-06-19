"use client";

import { useActionState } from "react";
import { saveTrackingNumber, type StatusActionState } from "../actions";

export function TrackingForm({
  orderId,
  trackingNumber,
}: {
  orderId: string;
  trackingNumber: string | null;
}) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(
    async (_prev, formData) =>
      saveTrackingNumber(orderId, String(formData.get("trackingNumber") ?? "")),
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="trackingNumber"
        defaultValue={trackingNumber ?? ""}
        placeholder="N° de suivi Mondial Relay"
        maxLength={40}
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-wine px-3.5 py-2 text-sm font-semibold text-linen transition hover:bg-wine-dark disabled:opacity-60"
      >
        Enregistrer
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
