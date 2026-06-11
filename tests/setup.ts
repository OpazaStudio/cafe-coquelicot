// NODE_ENV=test (vitest) → @next/env charge .env.test + .env, jamais .env.local.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
