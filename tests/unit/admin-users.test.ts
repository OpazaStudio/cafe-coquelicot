// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminUsers } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";

describe("table admin_users", () => {
  it("stocke un compte et le relit par e-mail", async () => {
    const db = await createTestDb({ seed: false });
    await db.insert(adminUsers).values({
      email: "compte@exemple.fr",
      passwordHash: "$2b$10$hash-factice-pour-le-test-de-schema-uniquement",
    });

    const [row] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, "compte@exemple.fr"));

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.passwordChangedAt).toBeInstanceOf(Date);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("refuse deux comptes avec la même adresse", async () => {
    const db = await createTestDb({ seed: false });
    const row = {
      email: "doublon@exemple.fr",
      passwordHash: "$2b$10$hash-factice-pour-le-test-de-schema-uniquement",
    };
    await db.insert(adminUsers).values(row);
    await expect(db.insert(adminUsers).values(row)).rejects.toThrow();
  });
});
