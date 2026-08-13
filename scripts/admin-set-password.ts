// Crée un compte du back-office ou change son mot de passe, dans la base
// pointée par DATABASE_URL (Supabase) ou la base locale PGlite à défaut.
//   npm run admin:set -- adresse@exemple.fr
// Le mot de passe est saisi masqué, jamais passé en argument : ni historique
// shell, ni expansion de variables, ni échappement à connaître.
import readline from "node:readline";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// Une seule interface pour toutes les questions : en ouvrir puis fermer
// plusieurs ferme l'entrée standard dès la première.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});
let masque = false;
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

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@")) {
    console.error("Usage : npm run admin:set -- adresse@exemple.fr");
    process.exit(1);
  }

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
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL absente — écriture dans la base locale PGlite.");
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
