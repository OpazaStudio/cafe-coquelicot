"use client";

import { useEffect, useState } from "react";
import { isGaEnabled } from "@/lib/analytics/gtag";
import {
  CONSENT_REOPEN_EVENT,
  readConsent,
  saveConsent,
  type ConsentChoice,
} from "@/lib/analytics/consent";

/**
 * Bandeau de consentement cookies (mesure d'audience GA4). S'affiche tant
 * qu'aucun choix n'a été fait, et peut être rouvert depuis le footer (lien
 * « Gérer les cookies » → événement CONSENT_REOPEN_EVENT). Refuser est aussi
 * accessible qu'accepter (CNIL).
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isGaEnabled) return;
    // Décision client-only : le choix vit dans localStorage, invisible au SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (readConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
  }, []);

  if (!isGaEnabled || !open) return null;

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice);
    setOpen(false);
  };

  return (
    <div
      className="cookie-banner"
      role="dialog"
      aria-label="Consentement aux cookies"
    >
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          On utilise un cookie de <strong>mesure d&apos;audience</strong> (Google
          Analytics) pour comprendre ce qui plaît sur le site — rien de
          publicitaire. Vous pouvez refuser sans rien perdre.
        </p>
        <div className="cookie-banner__actions">
          <button
            type="button"
            className="btn"
            onClick={() => choose("denied")}
          >
            Refuser
          </button>
          <button
            type="button"
            className="btn btn--filled"
            onClick={() => choose("granted")}
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
