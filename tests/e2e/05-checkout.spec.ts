import { expect, test, type Page } from "@playwright/test";
import { addToCart, adminLogin } from "./helpers";

// Parcours d'achat complet contre Stripe Checkout en MODE TEST (réseau requis) :
// panier → formulaire → relais Mondial Relay → page Stripe hébergée → carte 4242 →
// confirmation → commande payée dans l'admin → transitions de statut → KPIs dashboard.
test.describe.configure({ mode: "serial" });

let orderNumber = "";

/** Cherche le champ carte dans la page OU dans une iframe Stripe. */
async function findCardFrame(page: Page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const input = frame.locator('input[name="cardNumber"]');
      if (await input.isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("Champ cardNumber introuvable (page Stripe).");
}

async function fillStripeCheckout(page: Page) {
  // La page Stripe est hébergée sur checkout.stripe.com. Le bouton « Payer
  // par carte » a une zone de clic étendue en pseudo-élément : Playwright le
  // juge invisible alors qu'il intercepte les clics → dispatchEvent direct.
  await page.waitForLoadState("domcontentloaded");
  const directCard = page.locator('input[name="cardNumber"]');
  if (!(await directCard.isVisible().catch(() => false))) {
    const accordion = page.locator(
      '[data-testid="card-accordion-item-button"]',
    );
    await accordion.waitFor({ state: "attached", timeout: 45_000 });
    await accordion.dispatchEvent("click");
  }

  const frame = await findCardFrame(page);
  await frame.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
  await frame.locator('input[name="cardExpiry"]').fill("12 / 34");
  await frame.locator('input[name="cardCvc"]').fill("123");
  const name = frame.locator('input[name="billingName"]');
  if (await name.isVisible().catch(() => false)) {
    await name.fill("Camille Martin");
  }
  const postal = frame.locator('input[name="billingPostalCode"]');
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill("17000");
  }
  await page
    .locator('[data-testid="hosted-payment-submit-button"]')
    .or(page.getByRole("button", { name: "Payer", exact: true }))
    .first()
    .click();
}

test("paiement Stripe test → confirmation → commande payée", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // Stub du widget Mondial Relay (parcelshop-picker) : émet OnParcelShopSelected
  // avec un relais FR fixe dès le chargement, sans appel réseau réel.
  await page.route("**/parcelshop-picker/**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.jQuery = window.jQuery || ((sel) => ({ MR_ParcelShopPicker: (o) => {
        const data = { ID: "012345", Nom: "Tabac de la Gare", Adresse1: "1 rue des Lilas", CP: "17000", Ville: "La Rochelle" };
        setTimeout(() => o.OnParcelShopSelected(data), 50);
      }}));`,
    });
  });
  // Neutraliser le chargement de jQuery CDN (le stub fournit window.jQuery).
  await page.route("**/jquery*.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );

  // Panier : rivage (48€) + 2 × estran (22€) = 92€
  await page.goto("/boutique");
  await addToCart(page, "rivage");
  await addToCart(page, "estran");
  await addToCart(page, "estran");
  await page.goto("/checkout");

  // Formulaire : Mondial Relay (+4,90€) → total 96,90€
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
  await expect(page.getByTestId("checkout-total")).toHaveText("96,90€");

  await page.getByRole("button", { name: "Payer avec Stripe" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });

  await fillStripeCheckout(page);

  await page.waitForURL(/\/commande\/confirmee/, { timeout: 90_000 });
  const confirmation = page.getByTestId("order-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("payée");
  await expect(confirmation).toContainText("Total payé");
  await expect(confirmation).toContainText("96,90€");
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
  await expect(row).toContainText("96,90€");
  await expect(row).toContainText("Mondial Relay");
  await expect(row).toContainText("camille.test@exemple.fr");

  // Détail + transitions paid → preparing → delivered
  await row.getByRole("link", { name: "Détail" }).click();
  await expect(
    page.getByRole("heading", { name: `Commande ${orderNumber}` }),
  ).toBeVisible();
  await expect(page.getByText("Tabac de la Gare")).toBeVisible();
  await expect(page.getByText("1 rue des Lilas")).toBeVisible();
  await expect(page.getByText("Mondial Relay")).toBeVisible();
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

  await expect(page.getByTestId("kpi-revenue")).toHaveText("96,90€");
  await expect(page.getByTestId("kpi-orders")).toHaveText("1");
  await expect(page.getByTestId("kpi-aov")).toHaveText("96,90€");
  await expect(page.getByTestId("kpi-items")).toHaveText("3");

  const top = page.getByTestId("top-products");
  await expect(top).toContainText("estran");
  await expect(top).toContainText("× 2");
  await expect(top).toContainText("rivage");
  await expect(page.getByTestId("revenue-chart")).toBeVisible();
  await expect(page.getByRole("link", { name: orderNumber })).toBeVisible();
});
