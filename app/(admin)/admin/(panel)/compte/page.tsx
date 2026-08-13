import { verifySession } from "@/lib/auth/dal";
import { Panel } from "../ui";
import { PasswordForm } from "./password-form";

export default async function ComptePage() {
  const user = await verifySession();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Connecté en tant que <strong className="text-ink">{user.email}</strong>.
      </p>
      <Panel title="Changer le mot de passe">
        <PasswordForm />
      </Panel>
    </>
  );
}
