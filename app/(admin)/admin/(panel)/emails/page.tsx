import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { NAME_PLACEHOLDER, NUMBER_PLACEHOLDER } from "@/lib/email/templates";
import { EMAIL_SETTING_GROUPS, getSettings } from "@/lib/settings";
import { SettingsForm } from "../settings-form";
import { updateEmailSettings } from "./actions";

export default async function EmailsPage() {
  await verifySession();
  const current = await getSettings();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Textes des e-mails</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-muted">
        Ces textes sont utilisés par les e-mails envoyés automatiquement : la confirmation de
        commande et sa notification à la boutique d&apos;une part, l&apos;accusé de réception du{" "}
        <Link href="/contact" className="underline">formulaire de contact</Link> et sa notification
        d&apos;autre part. Écrivez en texte simple : la mise en forme est appliquée automatiquement,{" "}
        <code className="rounded bg-fill px-1 py-0.5">{NAME_PLACEHOLDER}</code> est remplacé par le
        nom de la personne et{" "}
        <code className="rounded bg-fill px-1 py-0.5">{NUMBER_PLACEHOLDER}</code> par le numéro de
        commande. Le récapitulatif de commande (articles, totaux, livraison) est ajouté
        automatiquement. Un champ laissé vide revient au texte d&apos;origine.
      </p>
      <SettingsForm
        initial={current}
        groups={EMAIL_SETTING_GROUPS}
        action={updateEmailSettings}
        savedLabel="Textes enregistrés."
      />
    </>
  );
}
