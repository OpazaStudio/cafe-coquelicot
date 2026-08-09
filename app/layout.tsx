import type { Metadata } from "next";
import { Caveat, DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Effects } from "@/components/effects";
import { CartProvider } from "@/lib/cart/cart-context";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";
import { ConsentDefaultScript } from "@/components/consent/consent-default-script";
import { CookieBanner } from "@/components/consent/cookie-banner";
import { BgTweakGate } from "@/components/bg-tweak/gate";

// Tangerine (fichiers fournis dans /fonts) — didone à fort contraste, plus large
// à corps égal que la display qu'elle remplace : « coquelicot » mesurait 795px
// là où l'ancienne en faisait 733, soit un héro et un wordmark de pied de page
// qui débordaient de leur colonne. `size-adjust: 92%` recale l'avance sur
// l'ancienne chasse, ce qui garde valides toutes les `font-size` et les
// planchers de clamp() déjà calibrés dans globals.css.
const tangerine = localFont({
  src: "../fonts/tangerine/TangerineRegular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-tangerine",
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "size-adjust", value: "92%" }],
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Coquelicot — Fleuriste · La Rochelle",
  description:
    "Atelier-boutique de fleurs fraîches & séchées à La Rochelle. Bouquets de saison, mariages, événementiel, abonnements et ateliers floraux.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${tangerine.variable} ${caveat.variable} ${dmSans.variable}`}
    >
      <body>
        <a href="#contenu" className="skip-link">
          Aller au contenu
        </a>
        {GA_MEASUREMENT_ID && <ConsentDefaultScript />}
        <div className="grain" />
        <Effects />
        <CartProvider>{children}</CartProvider>
        <CookieBanner />
        <BgTweakGate />
      </body>
      {GA_MEASUREMENT_ID && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
