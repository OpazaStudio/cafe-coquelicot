import Link from "next/link";
import type { ReactNode } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db/client";
import { listBoardOrders, listOrders } from "@/lib/orders";
import { KanbanBoard } from "./kanban-board";
import { OrdersTable } from "./orders-table";

export const dynamic = "force-dynamic";

export default async function CommandesPage({
  searchParams,
}: PageProps<"/admin/commandes">) {
  await verifySession();
  const { vue } = await searchParams;
  const showTable = vue === "tableau";
  const db = await getDb();
  const tableOrders = showTable ? await listOrders(db) : [];
  const boardOrders = showTable ? [] : await listBoardOrders(db);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commandes</h1>
          <p className="text-sm text-muted">
            {showTable
              ? `${tableOrders.length} commande${tableOrders.length > 1 ? "s" : ""} au total`
              : "Préparation — les cartes terminées disparaissent après 48h"}
          </p>
        </div>
        <nav
          aria-label="Vue des commandes"
          className="flex rounded-lg border border-line bg-surface p-1 text-sm font-medium"
        >
          <ViewLink href="/admin/commandes" active={!showTable}>
            Kanban
          </ViewLink>
          <ViewLink href="/admin/commandes?vue=tableau" active={showTable}>
            Tableau
          </ViewLink>
        </nav>
      </div>

      {showTable ? (
        <OrdersTable orders={tableOrders} />
      ) : (
        <KanbanBoard orders={boardOrders} />
      )}
    </>
  );
}

function ViewLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-md px-3 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none ${
        active ? "bg-wine text-linen" : "text-muted hover:bg-hover"
      }`}
    >
      {children}
    </Link>
  );
}
