import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Drivers Postgres chargés via require natif (PGlite embarque du WASM).
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
};

export default nextConfig;
