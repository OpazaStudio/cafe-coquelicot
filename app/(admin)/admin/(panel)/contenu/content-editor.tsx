"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_MESSAGE, READY_MESSAGE, type ContentMessage } from "@/lib/content/live";
import { PAGES, PAGE_SLUGS, adminHref, type PageSlug } from "@/lib/content/registry";
import { Panel, btnPrimary } from "../ui";
import { ContentFields } from "./content-fields";
import { PreviewFrame } from "./preview-frame";
import type { ContentState } from "./actions";

type Doc = Record<string, unknown>;
type ContentAction = (prev: ContentState, formData: FormData) => Promise<ContentState>;

export function ContentEditor({ page, initial, action }: { page: PageSlug; initial: Doc; action: ContentAction }) {
  const { def } = PAGES[page];
  const [draft, setDraft] = useState<Doc>(initial);
  const [saved, setSaved] = useState<Doc>(initial);
  const [state, formAction, pending] = useActionState<ContentState, FormData>(action, undefined);
  const [tab, setTab] = useState<"form" | "preview">("form");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const submittedRef = useRef<Doc>(initial);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const send = useCallback(() => {
    const message: ContentMessage = { type: CONTENT_MESSAGE, page, data: draft };
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [draft, page]);

  useEffect(() => {
    send();
  }, [send]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; page?: unknown } | null;
      if (data?.type === READY_MESSAGE && data.page === page) send();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send, page]);

  useEffect(() => {
    if (state && "ok" in state) {
      setSaved(submittedRef.current);
      frameRef.current?.contentWindow?.location.reload();
    }
  }, [state]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contenu du site</h1>
          <p className="mt-1 text-sm text-muted">
            Modifiez les textes et les photos : l&apos;aperçu se met à jour pendant la saisie, le site après « Enregistrer ».
          </p>
        </div>
      </div>

      <nav aria-label="Pages" className="flex flex-wrap gap-1 border-b border-line">
        {PAGE_SLUGS.map((slug) => (
          <Link
            key={slug}
            href={adminHref(slug)}
            aria-current={slug === page ? "page" : undefined}
            onClick={(e) => {
              if (dirty && !window.confirm("Modifications non enregistrées. Quitter sans enregistrer ?")) {
                e.preventDefault();
              }
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${slug === page ? "border-wine text-wine" : "border-transparent text-muted hover:text-ink"}`}
          >
            {PAGES[slug].def.label}
          </Link>
        ))}
      </nav>

      <div className="flex gap-1 xl:hidden">
        <button type="button" aria-pressed={tab === "form"} onClick={() => setTab("form")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "form" ? "bg-wine text-linen" : "text-ink hover:bg-hover"}`}>Formulaire</button>
        <button type="button" aria-pressed={tab === "preview"} onClick={() => setTab("preview")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "preview" ? "bg-wine text-linen" : "text-ink hover:bg-hover"}`}>Aperçu</button>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
        <form
          action={formAction}
          onSubmit={() => {
            submittedRef.current = draft;
          }}
          className={`flex flex-col gap-4 ${tab === "form" ? "" : "hidden xl:flex"}`}
        >
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="data" value={JSON.stringify(draft)} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            {dirty && !pending && <span className="text-xs text-muted">Modifications non enregistrées</span>}
            {state && "error" in state && (
              <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>
            )}
            <p role="status" className="text-sm font-medium text-ink">
              {state && "ok" in state && !dirty ? "Contenu enregistré." : ""}
            </p>
          </div>
          {Object.entries(def.sections).map(([key, section]) => (
            <Panel key={key} title={section.title}>
              {section.hint && <p className="mb-3 text-xs text-muted">{section.hint}</p>}
              <ContentFields
                fields={section.fields}
                value={(draft[key] as Doc) ?? {}}
                onChange={(next) => setDraft({ ...draft, [key]: next })}
                idPrefix={`${page}-${key}`}
              />
            </Panel>
          ))}
        </form>

        <div className={`min-h-0 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] ${tab === "preview" ? "" : "hidden xl:block"}`}>
          <PreviewFrame ref={frameRef} src={def.previewPath} onLoad={send} />
        </div>
      </div>
    </div>
  );
}
