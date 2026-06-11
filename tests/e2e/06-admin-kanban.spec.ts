import { expect, test, type APIRequestContext } from "@playwright/test";
import { adminLogin } from "./helpers";

// Kanban de préparation. Les commandes sont seedées via les hooks e2e
// (/api/e2e/orders) — aucune dépendance au parcours Stripe du spec 05.
test.describe.configure({ mode: "serial" });

const HOURS = 60 * 60 * 1000;

async function seedOrder(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; number: string }> {
  const res = await request.post("/api/e2e/orders", { data: body });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

let fresh = { id: "", number: "" };

test("une commande payée apparaît en « En attente »", async ({
  page,
  request,
}) => {
  fresh = await seedOrder(request, {
    name: "Léa Kanban",
    items: [{ slug: "rivage", qty: 1 }],
  });
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await expect(page.getByTestId("kanban-col-todo")).toContainText(fresh.number);
  await expect(page.getByTestId("kanban-col-todo")).toContainText("Léa Kanban");
});

test("le bouton déplace la carte vers « En cours de traitement »", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await page
    .getByRole("button", {
      name: `Déplacer ${fresh.number} vers En cours de traitement`,
    })
    .click();
  await expect(page.getByTestId("kanban-col-in_progress")).toContainText(
    fresh.number,
  );
  await expect(page.getByTestId("kanban-col-todo")).not.toContainText(
    fresh.number,
  );
});

test("le drag-and-drop termine la carte", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/commandes");
  const card = page.getByTestId(`kanban-card-${fresh.number}`);
  // Playwright pilote le DnD HTML5 natif dans Chromium via dragTo.
  await card.dragTo(page.getByTestId("kanban-col-done"));
  await expect(page.getByTestId("kanban-col-done")).toContainText(fresh.number);
  await expect(page.getByTestId("kanban-col-in_progress")).not.toContainText(
    fresh.number,
  );
});

test("bascule kanban ↔ tableau", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await page.getByRole("link", { name: "Tableau" }).click();
  await expect(page.getByTestId(`order-row-${fresh.number}`)).toBeVisible();
  await page.getByRole("link", { name: "Kanban" }).click();
  await expect(page.getByTestId("kanban-col-done")).toContainText(fresh.number);
});

test("terminée depuis plus de 48h : hors du board, toujours dans le tableau", async ({
  page,
  request,
}) => {
  const old = await seedOrder(request, {
    name: "Vieille Terminée",
    items: [{ slug: "estran", qty: 1 }],
    status: "picked_up",
    prepStatus: "done",
    prepDoneAt: new Date(Date.now() - 49 * HOURS).toISOString(),
  });
  await adminLogin(page);
  await page.goto("/admin/commandes");
  await expect(page.getByTestId("kanban-col-done")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(old.number);
  await page.goto("/admin/commandes?vue=tableau");
  await expect(page.getByTestId(`order-row-${old.number}`)).toBeVisible();
});
