import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("pages légales et paramètres", () => {
  test("les pages légales répondent et signalent les champs à compléter", async ({ page }) => {
    for (const path of ["/mentions-legales", "/cgv", "/livraison-retours", "/confidentialite"]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("article.legal")).toBeVisible();
    }
    await page.goto("/mentions-legales");
    await expect(page.locator("mark.legal__todo", { hasText: "SIRET" })).toBeVisible();
  });

  test("le pied de page mène aux pages légales", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "CGV" }).click();
    await page.waitForURL("**/cgv");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Conditions générales");
  });

  test("un réglage saisi dans le back-office apparaît sur les mentions légales", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/parametres");
    await page.getByLabel("SIRET").fill("123 456 789 00012");
    await page.getByLabel("Directeur·rice de la publication").fill("Céline Test");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toHaveText("Paramètres enregistrés.");

    await page.goto("/mentions-legales");
    await expect(page.getByText("123 456 789 00012")).toBeVisible();
    await expect(page.getByText("Céline Test")).toBeVisible();
    await expect(page.locator("mark.legal__todo", { hasText: "SIRET" })).toHaveCount(0);
  });

  test("robots, sitemap et manifest sont servis", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const body = await robots.text();
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Sitemap:");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("/boutique/");
    expect(xml).toContain("/cgv");

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);

    const og = await request.get("/opengraph-image");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
  });

  test("la page produit expose canonical, OpenGraph et JSON-LD", async ({ page }) => {
    await page.goto("/boutique");
    await page.locator(".product-card").first().click();
    await page.waitForURL(/\/boutique\/.+/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/boutique\//);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld ?? "{}")["@type"]).toBe("Product");
  });
});
