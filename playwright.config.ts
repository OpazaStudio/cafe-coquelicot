import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Charge .env.local dans le process runner (identifiants admin, clés Stripe test).
loadEnvConfig(process.cwd());

const PORT = 3105;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Base partagée (PGlite) + specs qui dépendent les uns des autres : séquentiel.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Les e2e tournent contre le build de production (recommandation Next).
    // La base e2e est purgée DANS la commande (séquencé avant le démarrage :
    // un globalSetup peut s'exécuter après le healthcheck du webServer).
    command: `rm -rf .data/pglite-e2e && npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      // Base e2e dédiée (recréée par global-setup) + URL publique du bon port
      // pour les redirections success/cancel de Stripe.
      PGLITE_DATA_DIR: ".data/pglite-e2e",
      NEXT_PUBLIC_SITE_URL: baseURL,
      // Hooks de seed pour les specs kanban (app/api/e2e/orders).
      E2E_TEST_HOOKS: "1",
      // Forcer PGlite (pas Supabase) : .env.local définit DATABASE_URL mais
      // Next.js ne l'écrase pas si la variable est déjà dans process.env.
      DATABASE_URL: "",
      // Pas d'appel Mondial Relay réel en e2e → ensureRelayShipment saute.
      MONDIAL_RELAY_API_URL: "",
      MONDIAL_RELAY_API_LOGIN: "",
      MONDIAL_RELAY_API_PASSWORD: "",
      MONDIAL_RELAY_CUSTOMER_ID: "",
      // Transmettre les clés Stripe au processus serveur (le webServer.env
      // remplace process.env, donc les variables chargées par loadEnvConfig
      // ne sont pas héritées automatiquement).
      ...(process.env.STRIPE_RESTRICTED_KEY
        ? { STRIPE_RESTRICTED_KEY: process.env.STRIPE_RESTRICTED_KEY }
        : {}),
      ...(process.env.STRIPE_SECRET_KEY
        ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY }
        : {}),
      ...(process.env.STRIPE_WEBHOOK_SECRET
        ? { STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET }
        : {}),
      ...(process.env.SESSION_SECRET
        ? { SESSION_SECRET: process.env.SESSION_SECRET }
        : {}),
      ...(process.env.ADMIN_EMAIL
        ? { ADMIN_EMAIL: process.env.ADMIN_EMAIL }
        : {}),
      ...(process.env.ADMIN_PASSWORD_HASH
        ? { ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH }
        : {}),
    },
  },
});
