// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionMock = vi.fn().mockResolvedValue({ id: "admin", email: "a@b.fr" });
vi.mock("@/lib/auth/dal", () => ({ verifySession: () => verifySessionMock() }));
const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePathMock(...a) }));

import { updateSettings } from "@/app/(admin)/admin/(panel)/parametres/actions";
import { getDb } from "@/lib/db/client";
import { querySettings } from "@/lib/settings";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("updateSettings (server action)", () => {
  beforeEach(() => {
    verifySessionMock.mockClear();
    revalidatePathMock.mockClear();
  });

  it("exige une session puis enregistre et revalide les pages légales", async () => {
    const state = await updateSettings(undefined, form({ siret: "999 888 777 00011" }));
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ ok: true });
    expect((await querySettings(await getDb())).siret).toBe("999 888 777 00011");
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(["/mentions-legales", "/cgv"]));
  });

  it("renvoie l'erreur de validation sans rien écrire", async () => {
    const before = (await querySettings(await getDb())).mediator_website;
    const state = await updateSettings(undefined, form({ mediator_website: "pas-une-url" }));
    expect(state).toMatchObject({ error: expect.stringMatching(/http/) });
    expect((await querySettings(await getDb())).mediator_website).toBe(before);
  });
});
