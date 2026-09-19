import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { LivraisonRetoursContent } from "@/components/legal/livraison-retours";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Livraison & retours",
  description: "Délais de préparation, livraison en point relais Mondial Relay, retrait à l'atelier et conditions de retour.",
  alternates: { canonical: "/livraison-retours" },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const settings = await getSettings();
  return (
    <LegalPage crumb="livraison & retours" title="Livraison & retours" script="de l'atelier à chez vous.">
      <LivraisonRetoursContent settings={settings} />
    </LegalPage>
  );
}
