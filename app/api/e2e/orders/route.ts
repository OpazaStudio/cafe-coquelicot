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
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "@/lib/db/client";
import { orders, orderStatus, prepStatusEnum } from "@/lib/db/schema";
import { createPendingOrder } from "@/lib/orders";

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
    .array(z.object({ slug: z.string(), qty: z.number().int().min(1) }))
    .min(1),
  status: z.enum(orderStatus.enumValues).default("paid"),
  prepStatus: z.enum(prepStatusEnum.enumValues).default("todo"),
  prepDoneAt: z.iso.datetime().optional(),
});

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
  const { order } = await createPendingOrder(
    db,
    { name, email: "e2e@test.local", fulfillment: "retrait" },
    items,
  );
  // Écriture directe assumée : les hooks posent un état, ils ne rejouent
  // pas la machine de transitions.
  const [updated] = await db
    .update(orders)
    .set({
      status,
      prepStatus,
      prepDoneAt: prepDoneAt ? new Date(prepDoneAt) : null,
    })
    .where(eq(orders.id, order.id))
    .returning();

  return NextResponse.json({ id: updated.id, number: updated.number });
}
