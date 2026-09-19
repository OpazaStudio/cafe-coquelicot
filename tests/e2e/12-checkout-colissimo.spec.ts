import { expect, test } from "@playwright/test";
import { addToCart, adminLogin, fillStripeCheckout } from "./helpers";

async function neutralizeRelayWidget(page: import("@playwright/test").Page) {
  for (const cdn of ["https://ajax.googleapis.com/**", "**/parcelshop-picker/**"]) {
    await page.route(cdn, (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
  }
}

test.describe("paiement Colissimo", () => {
  test.describe.configure({ mode: "serial" });

  let orderNumber = "";

  test("checkout Colissimo : adresse, forfait 7,90 €, paiement, confirmation", async ({ page }) => {
    test.setTimeout(240_000);
    await neutralizeRelayWidget(page);

    await page.goto("/boutique");
    await addToCart(page, "rivage");
    await page.goto("/checkout");

    await page.getByLabel("Nom complet *").fill("Camille Martin");
    await page.getByLabel("Email *").fill("camille.colissimo@exemple.fr");
    await page.getByLabel("Téléphone").fill("06 12 34 56 78");

    await expect(page.getByRole("button", { name: "Choisissez un point relais" })).toBeDisabled();
    await page.getByText("À domicile par Colissimo").click();

    await page.getByLabel("Adresse (n° et rue) *").fill("3 quai Valin");
    await page.getByLabel("Code postal *").fill("17000");
    await page.getByLabel("Ville *").fill("La Rochelle");
    await expect(page.getByTestId("checkout-total")).toHaveText("55,90€");

    await page.getByRole("button", { name: "Payer avec Stripe" }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    await expect(page.getByText("Livraison Colissimo — à domicile")).toBeVisible();
    await fillStripeCheckout(page);

    await page.waitForURL(/\/commande\/confirmee/, { timeout: 90_000 });
    const confirmation = page.getByTestId("order-confirmation");
    await expect(confirmation).toContainText("55,90€");
    await expect(confirmation).toContainText("Colissimo à votre domicile");
    const numberText = await confirmation.locator("p", { hasText: "Commande CQ-" }).textContent();
    orderNumber = numberText?.match(/CQ-[A-Z0-9-]+/)?.[0] ?? "";
    expect(orderNumber).toMatch(/^CQ-/);
  });

  test("la commande Colissimo est lisible dans l'admin, sans bouton d'étiquette", async ({ page }) => {
    expect(orderNumber, "le test de paiement doit passer d'abord").toMatch(/^CQ-/);
    await adminLogin(page);

    await page.goto("/admin/commandes?vue=tableau");
    const row = page.getByTestId(`order-row-${orderNumber}`);
    await expect(row).toContainText("Colissimo");
    await row.getByRole("link", { name: "Détail" }).click();

    await expect(page.getByText("Livraison à domicile — Colissimo")).toBeVisible();
    await expect(page.getByText("3 quai Valin")).toBeVisible();
    await expect(page.getByText("17000 La Rochelle")).toBeVisible();
    await expect(page.getByRole("button", { name: /l'étiquette/ })).toHaveCount(0);

    await page.getByPlaceholder("N° de suivi Colissimo").fill("6A12345678901");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.reload();
    await expect(page.getByPlaceholder("N° de suivi Colissimo")).toHaveValue("6A12345678901");
  });
});

test.describe("forfait Colissimo éditable", () => {
  test("le forfait Colissimo modifié dans les paramètres s'applique au checkout", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/parametres");
    await page.getByLabel("Frais Colissimo (€)").fill("9,50");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");

    await neutralizeRelayWidget(page);
    await page.goto("/boutique");
    await addToCart(page, "rivage");
    await page.goto("/checkout");
    await expect(page.getByText("France métropolitaine — 9,50€")).toBeVisible();
    await page.getByText("À domicile par Colissimo").click();
    await expect(page.getByTestId("checkout-total")).toHaveText("57,50€");

    await page.goto("/livraison-retours");
    await expect(page.getByText(/9,50€/)).toBeVisible();

    await page.goto("/admin/parametres");
    await page.getByLabel("Frais Colissimo (€)").fill("7,90");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");
  });

  test("un forfait invalide est refusé dans les paramètres", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/parametres");
    await page.getByLabel("Frais Mondial Relay (€)").fill("abc");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Frais Mondial Relay" })).toBeVisible();
    await page.getByLabel("Frais Mondial Relay (€)").fill("4,90");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");
  });
});
