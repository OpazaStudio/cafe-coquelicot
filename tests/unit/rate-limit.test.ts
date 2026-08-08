import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("autorise jusqu'à la limite puis bloque", () => {
    const limit = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limit("ip-a", 0).ok).toBe(true);
    expect(limit("ip-a", 10).ok).toBe(true);
    expect(limit("ip-a", 20).ok).toBe(true);
    expect(limit("ip-a", 30).ok).toBe(false);
  });

  it("indique le délai d'attente restant quand il bloque", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 1000 });
    limit("ip-b", 0);
    const res = limit("ip-b", 400);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryAfterMs).toBe(600);
  });

  it("réautorise une fois la fenêtre écoulée", () => {
    const limit = createRateLimiter({ limit: 2, windowMs: 1000 });
    limit("ip-c", 0);
    limit("ip-c", 100);
    expect(limit("ip-c", 500).ok).toBe(false);
    expect(limit("ip-c", 1101).ok).toBe(true);
  });

  it("compte chaque clé indépendamment", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limit("ip-d", 0).ok).toBe(true);
    expect(limit("ip-e", 0).ok).toBe(true);
    expect(limit("ip-d", 1).ok).toBe(false);
  });

  it("libère la mémoire des clés dont la fenêtre est passée", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 1000 });
    limit("ephemere", 0);
    expect(limit.size()).toBe(1);
    limit("autre", 5000); // un appel ultérieur purge les clés expirées
    expect(limit.size()).toBe(1);
  });
});
