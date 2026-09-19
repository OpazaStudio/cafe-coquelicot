import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { MentionsLegalesContent } from "@/components/legal/mentions-legales";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergeur et informations légales du site de l'atelier Coquelicot, fleuriste à La Rochelle.",
  alternates: { canonical: "/mentions-legales" },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const settings = await getSettings();
  return (
    <LegalPage crumb="mentions légales" title="Mentions légales" script="qui sommes-nous ?">
      <MentionsLegalesContent settings={settings} />
    </LegalPage>
  );
}
