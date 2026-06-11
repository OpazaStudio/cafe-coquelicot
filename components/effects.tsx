"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Reveal-on-scroll: flips .reveal elements to .is-visible as they enter
// the viewport, once each. Mirrors the design prototype's useReveal().
//
// Effects lives in the root layout, which is preserved across client-side
// navigations — so the effect must re-arm whenever the route changes,
// otherwise a freshly navigated page's .reveal elements would never be
// observed and would stay hidden (opacity: 0) until a hard refresh.
function useReveal() {
  const pathname = usePathname();
  useEffect(() => {
    const els = document.querySelectorAll(".reveal:not(.is-visible)");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);
}

export function Effects() {
  useReveal();
  return null;
}
