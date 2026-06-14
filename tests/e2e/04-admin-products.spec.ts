import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("CRUD produits", () => {
  test("créer, voir en boutique, éditer, masquer, supprimer", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await adminLogin(page);

    // Créer
    await page.goto("/admin/produits");
    await page.getByRole("link", { name: "+ Nouveau produit" }).click();
    await page.waitForURL("**/admin/produits/nouveau");
    await page.getByLabel("Nom").fill("pivoine du test");
    await page.getByLabel("Sous-titre").fill("Bouquet éphémère");
    await page
      .getByLabel("Description")
      .fill("Pivoines de test, assemblées par Playwright.");
    await page.getByLabel("Prix de base (€)").fill("29,90");
    await page.getByLabel("Catégorie").selectOption("frais");
    await page.getByLabel("Badge", { exact: false }).fill("Test");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL("**/admin/produits");

    const row = page.getByTestId("product-row-pivoine-du-test");
    await expect(row).toBeVisible();
    await expect(row).toContainText("29,90€");
    await expect(row).toContainText("En ligne");

    // Visible en boutique
    await page.goto("/boutique");
    await expect(page.locator(".boutique-grid .product-card")).toHaveCount(15);
    const card = page.locator(".product-card", { hasText: "pivoine du test" });
    await expect(card).toContainText("dès 29,90€");
    await expect(card).toContainText("Test");

    // Éditer le prix
    await page.goto("/admin/produits");
    await row.getByRole("link", { name: "Modifier" }).click();
    await page.waitForURL("**/admin/produits/*");
    await page.getByLabel("Prix de base (€)").fill("31");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForURL("**/admin/produits");
    await expect(row).toContainText("31€");

    // Masquer → disparaît de la boutique
    await row.getByRole("button", { name: "Masquer" }).click();
    await expect(row).toContainText("Masqué");
    await page.goto("/boutique");
    await expect(page.locator(".boutique-grid .product-card")).toHaveCount(14);
    await expect(
      page.locator(".product-card", { hasText: "pivoine du test" }),
    ).toHaveCount(0);

    // Supprimer
    await page.goto("/admin/produits");
    await row.getByRole("button", { name: "Supprimer" }).click();
    await expect(row).toHaveCount(0);
  });

  test("la validation refuse un prix invalide", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/produits/nouveau");
    await page.getByLabel("Nom").fill("produit cassé");
    await page.getByLabel("Sous-titre").fill("x");
    await page.getByLabel("Description").fill("x");
    await page.getByLabel("Prix de base (€)").fill("pas-un-prix");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await expect(page.getByText("Prix invalide — ex : 48 ou 48,50.")).toBeVisible();
    await page.goto("/admin/produits");
    await expect(page.getByTestId("product-row-produit-casse")).toHaveCount(0);
  });

  test("créer un produit avec tailles et coloris", async ({ page }) => {
    test.setTimeout(120_000);
    await adminLogin(page);
    await page.goto("/admin/produits/nouveau");
    await page.getByLabel("Nom").fill("bouquet variantes test");
    await page.getByLabel("Sous-titre").fill("Décliné");
    await page
      .getByLabel("Description")
      .fill("Produit variantisé par Playwright.");
    await page.getByLabel("Prix de base (€)").fill("20");
    await page.getByLabel("Catégorie").selectOption("frais");

    // Deux tailles (Petit 20 / Grand 40)
    await page.getByRole("button", { name: "+ Ajouter une taille" }).click();
    await page.getByLabel("Libellé taille 1").fill("Petit");
    await page.getByLabel("Prix taille 1").fill("20");
    await page.getByRole("button", { name: "+ Ajouter une taille" }).click();
    await page.getByLabel("Libellé taille 2").fill("Grand");
    await page.getByLabel("Prix taille 2").fill("40");

    // Un coloris
    await page.getByRole("button", { name: "+ Ajouter un coloris" }).click();
    await page.getByLabel("Libellé coloris 1").fill("Pastel");

    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL("**/admin/produits");

    const row = page.getByTestId("product-row-bouquet-variantes-test");
    await expect(row).toBeVisible();
    await expect(row).toContainText("2 tailles · 1 coloris");
    await expect(row).toContainText("dès 20€");

    // En boutique : sélecteurs présents et prix réactif
    await page.goto("/boutique");
    const card = page.locator(".product-card", {
      hasText: "bouquet variantes test",
    });
    await expect(card.locator(".product-card__price")).toHaveText("20€");
    await card.getByRole("button", { name: "Grand", exact: true }).click();
    await expect(card.locator(".product-card__price")).toHaveText("40€");

    // Nettoyage (ne pas polluer le comptage des autres specs)
    await page.goto("/admin/produits");
    await row.getByRole("button", { name: "Supprimer" }).click();
    await expect(row).toHaveCount(0);
  });
});
