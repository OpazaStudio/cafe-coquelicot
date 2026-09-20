"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SiteContent } from "@/lib/content/pages/site";
import { CartLink } from "./cart-link";

export function MobileMenu({ nav }: { nav: SiteContent["header"]["nav"] }) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const panelId = useId();
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpenedOn(null);
  const closeAndRefocus = () => {
    close();
    burgerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedOn(null);
        burgerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={burgerRef}
        type="button"
        className="site-header__burger"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenedOn(pathname)}
      >
        <span />
        <span />
      </button>
      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="mobile-menu"
        data-open={open}
        inert={!open}
      >
        <div className="mobile-menu__bar">
          <button
            ref={closeRef}
            type="button"
            className="mobile-menu__close"
            aria-label="Fermer le menu"
            onClick={closeAndRefocus}
          >
            <span />
            <span />
          </button>
        </div>
        <nav className="mobile-menu__nav">
          {nav.map((item, i) => (
            <Link key={i} href={item.href} onClick={close}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mobile-menu__foot">
          <CartLink onClick={close} />
        </div>
      </div>
    </>
  );
}
