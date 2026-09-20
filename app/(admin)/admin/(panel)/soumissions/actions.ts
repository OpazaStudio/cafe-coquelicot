"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import {
  deleteContactSubmission,
  setSubmissionRead,
} from "@/lib/contact-submissions";
import { getDb } from "@/lib/db/client";

export async function toggleSubmissionRead(
  id: string,
  read: boolean,
): Promise<void> {
  await verifySession();
  await setSubmissionRead(await getDb(), id, read);
  revalidatePath("/admin/soumissions");
}

export async function deleteSubmission(id: string): Promise<void> {
  await verifySession();
  await deleteContactSubmission(await getDb(), id);
  revalidatePath("/admin/soumissions");
}
