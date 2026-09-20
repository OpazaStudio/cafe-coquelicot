// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionMock = vi.fn().mockResolvedValue({ id: "admin", email: "a@b.fr" });
vi.mock("@/lib/auth/dal", () => ({ verifySession: () => verifySessionMock() }));
const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePathMock(...a) }));
const deleteImageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage", () => ({ deleteImage: (p: string) => deleteImageMock(p) }));
const upsertPageContentMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content/server")>();
  upsertPageContentMock.mockImplementation(actual.upsertPageContent);
  return { ...actual, upsertPageContent: upsertPageContentMock };
});

import { savePageContent } from "@/app/(admin)/admin/(panel)/contenu/actions";
import { getDb } from "@/lib/db/client";
import { queryPageContent } from "@/lib/content/server";
import { PAGES } from "@/lib/content/registry";

const IMG = "123e4567-e89b-12d3-a456-426614174000.png";

function form(page: string, data: unknown) {
  const fd = new FormData();
  fd.set("page", page);
  fd.set("data", typeof data === "string" ? data : JSON.stringify(data));
  return fd;
}

describe("savePageContent (server action)", () => {
  beforeEach(() => {
    verifySessionMock.mockClear();
    revalidatePathMock.mockClear();
    deleteImageMock.mockClear();
    upsertPageContentMock.mockClear();
  });

  it("exige une session, enregistre et revalide la page", async () => {
    const doc = { ...PAGES.checkout.defaults, hero: { title: "régler", script: "" } };
    const state = await savePageContent(undefined, form("checkout", doc));
    expect(verifySessionMock).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ ok: true });
    expect((await queryPageContent(await getDb(), "checkout")).hero.title).toBe("régler");
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(["/checkout", "/admin/contenu/commander"]));
  });

  it("renvoie l'erreur stricte sans écrire", async () => {
    const before = (await queryPageContent(await getDb(), "panier")).hero.title;
    const state = await savePageContent(undefined, form("panier", { ...PAGES.panier.defaults, hero: { title: "", script: "" } }));
    expect(state).toMatchObject({ error: "Titre : champ obligatoire." });
    expect((await queryPageContent(await getDb(), "panier")).hero.title).toBe(before);
  });

  it("refuse une page inconnue et un JSON illisible", async () => {
    expect(await savePageContent(undefined, form("hero", {}))).toEqual({ error: "Page inconnue." });
    expect(await savePageContent(undefined, form("panier", "{oops"))).toEqual({ error: "Données illisibles." });
  });

  it("supprime les images retirées du document", async () => {
    const withImage = { ...PAGES.home.defaults, about: { ...PAGES.home.defaults.about, image: { path: IMG, alt: "" } } };
    expect(await savePageContent(undefined, form("home", withImage))).toEqual({ ok: true });
    expect(deleteImageMock).not.toHaveBeenCalled();
    expect(await savePageContent(undefined, form("home", PAGES.home.defaults))).toEqual({ ok: true });
    expect(deleteImageMock).toHaveBeenCalledWith(IMG);
  });

  it("une suppression d'image en échec n'empêche ni l'enregistrement ni la revalidation", async () => {
    await savePageContent(undefined, form("home", { ...PAGES.home.defaults, about: { ...PAGES.home.defaults.about, image: { path: IMG, alt: "" } } }));
    revalidatePathMock.mockClear();
    deleteImageMock.mockRejectedValueOnce(new Error("stockage indisponible"));
    const state = await savePageContent(undefined, form("home", PAGES.home.defaults));
    expect(state).toEqual({ ok: true });
    expect(deleteImageMock).toHaveBeenCalledWith(IMG);
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(["/", "/admin/contenu/accueil"]));
  });

  it("renvoie une erreur générique si l'écriture échoue", async () => {
    const before = await queryPageContent(await getDb(), "checkout");
    upsertPageContentMock.mockRejectedValueOnce(new Error("boom"));
    const state = await savePageContent(undefined, form("checkout", PAGES.checkout.defaults));
    expect(state).toEqual({ error: "Enregistrement impossible, réessayez dans un instant." });
    expect(await queryPageContent(await getDb(), "checkout")).toEqual(before);
  });
});
