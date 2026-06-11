"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          placeholder="lea@coquelicot-lr.fr"
          className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-wine focus:ring-2 focus:ring-wine/15"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">
          Mot de passe
        </span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-wine focus:ring-2 focus:ring-wine/15"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-wine px-4 py-2.5 font-semibold text-linen transition hover:bg-wine-dark disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
