// Consent Mode v2 (RGPD/CNIL) — état du consentement « mesure d'audience ».
// Le site n'a AUCUNE publicité : seule la catégorie analytics est négociée,
// les paramètres ad_* restent toujours `denied`. La valeur par défaut (avant
// tout choix) est posée en `beforeInteractive` par <ConsentDefaultScript>.

export const CONSENT_STORAGE_KEY = "coquelicot.consent.v1";
/** Événement custom déclenché par le lien « Gérer les cookies » du footer. */
export const CONSENT_REOPEN_EVENT = "coquelicot:consent:reopen";

export type ConsentChoice = "granted" | "denied";

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

export function readConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Pousse un `consent: update` dans le dataLayer (analytics uniquement). */
export function applyConsent(choice: ConsentChoice): void {
  const w = window as GtagWindow;
  const update = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: choice,
  };
  if (typeof w.gtag === "function") {
    w.gtag("consent", "update", update);
  } else {
    (w.dataLayer = w.dataLayer ?? []).push(["consent", "update", update]);
  }
}

/** Mémorise le choix puis l'applique immédiatement à GA4. */
export function saveConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // stockage indisponible (navigation privée) : valable pour la session.
  }
  applyConsent(choice);
}
