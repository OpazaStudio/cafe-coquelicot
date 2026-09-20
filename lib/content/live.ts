"use client";

import { useEffect, useRef, useState } from "react";
import type { ContentFor, PageSlug } from "./registry";

export const CONTENT_MESSAGE = "coquelicot:content";
export const READY_MESSAGE = "coquelicot:preview-ready";

export type ContentMessage = { type: typeof CONTENT_MESSAGE; page: PageSlug; data: unknown };
export type ReadyMessage = { type: typeof READY_MESSAGE; page: PageSlug };

let registryPromise: Promise<typeof import("./registry")> | undefined;

function importRegistry() {
  if (!registryPromise) registryPromise = import("./registry");
  return registryPromise;
}

export function useLiveContent<P extends PageSlug>(page: P, initial: ContentFor<P>): ContentFor<P> {
  const [data, setData] = useState(initial);
  const initialRef = useRef(initial);

  useEffect(() => {
    if (initialRef.current !== initial) {
      initialRef.current = initial;
      setData(initial);
    }
  }, [initial]);

  useEffect(() => {
    if (window.parent === window) return;

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data as Partial<ContentMessage> | null;
      if (!message || message.type !== CONTENT_MESSAGE || message.page !== page) return;
      const { PAGES } = await importRegistry();
      const parsed = PAGES[page].shape.safeParse(message.data);
      if (parsed.success) setData(parsed.data as ContentFor<P>);
    };
    window.addEventListener("message", onMessage);
    const ready: ReadyMessage = { type: READY_MESSAGE, page };
    window.parent.postMessage(ready, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [page]);

  return data;
}
