import Script from "next/script";
import { CONSENT_STORAGE_KEY } from "@/lib/analytics/consent";

// Consent Mode v2 — état par défaut (TOUT refusé, RGPD/CNIL) posé par un
// script inline en `beforeInteractive` : Next l'injecte dans le <head> du HTML
// initial, donc il s'exécute avant le code Next et avant les scripts
// `afterInteractive` de <GoogleAnalytics> (init gtag + gtag.js). Le
// `consent: default` est ainsi dans le dataLayer avant le `config`. On restaure
// un accord déjà donné pour ne pas redemander aux visiteurs de retour.
const CONSENT_DEFAULT_JS = `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
var c = 'denied';
try { if (localStorage.getItem('${CONSENT_STORAGE_KEY}') === 'granted') c = 'granted'; } catch (e) {}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: c,
  wait_for_update: 500
});
gtag('set', 'url_passthrough', true);
gtag('set', 'ads_data_redaction', true);
`;

export function ConsentDefaultScript() {
  // `id` obligatoire pour un script inline (suivi/dédoublonnage par Next).
  return (
    <Script
      id="consent-default"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_JS }}
    />
  );
}
