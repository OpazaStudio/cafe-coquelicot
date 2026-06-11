"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import {
  checkCredentials,
  createSession,
  destroySession,
} from "@/lib/auth/dal";

const LoginSchema = z.object({
  email: z.email({ error: "Adresse email invalide." }),
  password: z.string().min(1, { error: "Le mot de passe est requis." }),
});

export type LoginState = { error: string } | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const ok = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!ok) {
    return { error: "Identifiants incorrects." };
  }

  await createSession(parsed.data.email);
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
