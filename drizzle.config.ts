import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    // Requis uniquement pour `drizzle-kit migrate` (Supabase) ; `generate` s'en passe.
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/coquelicot",
  },
});
