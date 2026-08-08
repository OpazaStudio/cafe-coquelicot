// @vitest-environment node
// Caractérise la réconciliation des variantes (syncChildren) avant le
// regroupement des insertions : l'ordre de soumission fait foi pour sortOrder,
// les lignes retirées disparaissent, les existantes sont mises à jour.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { productColors, products, productSizes } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/lib/db/client";

vi.mock("@/lib/auth/dal", () => ({ verifySession: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

let db: Db;
vi.mock("@/lib/db/client", async (orig) => {
  const actual = await orig<typeof import("@/lib/db/client")>();
  return { ...actual, getDb: async () => db };
});

const { updateProduct } = await import("@/app/(admin)/admin/(panel)/produits/actions");

async function solana() {
  const [row] = await db.select().from(products).where(eq(products.slug, "solana"));
  return row;
}

function formFor(
  row: { name: string; tag: string; description: string; category: string },
  sizes: unknown[],
  colors: unknown[],
): FormData {
  const fd = new FormData();
  fd.set("name", row.name);
  fd.set("tag", row.tag);
  fd.set("description", row.description);
  fd.set("price", "34");
  fd.set("category", row.category);
  fd.set("badge", "");
  fd.set("illustrationVariant", "0");
  fd.set("imagePath", "");
  fd.set("imageBgColor", "");
  fd.set("active", "on");
  fd.set("sizes", JSON.stringify(sizes));
  fd.set("colors", JSON.stringify(colors));
  return fd;
}

async function submit(fd: FormData, id: string) {
  try {
    await updateProduct(id, undefined, fd);
  } catch (e) {
    // updateProduct se termine par redirect() → exception attendue.
    if ((e as Error).message !== "NEXT_REDIRECT") throw e;
  }
}

beforeEach(async () => {
  db = await createTestDb();
});

describe("syncChildren", () => {
  it("insère plusieurs nouvelles tailles dans l'ordre de soumission", async () => {
    const p = await solana();
    await submit(
      formFor(p, [
        { label: "XS", price: "19", active: true },
        { label: "XL", price: "99", active: false },
        { label: "M", price: "45", active: true },
      ], []),
      p.id,
    );

    const rows = await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.productId, p.id))
      .orderBy(asc(productSizes.sortOrder));
    expect(rows.map((r) => r.label)).toEqual(["XS", "XL", "M"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.priceCents)).toEqual([1900, 9900, 4500]);
    expect(rows.map((r) => r.active)).toEqual([true, false, true]);
  });

  it("met à jour les variantes existantes et supprime les retirées", async () => {
    const p = await solana();
    const existing = await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.productId, p.id))
      .orderBy(asc(productSizes.sortOrder));
    expect(existing.length).toBe(3);

    // On ne garde que la première, renommée, et on ajoute une nouvelle.
    await submit(
      formFor(p, [
        { id: existing[0].id, label: "Mini", price: "25", active: true },
        { label: "Neuve", price: "60", active: true },
      ], []),
      p.id,
    );

    const after = await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.productId, p.id))
      .orderBy(asc(productSizes.sortOrder));
    expect(after.map((r) => r.label)).toEqual(["Mini", "Neuve"]);
    expect(after[0].id).toBe(existing[0].id); // conservée, pas recréée
    expect(after[0].priceCents).toBe(2500);
  });

  it("insère plusieurs coloris avec leurs champs image", async () => {
    const p = await solana();
    await submit(
      formFor(p, [], [
        { label: "Rose", illustrationVariant: 1, imagePath: "", imageBgColor: "#fff", active: true },
        { label: "Bleu", illustrationVariant: 2, imagePath: "", imageBgColor: "", active: true },
      ]),
      p.id,
    );

    const rows = await db
      .select()
      .from(productColors)
      .where(eq(productColors.productId, p.id))
      .orderBy(asc(productColors.sortOrder));
    expect(rows.map((r) => r.label)).toEqual(["Rose", "Bleu"]);
    expect(rows.map((r) => r.illustrationVariant)).toEqual([1, 2]);
    expect(rows[0].imageBgColor).toBe("#fff");
    expect(rows[1].imageBgColor).toBeNull();
  });
});
