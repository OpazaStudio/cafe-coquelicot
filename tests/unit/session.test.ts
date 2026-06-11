// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptSession, encryptSession } from "@/lib/auth/session";

const inOneHour = () => new Date(Date.now() + 3600_000);

describe("session JWT", () => {
  it("fait l'aller-retour chiffrement/déchiffrement", async () => {
    const token = await encryptSession({ email: "lea@test.local" }, inOneHour());
    expect(await decryptSession(token)).toEqual({ email: "lea@test.local" });
  });

  it("rejette un token falsifié", async () => {
    const token = await encryptSession({ email: "lea@test.local" }, inOneHour());
    const [h, p, s] = token.split(".");
    const forged = `${h}.${Buffer.from(
      JSON.stringify({ email: "pirate@evil.com" }),
    ).toString("base64url")}.${s}`;
    expect(await decryptSession(forged)).toBeNull();
    expect(await decryptSession(`${h}.${p}.AAAA`)).toBeNull();
  });

  it("rejette un token expiré", async () => {
    const token = await encryptSession(
      { email: "lea@test.local" },
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
