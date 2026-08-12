// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { adminUsers } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";
import {
  MIN_PASSWORD_LENGTH,
  findAdminByEmail,
  findAdminById,
  setAdminPassword,
} from "@/lib/db/admin-users";

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

describe("setAdminPassword", () => {
  it("crée un compte absent et hache le mot de passe", async () => {
    const db = await createTestDb({ seed: false });
    const action = await setAdminPassword(db, "Nouveau@Exemple.FR", "motdepasse-solide");
    expect(action).toBe("created");

    const user = await findAdminByEmail(db, "nouveau@exemple.fr");
    expect(user).toBeDefined();
    expect(user!.passwordHash).not.toContain("motdepasse-solide");
    expect(await bcrypt.compare("motdepasse-solide", user!.passwordHash)).toBe(true);
  });

  it("normalise l'adresse en minuscules", async () => {
    const db = await createTestDb({ seed: false });
    await setAdminPassword(db, "  Majuscules@Exemple.FR  ", "motdepasse-solide");
    expect(await findAdminByEmail(db, "MAJUSCULES@exemple.fr")).toBeDefined();
  });

  it("met à jour un compte existant sans en créer un second", async () => {
    const db = await createTestDb({ seed: false });
    await setAdminPassword(db, "unique@exemple.fr", "premier-mot-de-passe");
    const avant = await findAdminByEmail(db, "unique@exemple.fr");

    const action = await setAdminPassword(db, "unique@exemple.fr", "second-mot-de-passe");
    expect(action).toBe("updated");

    const apres = await findAdminByEmail(db, "unique@exemple.fr");
    expect(apres!.id).toBe(avant!.id);
    expect(await bcrypt.compare("second-mot-de-passe", apres!.passwordHash)).toBe(true);
    expect(apres!.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(
      avant!.passwordChangedAt.getTime(),
    );
  });

  it("refuse un mot de passe trop court", async () => {
    const db = await createTestDb({ seed: false });
    await expect(
      setAdminPassword(db, "court@exemple.fr", "a".repeat(MIN_PASSWORD_LENGTH - 1)),
    ).rejects.toThrow(/12 caractères/);
  });
});

describe("findAdminById", () => {
  it("renvoie undefined sur un identifiant qui n'est pas un uuid", async () => {
    const db = await createTestDb({ seed: false });
    expect(await findAdminById(db, "pas-un-uuid")).toBeUndefined();
  });
});
