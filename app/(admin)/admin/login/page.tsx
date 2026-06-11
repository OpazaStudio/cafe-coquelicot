import type { Metadata } from "next";
import Link from "next/link";
import "../admin.css";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion — Coquelicot admin",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="admin-root flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <main className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="mb-1 text-2xl font-semibold tracking-tight text-wine">
          coquelicot
        </p>
        <h1 className="mb-6 text-sm text-stone-500">
          Back-office — connexion
        </h1>
        <LoginForm />
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-stone-500 underline-offset-2 hover:underline">
            ← Retour au site
          </Link>
        </p>
      </main>
    </div>
  );
}
