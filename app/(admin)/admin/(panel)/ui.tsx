import type { ReactNode } from "react";

// Vocabulaire visuel partagé du back-office. Un seul endroit pour la coque
// de carte, les boutons et les pills — évite la dérive (paddings, filets,
// couleurs) et s'appuie sur les tokens sémantiques de admin.css.

/** Coque de carte / panneau (filet + surface). */
export const card = "rounded-xl border border-line bg-surface";

/** Titre de section interne (petite capitale atténuée). */
export const panelTitle =
  "text-sm font-semibold uppercase tracking-wide text-muted";

/** Bouton primaire (action principale, submit). */
export const btnPrimary =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-wine px-4 py-2.5 text-sm font-semibold text-linen transition hover:bg-wine-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-60 motion-reduce:transition-none";

/** Bouton destructif (annuler, supprimer). */
export const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-danger-line px-3.5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60 motion-reduce:transition-none";

/** Action de ligne/tableau — base neutre, la couleur est ajoutée par l'appelant.
 *  min-h-9 (36px) : confortable au tactile tout en restant dense. */
export const rowAction =
  "inline-flex min-h-9 items-center rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none";

/** Champ de saisie — vocabulaire unique du back-office : filet `line`, focus
 *  en outline `wine` (même grammaire que les autres éléments focusables). */
export const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition focus-visible:border-wine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine motion-reduce:transition-none";

/** Base commune des pastilles (badges de statut, Pill) — un seul motif pill. */
export const pillBase =
  "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";

/** Panneau bordé avec titre optionnel. */
export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${card} p-6${className ? ` ${className}` : ""}`}>
      {title && <h2 className={`mb-4 ${panelTitle}`}>{title}</h2>}
      {children}
    </section>
  );
}

/** Pastille d'état simple (statut produit, etc.). */
export function Pill({
  tone,
  children,
}: {
  tone: "positive" | "neutral";
  children: ReactNode;
}) {
  const cls =
    tone === "positive" ? "bg-green-100 text-green-800" : "bg-fill text-ink";
  return (
    <span className={`${pillBase} ${cls}`}>
      {children}
    </span>
  );
}
