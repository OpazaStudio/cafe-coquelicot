import type { Metadata } from "next";
import Link from "next/link";
import "../admin.css";
import { logout } from "../login/actions";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  title: "Back-office — Coquelicot",
  robots: { index: false, follow: false },
};

// Pas de contrôle d'auth ici : les layouts ne re-rendent pas à la navigation.
// Chaque page appelle verifySession() (+ le proxy fait un contrôle optimiste).
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-root flex min-h-screen bg-stone-100 text-stone-900">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-xl font-semibold tracking-tight text-wine">
            coquelicot
          </p>
          <p className="text-xs text-stone-500">back-office</p>
        </div>
        <AdminNav />
        <div className="mt-auto flex flex-col gap-1 border-t border-stone-200 p-3">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            ← Voir le site
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
