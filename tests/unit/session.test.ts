// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptSession, encryptSession } from "@/lib/auth/session";

const inOneHour = () => new Date(Date.now() + 3600_000);

describe("session JWT", () => {
  it("fait l'aller-retour chiffrement/déchiffrement", async () => {
    const token = await encryptSession(
      { sub: "8f14e45f-ceea-467a-9c4a-4b2d1f0e9a37" },
      inOneHour(),
    );
    const session = await decryptSession(token);
    expect(session?.sub).toBe("8f14e45f-ceea-467a-9c4a-4b2d1f0e9a37");
    expect(typeof session?.iat).toBe("number");
  });

  it("rejette un token falsifié", async () => {
    const token = await encryptSession(
      { sub: "8f14e45f-ceea-467a-9c4a-4b2d1f0e9a37" },
      inOneHour(),
    );
    const [h, p, s] = token.split(".");
    const forged = `${h}.${Buffer.from(
      JSON.stringify({ sub: "00000000-0000-4000-8000-000000000000" }),
    ).toString("base64url")}.${s}`;
    expect(await decryptSession(forged)).toBeNull();
    expect(await decryptSession(`${h}.${p}.AAAA`)).toBeNull();
  });

  it("rejette un token expiré", async () => {
    const token = await encryptSession(
      { sub: "8f14e45f-ceea-467a-9c4a-4b2d1f0e9a37" },
      new Date(Date.now() - 1000),
    );
    expect(await decryptSession(token)).toBeNull();
  });

  it("rejette l'absence de token et le bruit", async () => {
    expect(await decryptSession(undefined)).toBeNull();
    expect(await decryptSession("")).toBeNull();
    expect(await decryptSession("garbage")).toBeNull();
  });
});
