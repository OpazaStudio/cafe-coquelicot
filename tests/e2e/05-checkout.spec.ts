import { expect, test, type Page } from "@playwright/test";
import { addToCart, adminLogin } from "./helpers";

// Parcours d'achat complet contre Stripe Checkout en MODE TEST (réseau requis) :
// panier → formulaire → page Stripe hébergée → carte 4242 → confirmation →
// commande payée dans l'admin → transitions de statut → KPIs du dashboard.
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

  // Panier : rivage (48€) + 2 × estran (22€) = 92€
  await page.goto("/boutique");
  await addToCart(page, "rivage");
  await addToCart(page, "estran");
  await addToCart(page, "estran");
  await page.goto("/checkout");

  // Formulaire : envoi postal (+7,90€) → total 99,90€
  await page.getByLabel("Nom complet *").fill("Camille Martin");
  await page.getByLabel("Email *").fill("camille.test@exemple.fr");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");
  await page.getByText("Envoi par la poste").click();
  await page.getByLabel("Adresse d'expédition *").fill("3 quai Valin");
  await page.getByLabel("Code postal *").fill("17000");
  await page.getByLabel("Ville *").fill("La Rochelle");
  // Le select pays ne propose que la France et ses voisins, France par défaut
  await expect(page.getByLabel("Pays *")).toHaveValue("FR");
  await expect(page.getByLabel("Pays *").locator("option")).toHaveCount(9);
  await page
    .getByLabel("Message pour la carte", { exact: false })
    .fill("Pour les tests, avec amour.");
  await expect(page.getByTestId("checkout-total")).toHaveText("99,90€");

  await page.getByRole("button", { name: "Payer avec Stripe" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });

  await fillStripeCheckout(page);

  await page.waitForURL(/\/commande\/confirmee/, { timeout: 90_000 });
  const confirmation = page.getByTestId("order-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("payée");
  await expect(confirmation).toContainText("Total payé");
  await expect(confirmation).toContainText("99,90€");
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
  await expect(row).toContainText("99,90€");
  await expect(row).toContainText("Envoi postal");
  await expect(row).toContainText("camille.test@exemple.fr");

  // Détail + transitions paid → preparing → delivered
  await row.getByRole("link", { name: "Détail" }).click();
  await expect(page.getByRole("heading", { name: `Commande ${orderNumber}` })).toBeVisible();
  await expect(page.getByText("quai Valin")).toBeVisible();
  await expect(page.getByText("17000 La Rochelle")).toBeVisible();
  await expect(page.getByText("Envoi par la poste")).toBeVisible();
  await expect(page.getByText("Pour les tests, avec amour.")).toBeVisible();

  await page.getByRole("button", { name: "Passer en préparation" }).click();
  await expect(page.getByText("En préparation").first()).toBeVisible();

  // N° de suivi Colissimo
  await page.getByPlaceholder("N° de suivi Colissimo").fill("6A1234567890123");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.reload();
  await expect(page.getByPlaceholder("N° de suivi Colissimo")).toHaveValue(
    "6A1234567890123",
  );

  await page.getByRole("button", { name: "Marquer expédiée" }).click();
  await expect(page.getByText("Expédiée").first()).toBeVisible();
});

test("le dashboard reflète la vente dans les KPIs", async ({ page }) => {
  expect(orderNumber, "le test de paiement doit passer d'abord").toMatch(/^CQ-/);
  await adminLogin(page);

  await expect(page.getByTestId("kpi-revenue")).toHaveText("99,90€");
  await expect(page.getByTestId("kpi-orders")).toHaveText("1");
  await expect(page.getByTestId("kpi-aov")).toHaveText("99,90€");
  await expect(page.getByTestId("kpi-items")).toHaveText("3");

  const top = page.getByTestId("top-products");
  await expect(top).toContainText("estran");
  await expect(top).toContainText("× 2");
  await expect(top).toContainText("rivage");
  await expect(page.getByTestId("revenue-chart")).toBeVisible();
  await expect(page.getByRole("link", { name: orderNumber })).toBeVisible();
});
