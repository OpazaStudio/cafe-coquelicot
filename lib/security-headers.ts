// En-têtes de sécurité appliqués à toutes les réponses (next.config.ts).
// Module pur, sans import Next : testable unitairement.
//
// Périmètre volontairement limité au durcissement sans risque fonctionnel.
// La CSP se borne à `frame-ancestors` : une CSP complète (script-src) casserait
// gtag.js, le widget Mondial Relay (jQuery + plugin externe) et la redirection
// Stripe tant qu'ils n'ont pas été inventoriés — chantier à part.

export type HttpHeader = { key: string; value: string };

export function securityHeaders(
  isProduction = process.env.NODE_ENV === "production",
): HttpHeader[] {
  const headers: HttpHeader[] = [
    // Anti-clickjacking : le back-office ne doit jamais être embarquable
    // (clics volés sur « Supprimer » ou sur un changement de statut).
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    // Doublon volontaire : navigateurs sans support de frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // `geolocation` reste autorisée : le widget Mondial Relay l'utilise pour
    // le « autour de moi » de la recherche de point relais.
    { key: "Permissions-Policy", value: "camera=(), microphone=()" },
  ];

  // HSTS uniquement en production : inutile en dev (http), et `includeSubDomains`
  // sur localhost gênerait d'autres projets du poste.
  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}
