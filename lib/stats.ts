// Statistiques back-office : tout est agrégé en SQL sur orders/order_items,
// aucune table dédiée. Le CA ne compte que les commandes encaissées
// (paid → preparing → shipped/picked_up) — jamais pending ni cancelled.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { orderItems, orders, type OrderStatus } from "./db/schema";

export const REVENUE_STATUSES: OrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "picked_up",
];

export type Kpis = {
  revenueCents: number;
  orderCount: number;
  averageOrderCents: number;
  itemsSold: number;
};

export async function getKpis(db: Db): Promise<Kpis> {
  const [totals] = await db
    .select({
      revenueCents: sql`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
      orderCount: sql`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(inArray(orders.status, REVENUE_STATUSES));

  const [items] = await db
    .select({
      itemsSold: sql`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(inArray(orders.status, REVENUE_STATUSES));

  const revenueCents = totals?.revenueCents ?? 0;
  const orderCount = totals?.orderCount ?? 0;
  return {
    revenueCents,
    orderCount,
    averageOrderCents: orderCount > 0 ? Math.round(revenueCents / orderCount) : 0,
    itemsSold: items?.itemsSold ?? 0,
  };
}

export type DayPoint = { day: string; revenueCents: number; orders: number };

/** CA par jour sur `days` jours glissants, trous comblés à 0 pour les graphes. */
export async function getRevenueByDay(db: Db, days = 30): Promise<DayPoint[]> {
  const dayExpr = sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day: dayExpr,
      revenueCents: sql`sum(${orders.totalCents})`.mapWith(Number),
      orders: sql`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, REVENUE_STATUSES),
        sql`${orders.createdAt} >= date_trunc('day', now()) - make_interval(days => ${days - 1})`,
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const result: DayPoint[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    const row = byDay.get(key);
    result.push({
      day: key,
      revenueCents: row?.revenueCents ?? 0,
      orders: row?.orders ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export type TopProduct = {
  name: string;
  qty: number;
  revenueCents: number;
};

/** Classement par nom snapshoté : stable même si le produit a été supprimé. */
export async function getTopProducts(db: Db, limit = 5): Promise<TopProduct[]> {
  const qtyExpr = sql`sum(${orderItems.qty})`.mapWith(Number);
  return db
    .select({
      name: orderItems.nameSnapshot,
      qty: qtyExpr,
      revenueCents:
        sql`sum(${orderItems.qty} * ${orderItems.priceCentsSnapshot})`.mapWith(
          Number,
        ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(inArray(orders.status, REVENUE_STATUSES))
    .groupBy(orderItems.nameSnapshot)
    .orderBy(desc(qtyExpr))
    .limit(limit);
}

export async function getRecentOrders(db: Db, limit = 5) {
  return db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
