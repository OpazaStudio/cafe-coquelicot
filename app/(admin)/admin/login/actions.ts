"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import {
  checkCredentials,
  createSession,
  destroySession,
} from "@/lib/auth/dal";
import { loginLimiter } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

const LoginSchema = z.object({
  email: z.email({ error: "Adresse email invalide." }),
  password: z.string().min(1, { error: "Le mot de passe est requis." }),
});

export type LoginState = { error: string } | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Plafond AVANT la validation de saisie et le bcrypt : compte unique à
  // adresse connue, donc la seule variable attaquable est le mot de passe.
  // La clé est l'IP seule — varier l'e-mail soumis ne relâche pas le compteur.
  const ip = await getRequestIp();
  const gate = loginLimiter(ip);
  if (!gate.ok) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return {
      error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
    };
  }

  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const user = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "Identifiants incorrects." };
  }

  // Seuls les échecs doivent peser : sans cette remise à zéro, l'admin se
  // verrouille en se reconnectant plusieurs fois dans la fenêtre. La
  // protection reste entière — un attaquant n'obtient jamais de succès.
  loginLimiter.reset(ip);
  await createSession(user.id);
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
