"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { EMAIL_SETTING_GROUPS, keysForGroups, readSettingsForm, saveSettings } from "@/lib/settings";
import type { SettingsState } from "../settings-form";

export async function updateEmailSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await verifySession();

  const parsed = readSettingsForm(formData, keysForGroups(EMAIL_SETTING_GROUPS));
  if (!parsed.ok) return { error: parsed.error };

  await saveSettings(await getDb(), parsed.data);
  revalidatePath("/admin/emails");
  return { ok: true };
}
