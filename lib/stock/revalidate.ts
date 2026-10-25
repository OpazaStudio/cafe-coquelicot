import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { orderItems, products } from "@/lib/db/schema";

export async function slugsOfOrder(db: Db, orderId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: products.slug })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
  return [...new Set(rows.map((row) => row.slug))];
}

export async function revalidateAvailability(
  orderIds: string[],
  known?: Db,
): Promise<void> {
  try {
    const db = known ?? (await getDb());
    const slugs = new Set<string>();
    for (const orderId of orderIds) {
      for (const slug of await slugsOfOrder(db, orderId)) slugs.add(slug);
    }
    revalidatePath("/");
    revalidatePath("/boutique");
    for (const slug of slugs) revalidatePath(`/boutique/${slug}`);
  } catch (err) {
    console.error("[stock] revalidation du cache impossible", { orderIds }, err);
  }
}
