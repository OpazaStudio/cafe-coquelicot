import type { Metadata } from "next";
import { Bagel_Fat_One, Caveat, DM_Sans } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Effects } from "@/components/effects";
import { CartProvider } from "@/lib/cart/cart-context";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";
import { ConsentDefaultScript } from "@/components/consent/consent-default-script";
import { CookieBanner } from "@/components/consent/cookie-banner";

const bagelFatOne = Bagel_Fat_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bagel-fat-one",
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
      className={`${bagelFatOne.variable} ${caveat.variable} ${dmSans.variable}`}
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
      </body>
      {GA_MEASUREMENT_ID && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
