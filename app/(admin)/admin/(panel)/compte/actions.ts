"use server";

import * as z from "zod";
import { checkCredentials, createSession, verifySession } from "@/lib/auth/dal";
import { MIN_PASSWORD_LENGTH, setAdminPassword } from "@/lib/db/admin-users";
import { getDb } from "@/lib/db/client";

const ChangeSchema = z
  .object({
    current: z.string().min(1, { error: "Le mot de passe actuel est requis." }),
    next: z.string().min(MIN_PASSWORD_LENGTH, {
      error: `Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    }),
    confirmation: z.string(),
  })
  .refine((v) => v.next === v.confirmation, {
    error: "La confirmation ne correspond pas.",
    path: ["confirmation"],
  });

export type ChangePasswordState = { error: string } | { ok: true } | undefined;

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await verifySession();

  const parsed = ChangeSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  if (!(await checkCredentials(user.email, parsed.data.current))) {
    return { error: "Mot de passe actuel incorrect." };
  }

  await setAdminPassword(await getDb(), user.email, parsed.data.next);
  await createSession(user.id);
  return { ok: true };
}
