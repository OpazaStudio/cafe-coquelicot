// @vitest-environment node
// Le catalogue vit en base et change depuis le back-office : toute page
// vitrine qui le lit doit être rendue à la demande, jamais figée au build
// (cf. app/boutique/page.tsx). Une page oubliée a deux conséquences :
//   1. `next build` interroge Supabase — un souci de credentials casse le
//      déploiement entier (échec constaté sur Vercel au prerender de /panier) ;
//   2. la page sert un catalogue gelé à l'heure du build, que `revalidateShop()`
//      ne rafraîchit pas (il ne cible que "/" et "/boutique").
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = path.join(process.cwd(), "app");

function vitrinePages(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // Le back-office est dynamique par nature (session admin en cookie).
    if (entry.isDirectory()) {
      if (entry.name === "(admin)") continue;
      vitrinePages(full, found);
    } else if (entry.name === "page.tsx") {
      found.push(full);
    }
  }
  return found;
}

const readsCatalogue = vitrinePages(APP_DIR).filter((file) =>
  /from\s+"@\/lib\/products"/.test(readFileSync(file, "utf8")),
);

describe("pages vitrine lisant le catalogue", () => {
  it("en trouve au moins une (garde contre un filtre qui ne matche plus)", () => {
    expect(readsCatalogue.length).toBeGreaterThan(0);
  });

  it.each(readsCatalogue.map((f) => path.relative(process.cwd(), f)))(
    "%s déclare dynamic = force-dynamic",
    (relative) => {
      const source = readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(source).toMatch(/export const dynamic = "force-dynamic";/);
    },
  );
});
