import type { Metadata } from "next";
import "../admin.css";
import { AdminSidebar } from "./admin-sidebar";

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
    <div className="admin-root min-h-screen bg-canvas text-ink md:flex">
      <AdminSidebar />
      <main
        id="contenu"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8"
      >
        {children}
      </main>
    </div>
  );
}
