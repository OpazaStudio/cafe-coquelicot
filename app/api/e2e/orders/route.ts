// Hooks e2e : création de commandes en état arbitraire (statut, kanban,
// date de fin antidatée). Activé uniquement quand E2E_TEST_HOOKS=1
// (posé par playwright.config.ts) — 404 dans tous les autres cas.
// La route écrit des commandes `paid` sans authentification : le flag seul ne
// suffit pas à l'ouvrir. Elle exige en plus une base PGlite jetable
// (DATABASE_URL vide) et l'absence de plateforme d'hébergement — un
// E2E_TEST_HOOKS=1 ayant fuité dans un env group Vercel reste sans effet.
// NODE_ENV ne peut pas servir de critère : les e2e tournent eux-mêmes contre
// un build de production (playwright.config.ts).
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { getDb, type Db } from "@/lib/db/client";
import {
  orderStatus,
  prepStatusEnum,
  productColors,
  productSizes,
  products,
} from "@/lib/db/schema";
import {
  CheckoutError,
  createPendingOrder,
  setOrderStatusIfUnchanged,
  updateOrderStatus,
  type CheckoutItemInput,
} from "@/lib/orders";

function e2eHooksEnabled(): boolean {
  if (process.env.E2E_TEST_HOOKS !== "1") return false;
  // Une base distante configurée = environnement réel, jamais un banc e2e.
  if (process.env.DATABASE_URL) return false;
  // Ni Vercel, ni aucune plateforme d'hébergement connue.
  if (process.env.VERCEL || process.env.NETLIFY || process.env.RENDER) return false;
  return true;
}

const BodySchema = z.object({
  name: z.string().min(1).max(100),
  items: z
    .array(
      z.object({
        slug: z.string(),
        qty: z.number().int().min(1),
        sizeLabel: z.string().optional(),
        colorLabel: z.string().optional(),
      }),
    )
    .min(1),
  status: z.enum(orderStatus.enumValues).default("paid"),
  prepStatus: z.enum(prepStatusEnum.enumValues).default("todo"),
  prepDoneAt: z.iso.datetime().optional(),
});

type BodyItem = z.infer<typeof BodySchema>["items"][number];

function indexByProduct(
  rows: { slug: string; label: string; id: string }[],
): Map<string, Map<string, string>> {
  const indexed = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const byLabel = indexed.get(row.slug) ?? new Map<string, string>();
    byLabel.set(row.label, row.id);
    indexed.set(row.slug, byLabel);
  }
  return indexed;
}

function resolveLabel(
  indexed: Map<string, Map<string, string>>,
  slug: string,
  kind: string,
  label?: string,
): string | null {
  if (!label) return null;
  const id = indexed.get(slug)?.get(label);
  if (!id) {
    throw new CheckoutError(`${kind} « ${label} » introuvable pour ${slug}.`);
  }
  return id;
}

async function resolveItems(
  db: Db,
  items: BodyItem[],
): Promise<CheckoutItemInput[]> {
  const slugs = items.map((item) => item.slug);
  const sizeRows = await db
    .select({ slug: products.slug, label: productSizes.label, id: productSizes.id })
    .from(productSizes)
    .innerJoin(products, eq(productSizes.productId, products.id))
    .where(and(inArray(products.slug, slugs), eq(productSizes.active, true)));
  const colorRows = await db
    .select({ slug: products.slug, label: productColors.label, id: productColors.id })
    .from(productColors)
    .innerJoin(products, eq(productColors.productId, products.id))
    .where(and(inArray(products.slug, slugs), eq(productColors.active, true)));
  const sizes = indexByProduct(sizeRows);
  const colors = indexByProduct(colorRows);
  return items.map((item) => ({
    slug: item.slug,
    qty: item.qty,
    sizeId: resolveLabel(sizes, item.slug, "Taille", item.sizeLabel),
    colorId: resolveLabel(colors, item.slug, "Coloris", item.colorLabel),
  }));
}

export async function POST(request: Request) {
  if (!e2eHooksEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const { name, items, status, prepStatus, prepDoneAt } = parsed.data;

  const db = await getDb();
  let created: Awaited<ReturnType<typeof createPendingOrder>>;
  try {
    created = await createPendingOrder(
      db,
      { name, email: "e2e@test.local", fulfillment: "retrait" },
      await resolveItems(db, items),
    );
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
  const { order } = created;

  const cancelled = status === "cancelled";
  const posed = await setOrderStatusIfUnchanged(
    db,
    order.id,
    "pending",
    cancelled ? "pending" : status,
    { prepStatus, prepDoneAt: prepDoneAt ? new Date(prepDoneAt) : null },
  );
  if (!posed) {
    throw new Error("La commande e2e a changé de statut avant la pose de l'état.");
  }
  if (cancelled) await updateOrderStatus(db, order.id, "cancelled");

  return NextResponse.json({ id: order.id, number: order.number });
}
