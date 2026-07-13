"use client";

import { isGaEnabled } from "@/lib/analytics/gtag";
import { CONSENT_REOPEN_EVENT } from "@/lib/analytics/consent";

/** Rouvre le bandeau de consentement (placé dans le footer). */
export function ManageCookiesButton() {
  if (!isGaEnabled) return null;
  return (
    <button
      type="button"
      className="site-footer__cookies"
      onClick={() => window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT))}
    >
      Gérer les cookies
    </button>
  );
}
