// Opérations sur les comptes du back-office. La base est passée en paramètre :
// utilisable depuis un script, une Server Action ou un test, sans dépendre du
// singleton getDb().
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { adminUsers, type AdminUserRow } from "./schema";
import { isUuid } from "../uuid";

export const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_ROUNDS = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAdminByEmail(
  db: Db,
  email: string,
): Promise<AdminUserRow | undefined> {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, normalizeEmail(email)))
    .limit(1);
  return user;
}

// `id` provient d'un jeton de session : le valider avant la requête, sinon
// Postgres lève « invalid input syntax for type uuid » (cf. lib/uuid.ts).
export async function findAdminById(
  db: Db,
  id: string,
): Promise<AdminUserRow | undefined> {
  if (!isUuid(id)) return undefined;
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);
  return user;
}

// Crée le compte ou remplace son mot de passe. `password_changed_at` est
// repositionné dans les deux cas : il invalide les sessions antérieures.
export async function setAdminPassword(
  db: Db,
  email: string,
  password: string,
): Promise<"created" | "updated"> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    );
  }
  const normalized = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existing = await findAdminByEmail(db, normalized);

  if (existing) {
    await db
      .update(adminUsers)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(adminUsers.id, existing.id));
    return "updated";
  }

  await db.insert(adminUsers).values({ email: normalized, passwordHash });
  return "created";
}
