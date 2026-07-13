// Squelette affiché pendant le chargement serveur des commandes (bascule
// Kanban ↔ Tableau via ?vue=, page en force-dynamic). Structure calquée sur
// l'en-tête + la grille kanban pour éviter le saut de mise en page.
export default function CommandesLoading() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Chargement des commandes…
      </p>

      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        {/* En-tête : titre + sous-titre + bascule de vue */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="h-7 w-40 rounded bg-line" />
            <div className="h-4 w-60 rounded bg-line-soft" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-line" />
        </div>

        {/* Grille kanban : 4 colonnes, quelques cartes fantômes */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, col) => (
            <section
              key={col}
              className="flex min-h-48 flex-col rounded-xl border border-line bg-panel p-3"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="h-4 w-24 rounded bg-line" />
                <div className="size-5 rounded-full bg-line" />
              </div>
              <div className="flex flex-col gap-2">
                {Array.from({ length: col === 0 ? 3 : 2 }, (_, card) => (
                  <div
                    key={card}
                    className="rounded-lg border border-line bg-surface p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-4 w-20 rounded bg-line" />
                      <div className="h-4 w-16 rounded-full bg-line-soft" />
                    </div>
                    <div className="mt-2 h-3.5 w-28 rounded bg-line-soft" />
                    <div className="mt-1.5 h-3 w-24 rounded bg-line-soft" />
                    <div className="mt-3 h-3.5 w-16 rounded bg-line-soft" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
