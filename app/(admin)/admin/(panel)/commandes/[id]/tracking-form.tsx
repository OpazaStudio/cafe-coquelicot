"use client";

import { useActionState } from "react";
import { btnPrimary, input } from "../../ui";
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
        className={`${input} sm:flex-1`}
      />
      <button type="submit" disabled={pending} className={btnPrimary}>
        Enregistrer
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
