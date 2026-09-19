import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getSettings, LEGAL_SETTING_GROUPS } from "@/lib/settings";
import { SettingsForm } from "../settings-form";
import { updateSettings } from "./actions";

export default async function ParametresPage() {
  await verifySession();
  const current = await getSettings();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-muted">
        Ces informations alimentent les pages{" "}
        <Link href="/mentions-legales" className="underline">mentions légales</Link>,{" "}
        <Link href="/cgv" className="underline">CGV</Link>,{" "}
        <Link href="/livraison-retours" className="underline">livraison &amp; retours</Link> et{" "}
        <Link href="/confidentialite" className="underline">confidentialité</Link>. Un champ vide
        apparaît sur le site comme « à compléter ». Le texte des e-mails se règle sur la page{" "}
        <Link href="/admin/emails" className="underline">E-mails</Link>.
      </p>
      <SettingsForm initial={current} groups={LEGAL_SETTING_GROUPS} action={updateSettings} />
    </>
  );
}
