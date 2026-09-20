// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import { pageContent } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { PAGES } from "@/lib/content/registry";
import { queryPageContent, upsertPageContent } from "@/lib/content/server";

describe("contenu des pages (serveur)", () => {
  it("renvoie les défauts sans ligne en base", async () => {
    const db = await createTestDb({ seed: false });
    expect(await queryPageContent(db, "home")).toEqual(PAGES.home.defaults);
  });

  it("enregistre puis relit un document", async () => {
    const db = await createTestDb({ seed: false });
    const doc = { ...PAGES.checkout.defaults, hero: { title: "payer", script: "vite" } };
    await upsertPageContent(db, "checkout", doc);
    expect(await queryPageContent(db, "checkout")).toEqual(doc);
    await upsertPageContent(db, "checkout", { ...doc, hero: { ...doc.hero, title: "régler" } });
    expect((await queryPageContent(db, "checkout")).hero.title).toBe("régler");
  });

  it("complète un document partiel avec les défauts", async () => {
    const db = await createTestDb({ seed: false });
    await db.insert(pageContent).values({ page: "panier", data: { hero: { title: "mon panier" } } });
    const content = await queryPageContent(db, "panier");
    expect(content.hero.title).toBe("mon panier");
    expect(content.hero.script).toBe(PAGES.panier.defaults.hero.script);
    expect(content.summary).toEqual(PAGES.panier.defaults.summary);
  });

  it("retombe sur les défauts pour une ligne illisible", async () => {
    const db = await createTestDb({ seed: false });
    await db.insert(pageContent).values({ page: "checkout", data: { hero: "pas un objet" } as never });
    expect(await queryPageContent(db, "checkout")).toEqual(PAGES.checkout.defaults);
  });

  it("retombe sur les défauts si la lecture en base échoue", async () => {
    const brokenDb = {
      select: () => {
        throw new Error("boom");
      },
    } as unknown as Db;
    expect(await queryPageContent(brokenDb, "checkout")).toEqual(PAGES.checkout.defaults);
  });
});
