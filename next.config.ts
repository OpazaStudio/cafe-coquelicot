import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

// M7 : une URL présente mais malformée ne doit jamais faire planter le build —
// même dégradation (undefined) que le cas « variable absente ».
function getSupabaseHost(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

const supabaseHost = getSupabaseHost();

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Ne pas annoncer la stack au scan automatisé.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  // Drivers Postgres chargés via require natif (PGlite embarque du WASM).
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  // Pas de serverActions.bodySizeLimit : le réglage est GLOBAL (aucun override
  // par action, cf. node_modules/next/dist/docs/.../serverActions.md), donc le
  // relever pour l'upload d'images ouvrait aussi `startCheckout` et
  // `sendContactMessage`, publiques. L'upload est passé en Route Handler
  // (app/api/admin/product-image/route.ts), non soumis à ce plafond ; les
  // Server Actions restent au défaut de 1 Mo.
  ...(supabaseHost
    ? {
        images: {
          remotePatterns: [
            {
              protocol: "https",
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ],
        },
      }
    : {}),
};

export default nextConfig;
