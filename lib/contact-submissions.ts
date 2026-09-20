import { desc, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import {
  contactSubmissions,
  type ContactSubmissionRow,
  type NewContactSubmissionRow,
} from "./db/schema";

export type ContactSubmissionInput = Pick<
  NewContactSubmissionRow,
  "name" | "email" | "phone" | "message"
>;

export async function saveContactSubmission(
  db: Db,
  input: ContactSubmissionInput,
): Promise<string> {
  const [row] = await db
    .insert(contactSubmissions)
    .values(input)
    .returning({ id: contactSubmissions.id });
  return row.id;
}

export async function markSubmissionEmailSent(db: Db, id: string): Promise<void> {
  await db
    .update(contactSubmissions)
    .set({ emailSent: true })
    .where(eq(contactSubmissions.id, id));
}

export async function listContactSubmissions(db: Db): Promise<ContactSubmissionRow[]> {
  return db
    .select()
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt));
}

export async function setSubmissionRead(
  db: Db,
  id: string,
  read: boolean,
): Promise<void> {
  await db
    .update(contactSubmissions)
    .set({ readAt: read ? new Date() : null })
    .where(eq(contactSubmissions.id, id));
}

export async function deleteContactSubmission(db: Db, id: string): Promise<void> {
  await db.delete(contactSubmissions).where(eq(contactSubmissions.id, id));
}
