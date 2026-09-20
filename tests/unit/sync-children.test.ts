// @vitest-environment node
// Caractérise la réconciliation des variantes (syncChildren) avant le
// regroupement des insertions : l'ordre de soumission fait foi pour sortOrder,
// les lignes retirées disparaissent, les existantes sont mises à jour.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { productColors, productImages, products, productSizes } from "@/lib/db/schema";
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

let keyCounter = 0;
type Draft = { id?: string; key?: string };

function withKeys<T extends Draft>(rows: T[]) {
  return rows.map((r) => ({ key: r.key ?? r.id ?? `k${keyCounter++}`, ...r }));
}

function formFor(
  row: { name: string; description: string; category: string },
  sizes: (Draft & { label: string; price: string; active: boolean })[],
  colors: (Draft & { label: string; illustrationVariant: number; active: boolean })[],
  images: unknown[] = [],
): FormData {
  const fd = new FormData();
  fd.set("name", row.name);
  fd.set(
    "descriptionRich",
    JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: row.description }] }],
    }),
  );
  fd.set("price", "34");
  fd.set("category", row.category);
  fd.set("badge", "");
  fd.set("illustrationVariant", "0");
  fd.set("active", "on");
  fd.set("sizes", JSON.stringify(withKeys(sizes)));
  fd.set("colors", JSON.stringify(withKeys(colors)));
  fd.set("images", JSON.stringify(images));
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

  it("insère plusieurs coloris dans l'ordre de soumission", async () => {
    const p = await solana();
    await submit(
      formFor(p, [], [
        { key: "c-rose", label: "Rose", illustrationVariant: 1, active: true },
        { key: "c-bleu", label: "Bleu", illustrationVariant: 2, active: false },
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
    expect(rows.map((r) => r.active)).toEqual([true, false]);
  });

  it("rattache une photo à un coloris créé dans la même soumission", async () => {
    const p = await solana();
    const a = "11111111-1111-1111-1111-111111111111.webp";
    await submit(
      formFor(
        p,
        [],
        [
          { key: "c-rose", label: "Rose", illustrationVariant: 1, active: true },
          { key: "c-bleu", label: "Bleu", illustrationVariant: 2, active: true },
        ],
        [{ path: a, bgColor: null, alt: null, sizeKey: null, colorKey: "c-bleu" }],
      ),
      p.id,
    );

    const [img] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    const cols = await db
      .select()
      .from(productColors)
      .where(eq(productColors.productId, p.id))
      .orderBy(asc(productColors.sortOrder));
    expect(img.colorId).toBe(cols.find((c) => c.label === "Bleu")!.id);
  });

  it("détache la photo quand son coloris est supprimé", async () => {
    const p = await solana();
    const a = "11111111-1111-1111-1111-111111111111.webp";
    await submit(
      formFor(
        p,
        [],
        [{ key: "c-rose", label: "Rose", illustrationVariant: 1, active: true }],
        [{ path: a, bgColor: null, alt: null, sizeKey: null, colorKey: "c-rose" }],
      ),
      p.id,
    );
    const [before] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    expect(before.colorId).not.toBeNull();

    const [img] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    await submit(
      formFor(p, [], [], [
        { id: img.id, path: a, bgColor: null, alt: null, sizeKey: null, colorKey: "c-rose" },
      ]),
      p.id,
    );

    const [after] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    expect(after.colorId).toBeNull();
  });

  it("enregistre la galerie dans l'ordre soumis et recopie la couverture", async () => {
    const p = await solana();
    const a = "11111111-1111-1111-1111-111111111111.webp";
    const b = "22222222-2222-2222-2222-222222222222.png";
    await submit(
      formFor(p, [], [], [
        { path: a, bgColor: "#fff", alt: "De face", sizeKey: null },
        { path: b, bgColor: null, alt: null, sizeKey: null },
      ]),
      p.id,
    );

    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id))
      .orderBy(asc(productImages.sortOrder));
    expect(rows.map((r) => r.path)).toEqual([a, b]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
    expect(rows[0].alt).toBe("De face");
    expect(rows[0].bgColor).toBe("#fff");

    const [row] = await db.select().from(products).where(eq(products.id, p.id));
    expect(row.imagePath).toBe(a);
    expect(row.imageBgColor).toBe("#fff");
  });

  it("efface la couverture quand la galerie est vidée", async () => {
    const p = await solana();
    const a = "11111111-1111-1111-1111-111111111111.webp";
    await submit(formFor(p, [], [], [{ path: a, bgColor: null, alt: null, sizeKey: null }]), p.id);
    await submit(formFor(p, [], [], []), p.id);

    const [row] = await db.select().from(products).where(eq(products.id, p.id));
    expect(row.imagePath).toBeNull();
    expect(row.imageBgColor).toBeNull();
  });

  it("rattache une photo à une taille créée dans la même soumission", async () => {
    const p = await solana();
    const a = "11111111-1111-1111-1111-111111111111.webp";
    await submit(
      formFor(
        p,
        [
          { key: "s-petit", label: "Petit", price: "29", active: true },
          { key: "s-grand", label: "Grand", price: "42", active: true },
        ],
        [],
        [{ path: a, bgColor: null, alt: null, sizeKey: "s-grand" }],
      ),
      p.id,
    );

    const [img] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    const sizes = await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.productId, p.id))
      .orderBy(asc(productSizes.sortOrder));
    const grand = sizes.find((s) => s.label === "Grand");
    expect(img.sizeId).toBe(grand!.id);
  });

  it("laisse la photo sans taille quand la taille visée a été retirée", async () => {
    const p = await solana();
    const a = "11111111-1111-1111-1111-111111111111.webp";
    await submit(
      formFor(p, [], [], [{ path: a, bgColor: null, alt: null, sizeKey: "s-disparue" }]),
      p.id,
    );

    const [img] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    expect(img.sizeId).toBeNull();
  });
});
