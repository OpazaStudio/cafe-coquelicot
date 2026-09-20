// @vitest-environment node
// I2/I3/I4 : purge Storage (best-effort) déclenchée par updateProduct /
// deleteProduct — vérifie que deleteImage n'est JAMAIS appelé avant qu'une
// transaction DB ait commité, et qu'il l'est bien pour les cas couverts par
// la revue (photo retirée de la galerie, coloris retiré, coloris remplacé).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/dal", () => ({ verifySession: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const deleteImageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage", () => ({
  deleteImage: (path: string) => deleteImageMock(path),
  uploadImage: vi.fn(),
}));

import {
  deleteProduct,
  updateProduct,
} from "@/app/(admin)/admin/(panel)/produits/actions";
import { getDb } from "@/lib/db/client";
import { productColors, productImages, products } from "@/lib/db/schema";

const OLD_IMG = "11111111-1111-1111-1111-111111111111.png";
const NEW_IMG = "22222222-2222-2222-2222-222222222222.png";
const COLOR_IMG_A = "33333333-3333-3333-3333-333333333333.png";
const COLOR_IMG_B = "44444444-4444-4444-4444-444444444444.jpg";

const DESCRIPTION = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Description" }] }],
});

function buildFormData(opts: {
  images?: unknown[];
  colors?: unknown[];
}): FormData {
  const fd = new FormData();
  fd.set("name", "Produit test");
  fd.set("descriptionRich", DESCRIPTION);
  fd.set("price", "10");
  fd.set("category", "frais");
  fd.set("badge", "");
  fd.set("illustrationVariant", "0");
  fd.set("active", "on");
  fd.set("sizes", "[]");
  fd.set("colors", JSON.stringify(opts.colors ?? []));
  fd.set("images", JSON.stringify(opts.images ?? []));
  return fd;
}

function image(path: string, id?: string) {
  return { ...(id ? { id } : {}), path, bgColor: null, alt: null, sizeKey: null };
}

async function insertProduct(imagePath: string | null) {
  const db = await getDb();
  const [row] = await db
    .insert(products)
    .values({
      slug: `test-${randomUUID()}`,
      name: "Produit test",
      description: "Description",
      priceCents: 1000,
      category: "frais",
      imagePath,
    })
    .returning({ id: products.id });
  if (imagePath) {
    await db.insert(productImages).values({ productId: row.id, path: imagePath, sortOrder: 0 });
  }
  return row.id;
}

async function imageIdOf(productId: string, path: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: productImages.id, path: productImages.path })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  return rows.find((r) => r.path === path)!.id;
}

async function insertColor(productId: string, imagePath: string | null) {
  const db = await getDb();
  const [row] = await db
    .insert(productColors)
    .values({ productId, label: "Coloris", imagePath })
    .returning({ id: productColors.id });
  return row.id;
}

beforeEach(() => {
  deleteImageMock.mockReset();
  deleteImageMock.mockResolvedValue(undefined);
});

describe("updateProduct — purge Storage (I2)", () => {
  it("supprime l'ancienne photo UNIQUEMENT après un commit réussi", async () => {
    const db = await getDb();
    const id = await insertProduct(OLD_IMG);

    deleteImageMock.mockImplementation(async (path: string) => {
      // Invariant clé de I2 : au moment de l'appel, la transaction a déjà
      // commité — la couverture porte donc déjà la NOUVELLE photo.
      const [row] = await db
        .select({ imagePath: products.imagePath })
        .from(products)
        .where(eq(products.id, id));
      expect(row?.imagePath).toBe(NEW_IMG);
      expect(path).toBe(OLD_IMG);
    });

    await updateProduct(id, undefined, buildFormData({ images: [image(NEW_IMG)] }));

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith(OLD_IMG);
  });

  it("ne supprime rien quand la galerie est inchangée", async () => {
    const id = await insertProduct(OLD_IMG);
    const imageId = await imageIdOf(id, OLD_IMG);
    await updateProduct(id, undefined, buildFormData({ images: [image(OLD_IMG, imageId)] }));
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it("ne purge pas une photo simplement déplacée dans la galerie", async () => {
    const id = await insertProduct(OLD_IMG);
    const imageId = await imageIdOf(id, OLD_IMG);
    await updateProduct(
      id,
      undefined,
      buildFormData({ images: [image(NEW_IMG), image(OLD_IMG, imageId)] }),
    );
    expect(deleteImageMock).not.toHaveBeenCalled();

    const db = await getDb();
    const [row] = await db
      .select({ imagePath: products.imagePath })
      .from(products)
      .where(eq(products.id, id));
    expect(row?.imagePath).toBe(NEW_IMG);
  });

  it("purge la couverture orpheline d'un produit sans ligne de galerie", async () => {
    const db = await getDb();
    const [row] = await db
      .insert(products)
      .values({
        slug: `test-${randomUUID()}`,
        name: "Produit test",
        description: "Description",
        priceCents: 1000,
        category: "frais",
        imagePath: OLD_IMG,
      })
      .returning({ id: products.id });

    await updateProduct(row.id, undefined, buildFormData({ images: [image(NEW_IMG)] }));

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith(OLD_IMG);
  });

  it("ne supprime rien quand le produit est introuvable", async () => {
    const res = await updateProduct(
      randomUUID(),
      undefined,
      buildFormData({ images: [image(NEW_IMG)] }),
    );
    expect(res?.message).toBe("Produit introuvable.");
    expect(deleteImageMock).not.toHaveBeenCalled();
  });
});

describe("syncChildren via updateProduct — purge Storage des coloris (I4)", () => {
  it("purge l'image héritée d'un coloris retiré", async () => {
    const productId = await insertProduct(null);
    const keptColorId = await insertColor(productId, COLOR_IMG_A);
    await insertColor(productId, COLOR_IMG_B); // sera retiré

    await updateProduct(
      productId,
      undefined,
      buildFormData({
        colors: [
          { id: keptColorId, key: keptColorId, label: "Coloris", illustrationVariant: 0, active: true },
        ],
      }),
    );

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith(COLOR_IMG_B);
  });

  it("ne purge pas l'image d'un coloris conservé, même non gérée par le formulaire", async () => {
    const productId = await insertProduct(null);
    const colorId = await insertColor(productId, COLOR_IMG_A);

    await updateProduct(
      productId,
      undefined,
      buildFormData({
        colors: [
          { id: colorId, key: colorId, label: "Coloris", illustrationVariant: 0, active: true },
        ],
      }),
    );

    expect(deleteImageMock).not.toHaveBeenCalled();
    const db = await getDb();
    const [row] = await db
      .select({ imagePath: productColors.imagePath })
      .from(productColors)
      .where(eq(productColors.id, colorId));
    expect(row.imagePath).toBe(COLOR_IMG_A);
  });
});

describe("deleteProduct — purge Storage du produit et de ses coloris (I3)", () => {
  it("purge les photos du produit et celles de ses coloris", async () => {
    const db = await getDb();
    const productId = await insertProduct(OLD_IMG);
    await insertColor(productId, COLOR_IMG_A);
    await insertColor(productId, COLOR_IMG_B);
    await insertColor(productId, null); // pas d'image → pas d'appel

    await deleteProduct(productId);

    expect(deleteImageMock).toHaveBeenCalledTimes(3);
    const calledPaths = deleteImageMock.mock.calls.map((c) => c[0]).sort();
    expect(calledPaths).toEqual([COLOR_IMG_A, COLOR_IMG_B, OLD_IMG].sort());

    const remaining = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId));
    expect(remaining).toEqual([]);
  });

  it("ne fait aucun appel quand le produit et ses coloris n'ont pas d'image", async () => {
    const productId = await insertProduct(null);
    await insertColor(productId, null);
    await deleteProduct(productId);
    expect(deleteImageMock).not.toHaveBeenCalled();
  });
});
