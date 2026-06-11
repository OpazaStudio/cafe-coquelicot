import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, adminLogin } from "./helpers";

test.describe("auth admin", () => {
  test("le back-office est inaccessible sans session", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL("**/admin/login");
    await page.goto("/admin/produits");
    await page.waitForURL("**/admin/login");
  });

  test("identifiants invalides → erreur, pas de session", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    // getByRole("alert") seul collisionne avec le route announcer de Next.
    await expect(
      page.getByRole("alert").filter({ hasText: "Identifiants" }),
    ).toHaveText("Identifiants incorrects.");
    await page.goto("/admin");
    await page.waitForURL("**/admin/login");
  });

  test("connexion puis déconnexion", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/admin/login");
    await page.goto("/admin");
    await page.waitForURL("**/admin/login");
  });

  test("une fois connectée, /admin/login renvoie au dashboard", async ({
    page,
  }) => {
    await adminLogin(page);
    await page.goto("/admin/login");
    await page.waitForURL(/\/admin$/);
  });
});
