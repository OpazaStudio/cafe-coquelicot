// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import { pageContent } from "@/lib/db/schema";

describe("table page_content", () => {
  it("stocke un document JSON par page", async () => {
    const db = await createTestDb({ seed: false });
    await db.insert(pageContent).values({ page: "home", data: { hero: { title: "Test" } } });
    const rows = await db.select().from(pageContent).where(eq(pageContent.page, "home"));
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toEqual({ hero: { title: "Test" } });
    expect(rows[0].updatedAt).toBeInstanceOf(Date);
  });
});
