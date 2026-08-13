// Crée un compte du back-office ou change son mot de passe, dans la base
// pointée par DATABASE_URL (Supabase) ou la base locale PGlite à défaut.
//   npm run admin:set -- adresse@exemple.fr
// Le mot de passe est saisi masqué, jamais passé en argument : ni historique
// shell, ni expansion de variables, ni échappement à connaître.
import readline from "node:readline";
import { loadEnvConfig } from "@next/env";
import * as z from "zod";

loadEnvConfig(process.cwd());

const EmailSchema = z.email({ error: "Adresse email invalide." });

// Une seule interface pour toutes les questions : en ouvrir puis fermer
// plusieurs ferme l'entrée standard dès la première.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});
// Masqué DÈS l'ouverture (et non après le premier prompt) : l'interface se
// met à écouter stdin immédiatement, avant même que `main()` ait fini de
// valider l'email et de charger `lib/db/*` (imports dynamiques, donc
// asynchrones). Une saisie qui arriverait pendant cette fenêtre serait
// échoée en clair si `masque` démarrait à `false`.
let masque = true;
const ecrire = (
  rl as unknown as { _writeToOutput: (s: string) => void }
)._writeToOutput.bind(rl);
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
  s: string,
) => {
  if (!masque) ecrire(s);
};
const lignes = rl[Symbol.asyncIterator]();

async function demander(prompt: string, cache = false): Promise<string> {
  masque = false;
  process.stdout.write(prompt);
  masque = cache;
  const { value } = await lignes.next();
  masque = false;
  if (cache) process.stdout.write("\n");
  return (value ?? "").trim();
}

// Décrit la base sur laquelle le script va écrire, sans jamais exposer les
// identifiants contenus dans DATABASE_URL (l'hôte suffit à la situer).
function decrireCible(url: string | undefined): string {
  if (!url) return "base locale PGlite (.data/pglite)";
  try {
    return `base distante (hôte : ${new URL(url).host}) — c'est la production si c'est le poste habituel`;
  } catch {
    return "base distante (DATABASE_URL illisible)";
  }
}

async function main() {
  const parsedEmail = EmailSchema.safeParse(process.argv[2]);
  if (!parsedEmail.success) {
    console.error("Usage : npm run admin:set -- adresse@exemple.fr");
    process.exit(1);
  }
  const email = parsedEmail.data;

  // Affiché avant toute saisie : si DATABASE_URL n'a pas été préfixée par
  // erreur, l'utilisateur voit qu'il s'apprête à écrire en production avant
  // même de taper un mot de passe.
  console.warn(`⚠ Cible : ${decrireCible(process.env.DATABASE_URL)}.`);

  const { getDb } = await import("../lib/db/client");
  const { setAdminPassword, MIN_PASSWORD_LENGTH } = await import(
    "../lib/db/admin-users"
  );

  const mdp = await demander("Mot de passe : ", true);
  const confirmation = await demander("Confirmer     : ", true);
  rl.close();

  if (mdp !== confirmation) {
    console.error("✗ Les deux saisies diffèrent. Rien n'a été modifié.");
    process.exit(1);
  }
  if (mdp.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `✗ Trop court : ${MIN_PASSWORD_LENGTH} caractères minimum. Rien n'a été modifié.`,
    );
    process.exit(1);
  }

  const action = await setAdminPassword(await getDb(), email, mdp);
  console.log(
    action === "created"
      ? `✓ Compte créé : ${email}`
      : `✓ Mot de passe mis à jour : ${email}`,
  );
  console.log("  Les sessions ouvertes sur ce compte sont invalidées.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
