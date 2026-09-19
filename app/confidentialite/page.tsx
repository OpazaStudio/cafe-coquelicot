import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { ConfidentialiteContent } from "@/components/legal/confidentialite";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Confidentialité & cookies",
  description: "Politique de confidentialité et cookies du site Coquelicot : données collectées, sous-traitants, droits RGPD.",
  alternates: { canonical: "/confidentialite" },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const settings = await getSettings();
  return (
    <LegalPage crumb="confidentialité" title="Confidentialité & cookies" script="vos données, vos droits.">
      <ConfidentialiteContent settings={settings} />
    </LegalPage>
  );
}
