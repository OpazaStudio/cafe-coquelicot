import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { CgvContent } from "@/components/legal/cgv";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: "Conditions générales de vente de la boutique en ligne Café Coquelicot : commande, paiement, livraison, rétractation, médiation.",
  alternates: { canonical: "/cgv" },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const settings = await getSettings();
  return (
    <LegalPage crumb="cgv" title="Conditions générales de vente" script="les règles du jeu.">
      <CgvContent settings={settings} />
    </LegalPage>
  );
}
