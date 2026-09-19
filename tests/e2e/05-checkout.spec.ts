import { expect, test } from "@playwright/test";
import { addToCart, adminLogin, fillStripeCheckout } from "./helpers";

// Parcours d'achat complet contre Stripe Checkout en MODE TEST (réseau requis) :
// panier → formulaire → relais Mondial Relay → page Stripe hébergée → carte 4242 →
// confirmation → commande payée dans l'admin → transitions de statut → KPIs dashboard.
test.describe.configure({ mode: "serial" });

let orderNumber = "";

test("paiement Stripe test → confirmation → commande payée", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // Stub du widget Mondial Relay : RelayPicker charge jQuery → plugin en séquence,
  // puis appelle $.fn.MR_ParcelShopPicker. On injecte un faux plugin jQuery AVANT
  // le chargement de la page, et on neutralise les CDN pour que le chargeur
  // séquentiel résolve sans réseau et sans écraser le faux jQuery.
  await page.addInitScript(`
    (function () {
      var relay = { ID: "012345", Nom: "Tabac de la Gare", Adresse1: "1 rue des Lilas", CP: "17000", Ville: "La Rochelle" };
      function jq() {
        return { MR_ParcelShopPicker: function (o) { return window.jQuery.fn.MR_ParcelShopPicker(o); } };
      }
      jq.fn = { MR_ParcelShopPicker: function (o) { setTimeout(function () { o.OnParcelShopSelected(relay); }, 0); } };
      window.jQuery = jq;
    })();
  `);
  for (const cdn of [
    "https://ajax.googleapis.com/**",
    "**/parcelshop-picker/**",
  ]) {
    await page.route(cdn, (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
  }

  // Panier : rivage (48€) + 2 × estran (22€) = 92€
  await page.goto("/boutique");
  await addToCart(page, "rivage");
  await addToCart(page, "estran");
  await addToCart(page, "estran");
  await page.goto("/checkout");

  // Formulaire : Mondial Relay (+4,90€) + carte manuscrite (+2€) → 98,90€
  await page.getByLabel("Nom complet *").fill("Camille Martin");
  await page.getByLabel("Email *").fill("camille.test@exemple.fr");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");

  // Sélection automatique du point relais (widget stubé)
  await expect(page.getByTestId("relay-selected")).toContainText(
    "Tabac de la Gare",
  );
  // total = sous-total (92€) + forfait
  await expect(page.getByTestId("checkout-total")).toBeVisible();

  await page
    .getByLabel("Message pour la carte", { exact: false })
    .fill("Pour les tests, avec amour.");
  await expect(page.getByTestId("checkout-total")).toHaveText("98,90€");

  await page.getByRole("button", { name: "Payer avec Stripe" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });

  await fillStripeCheckout(page);

  await page.waitForURL(/\/commande\/confirmee/, { timeout: 90_000 });
  const confirmation = page.getByTestId("order-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("payée");
  await expect(confirmation).toContainText("Total payé");
  await expect(confirmation).toContainText("98,90€");
  await expect(confirmation).toContainText("rivage × 1");
  await expect(confirmation).toContainText("estran × 2");

  const numberText = await confirmation
    .locator("p", { hasText: "Commande CQ-" })
    .textContent();
  orderNumber = numberText?.match(/CQ-[A-Z0-9-]+/)?.[0] ?? "";
  expect(orderNumber).toMatch(/^CQ-/);

  // Le panier est vidé après paiement
  await expect(page.getByRole("link", { name: "Panier (0)" })).toBeVisible();
});

test("la commande payée apparaît dans l'admin et suit ses statuts", async ({
  page,
}) => {
  expect(orderNumber, "le test de paiement doit passer d'abord").toMatch(/^CQ-/);
  await adminLogin(page);

  await page.goto("/admin/commandes?vue=tableau");
  const row = page.getByTestId(`order-row-${orderNumber}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("Payée");
  await expect(row).toContainText("98,90€");
  await expect(row).toContainText("Mondial Relay");
  await expect(row).toContainText("camille.test@exemple.fr");

  // Détail + transitions paid → preparing → delivered
  await row.getByRole("link", { name: "Détail" }).click();
  await expect(
    page.getByRole("heading", { name: `Commande ${orderNumber}` }),
  ).toBeVisible();
  await expect(page.getByText("Tabac de la Gare")).toBeVisible();
  await expect(page.getByText("1 rue des Lilas")).toBeVisible();
  await expect(page.getByText("Point relais Mondial Relay")).toBeVisible();
  await expect(page.getByText("Pour les tests, avec amour.")).toBeVisible();

  await page.getByRole("button", { name: "Passer en préparation" }).click();
  await expect(page.getByText("En préparation").first()).toBeVisible();

  // N° de suivi Mondial Relay
  await page
    .getByPlaceholder("N° de suivi Mondial Relay")
    .fill("6A1234567890123");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.reload();
  await expect(
    page.getByPlaceholder("N° de suivi Mondial Relay"),
  ).toHaveValue("6A1234567890123");

  await page.getByRole("button", { name: "Marquer expédiée" }).click();
  await expect(page.getByText("Expédiée").first()).toBeVisible();
});

test("le dashboard reflète la vente dans les KPIs", async ({ page }) => {
  expect(orderNumber, "le test de paiement doit passer d'abord").toMatch(/^CQ-/);
  await adminLogin(page);

  await expect(page.getByTestId("kpi-revenue")).toHaveText("98,90€");
  await expect(page.getByTestId("kpi-orders")).toHaveText("1");
  await expect(page.getByTestId("kpi-aov")).toHaveText("98,90€");
  await expect(page.getByTestId("kpi-items")).toHaveText("3");

  const top = page.getByTestId("top-products");
  await expect(top).toContainText("estran");
  await expect(top).toContainText("× 2");
  await expect(top).toContainText("rivage");
  await expect(page.getByTestId("revenue-chart")).toBeVisible();
  await expect(page.getByRole("link", { name: orderNumber })).toBeVisible();
});
