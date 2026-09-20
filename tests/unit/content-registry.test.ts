import { describe, expect, it } from "vitest";
import { ADMIN_SLUGS, PAGES, PAGE_SLUGS, adminHref, isPageSlug, pageFromAdminSlug } from "@/lib/content/registry";

describe("registre des pages", () => {
  it("les défauts de chaque page passent le schéma strict", () => {
    for (const slug of PAGE_SLUGS) {
      const r = PAGES[slug].strict.safeParse(PAGES[slug].defaults);
      expect(r.success, `${slug}: ${r.success ? "" : r.error.issues[0]?.message}`).toBe(true);
    }
  });
  it("les défauts de l'accueil reprennent les textes actuels", () => {
    expect(PAGES.home.defaults.hero.title).toBe("Café\nCoquelicot");
    expect(PAGES.home.defaults.gallery.tiles).toHaveLength(8);
    expect(PAGES.home.defaults.prestations.items.map((i) => i.name)).toEqual(["mariages", "événementiel", "ateliers", "entreprises"]);
    expect(PAGES.site.defaults.header.nav.map((l) => l.label)).toEqual(["Boutique", "Galerie", "Prestations", "À propos", "Contact"]);
  });
  it("résout les slugs admin", () => {
    expect(pageFromAdminSlug("accueil")).toBe("home");
    expect(pageFromAdminSlug("navigation")).toBe("site");
    expect(pageFromAdminSlug("inconnu")).toBeNull();
    expect(isPageSlug("home")).toBe(true);
    expect(isPageSlug("hero")).toBe(false);
    expect(adminHref("home")).toBe("/admin/contenu/accueil");
    expect(Object.keys(ADMIN_SLUGS).sort()).toEqual([...PAGE_SLUGS].sort());
  });
});
