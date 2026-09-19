"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { LEGAL_PATHS } from "@/lib/seo";
import { keysForGroups, LEGAL_SETTING_GROUPS, readSettingsForm, saveSettings } from "@/lib/settings";
import type { SettingsState } from "../settings-form";

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await verifySession();

  const parsed = readSettingsForm(formData, keysForGroups(LEGAL_SETTING_GROUPS));
  if (!parsed.ok) return { error: parsed.error };

  await saveSettings(await getDb(), parsed.data);
  for (const path of LEGAL_PATHS) revalidatePath(path);
  revalidatePath("/");
  revalidatePath("/admin/parametres");
  revalidatePath("/checkout");
  revalidatePath("/panier");
  return { ok: true };
}
