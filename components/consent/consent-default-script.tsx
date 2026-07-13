import { CONSENT_STORAGE_KEY } from "@/lib/analytics/consent";

// Consent Mode v2 — état par défaut (TOUT refusé, RGPD/CNIL) posé par un
// <script> inline SYNCHRONE en tête de <body>. Il s'exécute avant gtag.js
// (chargé en `async` par <GoogleAnalytics>), donc le `consent: default` est en
// file d'attente du dataLayer avant le `config`. On restaure un accord déjà
// donné pour ne pas redemander aux visiteurs de retour.
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
  return <script dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_JS }} />;
}
