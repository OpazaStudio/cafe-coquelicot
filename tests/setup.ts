// NODE_ENV=test (vitest) → @next/env charge .env.test + .env, jamais .env.local.
import { loadEnvConfig } from "@next/env";
import { vi } from "vitest";

loadEnvConfig(process.cwd());

// Le marker package "server-only" throw dès qu'il est résolu sans la condition
// "react-server" (absente sous Vitest/Vite) — no-op pour permettre de tester
// les modules serveur (ex. lib/storage.ts) sans les mocker entièrement.
vi.mock("server-only", () => ({}));
