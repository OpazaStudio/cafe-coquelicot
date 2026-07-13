"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "../login/actions";
import { AdminNav } from "./admin-nav";

// Sidebar responsive : colonne fixe sur desktop, drawer hors-champ sur mobile
// (barre supérieure + burger). Le layout parent reste un Server Component ;
// seule cette coquille de navigation a besoin d'état client.
export function AdminSidebar() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const asideRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Drawer ouvert (mobile) : piège le focus, ferme sur Échap, verrouille le
  // scroll du fond. Ne s'exécute jamais sur desktop (open reste false).
  useEffect(() => {
    if (!open) return;
    const aside = asideRef.current;
    if (!aside) return;

    const visibleFocusables = () =>
      Array.from(
        aside.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    visibleFocusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = visibleFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Restaure le focus sur le burger quand le drawer se referme.
  useEffect(() => {
    if (wasOpen.current && !open) burgerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      {/* Barre supérieure mobile */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        <button
          ref={burgerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          aria-controls="admin-sidebar"
          className="inline-flex size-10 items-center justify-center rounded-lg text-ink transition hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <p className="text-lg font-semibold tracking-tight text-wine">
          coquelicot
        </p>
      </div>

      {/* Voile (mobile, drawer ouvert) */}
      {open && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={close}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar : drawer translaté sur mobile, colonne sticky sur desktop */}
      <aside
        ref={asideRef}
        id="admin-sidebar"
        aria-label="Navigation du back-office"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 ease-out motion-reduce:transition-none md:sticky md:top-0 md:z-auto md:h-screen md:w-56 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between px-5 py-5">
          <div>
            <p className="text-xl font-semibold tracking-tight text-wine">
              coquelicot
            </p>
            <p className="text-xs text-muted">back-office</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer le menu"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Refermer le drawer après un choix de navigation (mobile). */}
        <div onClick={close}>
          <AdminNav />
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-line p-3">
          <Link
            href="/"
            onClick={close}
            className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-hover motion-reduce:transition-none"
          >
            ← Voir le site
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-hover motion-reduce:transition-none"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
