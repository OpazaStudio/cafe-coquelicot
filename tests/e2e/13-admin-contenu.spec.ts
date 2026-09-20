import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("éditeur de contenu", () => {
  test("l'aperçu suit la saisie, l'enregistrement met à jour le site", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/contenu/accueil");

    const hero = page.locator("section", { has: page.getByRole("heading", { name: "Bandeau d'accueil" }) });
    await hero.getByLabel("Titre", { exact: true }).fill("Café\nTest e2e");

    const frame = page.frameLocator('iframe[title="Aperçu de la page"]');
    await expect(frame.getByRole("heading", { level: 1 })).toContainText("Test e2e");

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Contenu enregistré." })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Test e2e");
  });

  test("une carte de prestation ajoutée apparaît sur l'accueil", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/contenu/accueil");

    const prestations = page.locator("section", { has: page.getByRole("heading", { name: "Prestations" }) });
    await prestations.getByRole("button", { name: "Ajouter une carte" }).click();
    const carte = prestations.locator("details").last();
    if (!(await carte.getByLabel("Nom").isVisible())) await carte.locator("summary").click();
    await carte.getByLabel("Nom").fill("deuil");
    await carte.getByLabel("Description").fill("Compositions sobres pour accompagner un adieu.");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Contenu enregistré." })).toBeVisible();

    await page.goto("/");
    await expect(page.locator(".prestation-card", { hasText: "deuil" })).toBeVisible();
  });

  test("un lien invalide est refusé", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/contenu/navigation");

    const menu = page.locator("section", { has: page.getByRole("heading", { name: "Menu de navigation" }) });
    const premier = menu.locator("details").first();
    if (!(await premier.getByLabel("Lien").isVisible())) await premier.locator("summary").click();
    await premier.getByLabel("Lien").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Lien" })).toBeVisible();
  });
});
