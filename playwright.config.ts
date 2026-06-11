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
    },
  },
});
