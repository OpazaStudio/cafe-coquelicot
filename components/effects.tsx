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

// Header theme: switches to --light when a dark section (burgundy, coffee-bean,
// coffee-bean-2) is behind the fixed header. Uses a thin observation strip at
// the top of the viewport so the transition fires exactly when the section
// reaches the header, not earlier.
const DARK_BGS = new Set(["burgundy", "coffee-bean", "coffee-bean-2"]);
const HEADER_HEIGHT = 70; // px — approximate height of .site-header

// The observer only fires when a section enters or leaves the strip. If a
// section's data-bg changes while it sits there — which the colour tweak panel
// does — nothing re-fires, and the header keeps the wrong ink. Whoever mutates
// data-bg says so on this event. Idle cost for a normal visitor: one listener
// that never fires.
const BG_CHANGED = "coquelicot:bg-changed";

function useHeaderTheme() {
  const pathname = usePathname();
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;

    const visible = new Set<Element>();

    const update = () => {
      let isDark = false;
      visible.forEach((el) => {
        if (DARK_BGS.has((el as HTMLElement).dataset.bg ?? "")) isDark = true;
      });
      header.classList.toggle("site-header--light", isDark);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        });
        update();
      },
      {
        rootMargin: `0px 0px -${window.innerHeight - HEADER_HEIGHT}px 0px`,
        threshold: 0,
      }
    );

    document.querySelectorAll("section[data-section]").forEach((el) => io.observe(el));
    window.addEventListener(BG_CHANGED, update);
    return () => {
      io.disconnect();
      window.removeEventListener(BG_CHANGED, update);
    };
  }, [pathname]);
}

export function Effects() {
  useReveal();
  useHeaderTheme();
  return null;
}
