// @vitest-environment node
// I2/I3/I4 : purge Storage (best-effort) déclenchée par updateProduct /
// deleteProduct — vérifie que deleteImage n'est JAMAIS appelé avant qu'une
// transaction DB ait commité, et qu'il l'est bien pour les cas couverts par
// la revue (image produit remplacée, coloris retiré, coloris remplacé).
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
import { productColors, products } from "@/lib/db/schema";

const OLD_IMG = "11111111-1111-1111-1111-111111111111.png";
const NEW_IMG = "22222222-2222-2222-2222-222222222222.png";
const COLOR_IMG_A = "33333333-3333-3333-3333-333333333333.png";
const COLOR_IMG_B = "44444444-4444-4444-4444-444444444444.jpg";

function buildFormData(opts: {
  imagePath?: string;
  colors?: unknown[];
}): FormData {
  const fd = new FormData();
  fd.set("name", "Produit test");
  fd.set("tag", "Tag");
  fd.set("description", "Description");
  fd.set("price", "10");
  fd.set("category", "frais");
  fd.set("badge", "");
  fd.set("illustrationVariant", "0");
  fd.set("imagePath", opts.imagePath ?? "");
  fd.set("imageBgColor", "");
  fd.set("active", "on");
  fd.set("sizes", "[]");
  fd.set("colors", JSON.stringify(opts.colors ?? []));
  return fd;
}

async function insertProduct(imagePath: string | null) {
  const db = await getDb();
  const [row] = await db
    .insert(products)
    .values({
      slug: `test-${randomUUID()}`,
      name: "Produit test",
      tag: "Tag",
      description: "Description",
      priceCents: 1000,
      category: "frais",
      imagePath,
    })
    .returning({ id: products.id });
  return row.id;
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
  it("supprime l'ancienne image UNIQUEMENT après un commit réussi", async () => {
    const db = await getDb();
    const id = await insertProduct(OLD_IMG);

    deleteImageMock.mockImplementation(async (path: string) => {
      // Invariant clé de I2 : au moment de l'appel, la transaction a déjà
      // commité — la ligne porte donc déjà la NOUVELLE image.
      const [row] = await db
        .select({ imagePath: products.imagePath })
        .from(products)
        .where(eq(products.id, id));
      expect(row?.imagePath).toBe(NEW_IMG);
      expect(path).toBe(OLD_IMG);
    });

    await updateProduct(id, undefined, buildFormData({ imagePath: NEW_IMG }));

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith(OLD_IMG);
  });

  it("ne supprime rien quand l'imagePath ne change pas", async () => {
    const id = await insertProduct(OLD_IMG);
    await updateProduct(id, undefined, buildFormData({ imagePath: OLD_IMG }));
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it("ne supprime rien quand le produit est introuvable", async () => {
    const res = await updateProduct(
      randomUUID(),
      undefined,
      buildFormData({ imagePath: NEW_IMG }),
    );
    expect(res?.message).toBe("Produit introuvable.");
    expect(deleteImageMock).not.toHaveBeenCalled();
  });
});

describe("syncChildren via updateProduct — purge Storage des coloris (I4)", () => {
  it("purge l'image d'un coloris retiré", async () => {
    const productId = await insertProduct(null);
    const keptColorId = await insertColor(productId, COLOR_IMG_A);
    await insertColor(productId, COLOR_IMG_B); // sera retiré

    await updateProduct(
      productId,
      undefined,
      buildFormData({
        colors: [
          {
            id: keptColorId,
            label: "Coloris",
            illustrationVariant: 0,
            imagePath: COLOR_IMG_A,
            imageBgColor: null,
            active: true,
          },
        ],
      }),
    );

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith(COLOR_IMG_B);
  });

  it("purge l'ancienne image d'un coloris dont l'image a été remplacée", async () => {
    const productId = await insertProduct(null);
    const colorId = await insertColor(productId, COLOR_IMG_A);

    await updateProduct(
      productId,
      undefined,
      buildFormData({
        colors: [
          {
            id: colorId,
            label: "Coloris",
            illustrationVariant: 0,
            imagePath: COLOR_IMG_B,
            imageBgColor: null,
            active: true,
          },
        ],
      }),
    );

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith(COLOR_IMG_A);
  });
});

describe("deleteProduct — purge Storage du produit et de ses coloris (I3)", () => {
  it("purge l'image du produit et celles de ses coloris", async () => {
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
