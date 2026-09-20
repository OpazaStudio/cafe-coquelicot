// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import {
  deleteContactSubmission,
  listContactSubmissions,
  markSubmissionEmailSent,
  saveContactSubmission,
  setSubmissionRead,
} from "@/lib/contact-submissions";
import { contactSubmissions } from "@/lib/db/schema";

const INPUT = {
  name: "Camille Martin",
  email: "camille@exemple.fr",
  phone: "06 12 34 56 78",
  message: "Bonjour,\nje cherche un bouquet pour un mariage.",
};

describe("table contact_submissions", () => {
  it("enregistre un message non lu et non notifié par défaut", async () => {
    const db = await createTestDb({ seed: false });
    const id = await saveContactSubmission(db, INPUT);

    const rows = await db
      .select()
      .from(contactSubmissions)
      .where(eq(contactSubmissions.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(INPUT.name);
    expect(rows[0].message).toBe(INPUT.message);
    expect(rows[0].emailSent).toBe(false);
    expect(rows[0].readAt).toBeNull();
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("marque l'e-mail comme envoyé", async () => {
    const db = await createTestDb({ seed: false });
    const id = await saveContactSubmission(db, INPUT);
    await markSubmissionEmailSent(db, id);
    const [row] = await listContactSubmissions(db);
    expect(row.emailSent).toBe(true);
  });

  it("bascule l'état lu / non lu", async () => {
    const db = await createTestDb({ seed: false });
    const id = await saveContactSubmission(db, INPUT);

    await setSubmissionRead(db, id, true);
    const [read] = await listContactSubmissions(db);
    expect(read.readAt).toBeInstanceOf(Date);

    await setSubmissionRead(db, id, false);
    const [unread] = await listContactSubmissions(db);
    expect(unread.readAt).toBeNull();
  });

  it("liste du plus récent au plus ancien", async () => {
    const db = await createTestDb({ seed: false });
    await db.insert(contactSubmissions).values([
      { ...INPUT, name: "Ancien", createdAt: new Date("2026-01-01T10:00:00Z") },
      { ...INPUT, name: "Récent", createdAt: new Date("2026-02-01T10:00:00Z") },
    ]);
    const rows = await listContactSubmissions(db);
    expect(rows.map((r) => r.name)).toEqual(["Récent", "Ancien"]);
  });

  it("supprime une soumission", async () => {
    const db = await createTestDb({ seed: false });
    const id = await saveContactSubmission(db, INPUT);
    await deleteContactSubmission(db, id);
    expect(await listContactSubmissions(db)).toHaveLength(0);
  });
});
