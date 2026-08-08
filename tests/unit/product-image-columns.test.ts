// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { products } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";

describe("colonnes image", () => {
  it("un produit peut porter image_path et image_bg_color", async () => {
    const db = await createTestDb({ seed: false });
    const [row] = await db
      .insert(products)
      .values({
        slug: "test-image-col",
        name: "test",
        tag: "t",
        description: "d",
        priceCents: 1000,
        category: "frais",
        imagePath: "uuid.png",
        imageBgColor: "#eee",
      })
      .returning();
    expect(row.imagePath).toBe("uuid.png");
    expect(row.imageBgColor).toBe("#eee");
    await db.delete(products).where(eq(products.id, row.id));
  });
});
