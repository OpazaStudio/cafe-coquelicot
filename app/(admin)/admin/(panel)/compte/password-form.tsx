"use client";

import { useActionState } from "react";
import { btnPrimary, input } from "../ui";
import { changePassword, type ChangePasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    undefined,
  );

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Mot de passe actuel</span>
        <input
          type="password"
          name="current"
          required
          autoComplete="current-password"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Nouveau mot de passe</span>
        <input
          type="password"
          name="next"
          required
          minLength={12}
          autoComplete="new-password"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Confirmation</span>
        <input
          type="password"
          name="confirmation"
          required
          autoComplete="new-password"
          className={input}
        />
      </label>
      {state && "error" in state && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p role="status" className="text-sm font-medium text-ink">
          Mot de passe modifié. Vos autres appareils ont été déconnectés.
        </p>
      )}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
