import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { listContactSubmissions } from "@/lib/contact-submissions";
import { getDb } from "@/lib/db/client";
import { card, pillBase, rowAction } from "../ui";
import { deleteSubmission, toggleSubmissionRead } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SoumissionsPage() {
  await verifySession();
  const rows = await listContactSubmissions(await getDb());
  const unread = rows.filter((r) => r.readAt === null).length;
  const notMailed = rows.filter((r) => !r.emailSent).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Copie de chaque message envoyé depuis le{" "}
          <Link href="/contact" className="underline">
            formulaire de contact
          </Link>
          , enregistrée avant l&apos;envoi de l&apos;e-mail. Si une notification
          se perd, le message reste ici.
          {rows.length > 0 && (
            <>
              {" "}
              {rows.length} message{rows.length > 1 ? "s" : ""} — {unread} non lu
              {unread > 1 ? "s" : ""}
              {notMailed > 0 && `, ${notMailed} sans e-mail`}.
            </>
          )}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className={`${card} p-10 text-center text-muted`}>
          Aucun message pour l&apos;instant — ils apparaîtront ici dès la
          première soumission du formulaire de contact.
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid={`submission-${r.id}`}
              className={`${card} p-5${r.readAt === null ? " border-wine/40" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    {r.readAt === null && (
                      <span className={`${pillBase} bg-wine/10 text-wine`}>
                        Non lu
                      </span>
                    )}
                    {!r.emailSent && (
                      <span className={`${pillBase} bg-danger-bg text-danger`}>
                        E-mail non envoyé
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <a href={`mailto:${r.email}`} className="underline">
                      {r.email}
                    </a>
                    <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="underline">
                      {r.phone}
                    </a>
                    <time dateTime={r.createdAt.toISOString()}>
                      {dateFmt.format(r.createdAt)}
                    </time>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <form action={toggleSubmissionRead.bind(null, r.id, r.readAt === null)}>
                    <button
                      type="submit"
                      className={`${rowAction} text-muted hover:bg-stone-100`}
                    >
                      {r.readAt === null ? "Marquer lu" : "Marquer non lu"}
                    </button>
                  </form>
                  <form action={deleteSubmission.bind(null, r.id)}>
                    <button
                      type="submit"
                      className={`${rowAction} text-danger hover:bg-danger-bg`}
                    >
                      Supprimer
                    </button>
                  </form>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap rounded-lg bg-panel p-4 text-sm">
                {r.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
