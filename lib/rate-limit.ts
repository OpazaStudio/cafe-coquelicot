// Limiteur de débit en mémoire, fenêtre glissante.
//
// Portée assumée : la mémoire n'est pas partagée entre instances serverless,
// donc le plafond est effectif « par instance ». À l'échelle de trafic de la
// boutique une seule instance reste chaude la plupart du temps, ce qui suffit
// à casser une force brute (qui a besoin de milliers d'essais/minute).
// Si le trafic grandit, remplacer le Map par un store partagé (Vercel KV,
// Upstash ou une table Postgres) sans changer cette interface.

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

export type RateLimiter = ((key: string, now?: number) => RateLimitResult) & {
  /** Efface le compteur d'une clé (ex. après une authentification réussie). */
  reset: (key: string) => void;
  size: () => number;
};

export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  const limiter = (key: string, now = Date.now()): RateLimitResult => {
    const since = now - windowMs;

    // Purge globale : sans elle, une clé vue une fois resterait à vie.
    for (const [k, times] of hits) {
      const kept = times.filter((t) => t > since);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }

    const times = hits.get(key) ?? [];
    if (times.length >= limit) {
      return { ok: false, retryAfterMs: times[0] + windowMs - now };
    }
    times.push(now);
    hits.set(key, times);
    return { ok: true, remaining: limit - times.length };
  };

  limiter.reset = (key: string) => {
    hits.delete(key);
  };
  limiter.size = () => hits.size;
  return limiter;
}

// ── Plafonds de l'application ────────────────────────────────────────

export const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const CONTACT_MESSAGE_LIMIT = 3;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;

// Singletons sur globalThis : survivent au HMR de `next dev` et aux
// réévaluations de module du bundler (sinon le compteur repart à zéro).
const globalForLimits = globalThis as unknown as {
  __coquelicotLoginLimiter?: RateLimiter;
  __coquelicotContactLimiter?: RateLimiter;
};

export const loginLimiter: RateLimiter = (globalForLimits.__coquelicotLoginLimiter ??=
  createRateLimiter({ limit: LOGIN_ATTEMPT_LIMIT, windowMs: LOGIN_WINDOW_MS }));

export const contactLimiter: RateLimiter =
  (globalForLimits.__coquelicotContactLimiter ??= createRateLimiter({
    limit: CONTACT_MESSAGE_LIMIT,
    windowMs: CONTACT_WINDOW_MS,
  }));
