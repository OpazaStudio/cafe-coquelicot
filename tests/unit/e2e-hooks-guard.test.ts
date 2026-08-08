// @vitest-environment node
// La route de hooks e2e crée des commandes `paid` sans authentification.
//
// La garde ne peut pas s'appuyer sur NODE_ENV : les e2e tournent justement
// contre un build de production (playwright.config.ts → build && start).
// On exige donc, en plus du flag, l'absence de DATABASE_URL — c'est-à-dire
// une base PGlite jetable. En déploiement réel DATABASE_URL est obligatoire,
// donc un E2E_TEST_HOOKS=1 ayant fuité dans un env group ne suffit jamais.
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/e2e/orders/route";

function post() {
  return POST(
    new Request("http://localhost/api/e2e/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Camille", items: [{ slug: "rivage", qty: 1 }] }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/e2e/orders", () => {
  it("répond 404 quand une vraie base est configurée, même avec le flag", async () => {
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@db.example.com:5432/prod");
    expect((await post()).status).toBe(404);
  });

  it("répond 404 quand le flag est absent", async () => {
    vi.stubEnv("E2E_TEST_HOOKS", "");
    vi.stubEnv("DATABASE_URL", "");
    expect((await post()).status).toBe(404);
  });

  it("répond 404 sur une plateforme d'hébergement, même sans DATABASE_URL", async () => {
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "1");
    expect((await post()).status).toBe(404);
  });

  // NB : NODE_ENV n'est volontairement PAS un critère — le banc e2e tourne
  // contre un build de production. Un déploiement réel sans DATABASE_URL
  // tournerait sur une PGlite éphémère (commandes perdues à chaque
  // redéploiement) : ce n'est pas une configuration de boutique viable.

  it("reste utilisable pour les e2e : flag posé, base PGlite jetable", async () => {
    // Configuration réelle de playwright.config.ts, y compris le build de
    // production (NODE_ENV=production) contre lequel tournent les specs.
    vi.stubEnv("E2E_TEST_HOOKS", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: expect.any(String) });
  });
});
