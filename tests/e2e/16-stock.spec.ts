import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { adminLogin, neutralizeRelayWidget } from "./helpers";

const LIMITED = "Petit";
const UNLIMITED = "Grand";
const LIMITED_PRICE = "30";
const UNLIMITED_PRICE = "45";
const BUYER_EMAIL = "stock.refus@exemple.fr";
const HOOK_CUSTOMER = "Retenue Stock";
const HOOK_EMAIL = "e2e@test.local";
const CREATED_BADGE = "Saison";
const SAVED_BADGE = "Hiver";
const HELD_LABEL = "+ 1 retenue par des commandes en attente de paiement";
const RESTOCK_INPUT = 'input[name="restock"]';
const RESTOCK_LABEL = "Remettre en stock les unités réservées par cette commande";
const SERVER_ACTION_TIMEOUT = 30_000;
const POLL_INTERVALS = [500, 1_000, 2_000, 5_000];

function limitedSizeButton(shop: Page) {
  return shop.getByRole("button", { name: new RegExp(`^${LIMITED} · `) });
}

async function expectCancelled(probe: Page, orderId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        await probe.goto(`/admin/commandes/${orderId}`);
        return probe.locator("main").getByText("Annulée").count();
      },
      { intervals: POLL_INTERVALS, timeout: SERVER_ACTION_TIMEOUT },
    )
    .toBe(1);
}

async function expectLimitedSizeLabel(
  shop: Page,
  slug: string,
  expected: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await shop.goto(`/boutique/${slug}`);
        const texts = await limitedSizeButton(shop).allTextContents();
        return texts.map((text) => text.replace(/\s+/g, " ").trim()).join(" | ");
      },
      { intervals: POLL_INTERVALS, timeout: SERVER_ACTION_TIMEOUT },
    )
    .toBe(expected);
}

async function holdLimitedUnit(
  request: APIRequestContext,
  slug: string,
  status: "pending" | "paid" | "cancelled",
) {
  const response = await request.post("/api/e2e/orders", {
    data: {
      name: HOOK_CUSTOMER,
      status,
      items: [{ slug, qty: 1, sizeLabel: LIMITED }],
    },
  });
  return response;
}

test("stock par taille : retenue, refus au checkout, libération à l'annulation, remise en stock d'une commande payée", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000);

  const attempt = test.info().retry;
  const name = attempt > 0 ? `bouquet stock e2e ${attempt}` : "bouquet stock e2e";
  const slug = name.replace(/ /g, "-");

  const admin = await context.newPage();
  const editForm = await context.newPage();
  const probe = await context.newPage();
  const limitedSize = limitedSizeButton(page);
  const payButton = page.getByRole("button", { name: /^Payer avec Stripe/ });
  let orderId = "";
  let orderNumber = "";
  let editUrl = "";
  let bodyOk = false;

  try {
    await test.step("le back-office crée un produit à deux tailles, l'une limitée à 1", async () => {
      await adminLogin(admin);
      await admin.goto("/admin/produits/nouveau");
      await admin.getByLabel("Nom", { exact: true }).fill(name);
      await admin
        .getByLabel("Description du produit")
        .fill("Deux tailles, une seule unité sur la petite.");
      await admin.getByLabel("Prix de base (€)").fill(LIMITED_PRICE);
      await admin.getByLabel("Catégorie").selectOption("frais");
      await admin.getByLabel("Badge", { exact: false }).fill(CREATED_BADGE);

      await admin.getByRole("button", { name: "+ Ajouter une taille" }).click();
      await admin.getByLabel("Libellé taille 1").fill(LIMITED);
      await admin.getByLabel("Prix taille 1").fill(LIMITED_PRICE);
      await admin.getByLabel("Stock taille 1", { exact: true }).fill("1");

      await admin.getByRole("button", { name: "+ Ajouter une taille" }).click();
      await admin.getByLabel("Libellé taille 2").fill(UNLIMITED);
      await admin.getByLabel("Prix taille 2").fill(UNLIMITED_PRICE);
      await expect(admin.getByLabel("Stock taille 2", { exact: true })).toHaveValue("");

      await admin.getByRole("button", { name: "Créer le produit" }).click();
      await admin.waitForURL("**/admin/produits");

      const row = admin.getByTestId(`product-row-${slug}`);
      await expect(row).toContainText("2 tailles");
      await expect(row).toContainText("En ligne");
      await expect(row).not.toContainText("Épuisé");

      editUrl = (await row.getByRole("link", { name: "Modifier" }).getAttribute("href")) ?? "";
      expect(editUrl).toMatch(/^\/admin\/produits\/[0-9a-f-]{36}$/);
    });

    await test.step("la taille limitée est achetable et entre au panier", async () => {
      await page.goto(`/boutique/${slug}`);
      await expect(limitedSize).toHaveText(`${LIMITED} · ${LIMITED_PRICE}€`);
      await limitedSize.click();
      await expect(page.getByTestId("product-price")).toHaveText(`${LIMITED_PRICE}€`);
      await page.getByRole("button", { name: `Ajouter ${name} au panier` }).click();
      await expect(page.getByRole("link", { name: "Panier (1)" })).toBeVisible();
    });

    await test.step("le tunnel voit la dernière unité disponible", async () => {
      await neutralizeRelayWidget(page);
      await page.goto("/checkout");
      await page.getByLabel("Nom complet *").fill("Camille Stock");
      await page.getByLabel("Email *").fill(BUYER_EMAIL);
      await page.getByLabel("Téléphone").fill("06 12 34 56 78");
      await page.getByText("À domicile par Colissimo").click();
      await page.getByLabel("Adresse (n° et rue) *").fill("3 quai Valin");
      await page.getByLabel("Code postal *").fill("17000");
      await page.getByLabel("Ville *").fill("La Rochelle");

      await expect(page.getByText("Plus que 1 en stock")).toBeVisible();
      await expect(payButton).toBeEnabled();
    });

    await test.step("la fiche produit est ouverte avant la retenue, compteur à 1", async () => {
      await editForm.goto(editUrl);
      await expect(editForm.getByLabel("Stock taille 1", { exact: true })).toHaveValue("1");
      await expect(editForm.getByLabel("Stock taille 2", { exact: true })).toHaveValue("");
      await expect(editForm.getByText(HELD_LABEL)).toHaveCount(0);
    });

    await test.step("une commande en attente retient l'unique exemplaire", async () => {
      const response = await holdLimitedUnit(request, slug, "pending");
      expect(response.status(), await response.text()).toBe(200);
      const body = await response.json();
      orderId = body.id;
      orderNumber = body.number;
      expect(orderNumber).toMatch(/^CQ-/);
    });

    await test.step("le checkout est refusé avant tout appel à Stripe", async () => {
      await payButton.click();
      const refusal = page.getByRole("alert").filter({ hasText: "Stock insuffisant" });
      await expect(refusal).toHaveText(
        `Stock insuffisant pour ${name} — ${LIMITED} (1 demandé). Retirez-le du panier.`,
      );
      expect(new URL(page.url()).pathname).toBe("/checkout");

      await admin.goto("/admin/commandes?vue=tableau");
      const table = admin.locator("main");
      const hookRow = table.getByTestId(`order-row-${orderNumber}`);
      await expect(hookRow).toHaveCount(1);
      await expect(hookRow).toContainText(HOOK_EMAIL);
      await expect(table.getByText(BUYER_EMAIL)).toHaveCount(0);
    });

    await test.step("rechargé, le tunnel bloque la soumission", async () => {
      await page.goto("/checkout");
      await page.getByText("À domicile par Colissimo").click();
      await expect(page.getByText("Épuisé")).toBeVisible();
      const blocked = page.getByRole("button", { name: /^Ajustez votre panier/ });
      await expect(blocked).toBeVisible();
      await expect(blocked).toBeDisabled();
    });

    await test.step("l'épuisement ne touche que la taille limitée", async () => {
      await page.goto(`/boutique/${slug}`);
      await expect(limitedSize).toHaveText(`${LIMITED} · ${LIMITED_PRICE}€ · Épuisé`);
      await expect(limitedSize).toHaveAttribute("aria-disabled", "true");
      const unlimitedSize = page.getByRole("button", {
        name: new RegExp(`^${UNLIMITED} · `),
      });
      await expect(unlimitedSize).toHaveText(`${UNLIMITED} · ${UNLIMITED_PRICE}€`);
      await expect(unlimitedSize).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: `Ajouter ${name} au panier` }),
      ).toBeVisible();

      await page.goto("/boutique");
      const card = page.locator(".product-card", { hasText: name });
      await expect(card).toContainText(`dès ${UNLIMITED_PRICE}€`);
      await expect(card.locator(".product-card__badge")).toHaveText(CREATED_BADGE);
      await expect(card).not.toContainText("Épuisé");

      await admin.goto("/admin/produits");
      const row = admin.getByTestId(`product-row-${slug}`);
      await expect(row).toContainText("En ligne");
      await expect(row).not.toContainText("Épuisé");
    });

    await test.step("enregistrer la fiche ne touche pas le compteur", async () => {
      await editForm.getByLabel("Badge", { exact: false }).fill(SAVED_BADGE);
      await editForm.getByRole("button", { name: "Enregistrer" }).click();
      await editForm.waitForURL("**/admin/produits");

      await editForm.goto(editUrl);
      await expect(editForm.getByLabel("Badge", { exact: false })).toHaveValue(SAVED_BADGE);
      await expect(editForm.getByLabel("Stock taille 1", { exact: true })).toHaveValue("0");
      await expect(editForm.getByLabel("Stock taille 2", { exact: true })).toHaveValue("");
      await expect(editForm.getByText(HELD_LABEL)).toBeVisible();
    });

    await test.step("annuler la commande libère l'unité", async () => {
      await admin.goto(`/admin/commandes/${orderId}`);
      const detail = admin.locator("main");
      await expect(detail.getByRole("heading", { name: `Commande ${orderNumber}` })).toBeVisible();
      await expect(detail.locator(RESTOCK_INPUT)).toHaveCount(0);
      await expect(detail.getByText(RESTOCK_LABEL)).toHaveCount(0);

      await detail.getByRole("button", { name: "Annuler la commande" }).click();
      await expectCancelled(probe, orderId);
      await expect(
        probe.locator("main").getByText("Statut final — plus aucune transition possible."),
      ).toBeVisible();
    });

    await test.step("l'achat redevient possible", async () => {
      await editForm.goto(editUrl);
      await expect(editForm.getByLabel("Stock taille 1", { exact: true })).toHaveValue("1");
      await expect(editForm.getByText(HELD_LABEL)).toHaveCount(0);

      await expectLimitedSizeLabel(page, slug, `${LIMITED} · ${LIMITED_PRICE}€`);

      await page.goto("/checkout");
      await page.getByText("À domicile par Colissimo").click();
      await expect(page.getByText("Plus que 1 en stock")).toBeVisible();
      await expect(payButton).toBeEnabled();

      const retry = await holdLimitedUnit(request, slug, "cancelled");
      expect(retry.status(), await retry.text()).toBe(200);
      await editForm.goto(editUrl);
      await expect(editForm.getByLabel("Stock taille 1", { exact: true })).toHaveValue("1");
    });

    await test.step("sur une commande payée, la case de remise en stock est là et recrédite", async () => {
      const response = await holdLimitedUnit(request, slug, "paid");
      expect(response.status(), await response.text()).toBe(200);
      const paid = await response.json();

      await editForm.goto(editUrl);
      await expect(editForm.getByLabel("Stock taille 1", { exact: true })).toHaveValue("0");
      await expect(editForm.getByText(HELD_LABEL)).toHaveCount(0);

      await admin.goto(`/admin/commandes/${paid.id}`);
      const detail = admin.locator("main");
      const restock = detail.locator(RESTOCK_INPUT);
      await expect(restock).toHaveCount(1);
      await expect(detail.getByText(RESTOCK_LABEL)).toBeVisible();

      await restock.check();
      await detail.getByRole("button", { name: "Annuler la commande" }).click();
      await expectCancelled(probe, paid.id);

      await editForm.goto(editUrl);
      await expect(editForm.getByLabel("Stock taille 1", { exact: true })).toHaveValue("1");
    });

    bodyOk = true;
  } finally {
    const cleanup = test.step("nettoyage : le produit de test quitte le catalogue", async () => {
      if (orderId !== "") {
        await admin.goto(`/admin/commandes/${orderId}`);
        const cancel = admin
          .locator("main")
          .getByRole("button", { name: "Annuler la commande" });
        if ((await cancel.count()) > 0) {
          await cancel.click();
          await expectCancelled(probe, orderId);
        }
      }
      await admin.goto("/admin/produits");
      const row = admin.getByTestId(`product-row-${slug}`);
      if ((await row.count()) === 0) return;
      await row.getByRole("button", { name: "Supprimer" }).click();
      await expect(admin.getByTestId("product-row-rivage")).toHaveCount(1);
      await expect(row).toHaveCount(0);
    });
    if (bodyOk) await cleanup;
    else await cleanup.catch(() => {});
  }
});
