import { describe, expect, it } from "vitest";
import {
  definePage,
  emptyItem,
  f,
  firstIssue,
  mergeDefaults,
  pageImagePaths,
  pageShape,
  pageStrict,
  type ContentOf,
} from "@/lib/content/fields";

const DEF = definePage({
  label: "Test",
  previewPath: "/",
  revalidate: ["/"],
  sections: {
    hero: {
      title: "Bandeau",
      fields: {
        title: f.text({ label: "Titre", required: true, max: 10 }),
        sub: f.textarea({ label: "Sous-titre" }),
        image: f.image({ label: "Photo" }),
        kind: f.select({ label: "Type", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }),
        cta: f.group({
          label: "Bouton",
          fields: {
            label: f.text({ label: "Texte", required: true }),
            href: f.text({ label: "Lien", required: true, href: true }),
          },
        }),
        items: f.list({
          label: "Éléments",
          labels: { singular: "élément", plural: "éléments" },
          min: 1,
          max: 2,
          fields: { name: f.text({ label: "Nom", required: true }), photo: f.image({ label: "Photo" }) },
        }),
        site: f.text({ label: "Site", url: true }),
      },
    },
  },
});

const DEFAULTS: ContentOf<typeof DEF> = {
  hero: {
    title: "Café",
    sub: "Un atelier",
    image: { path: null, alt: "" },
    kind: "a",
    cta: { label: "Voir", href: "/boutique" },
    items: [{ name: "un", photo: { path: null, alt: "" } }],
    site: "",
  },
};

const IMG = "123e4567-e89b-12d3-a456-426614174000.png";

describe("pageShape", () => {
  it("accepte un titre vide et un texte trop long (brouillon en cours)", () => {
    const r = pageShape(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, title: "", sub: "x".repeat(5000) } });
    expect(r.success).toBe(true);
  });
  it("complète une feuille manquante et remplace une feuille invalide", () => {
    const r = pageShape(DEF).safeParse({ hero: { ...DEFAULTS.hero, kind: "zzz", sub: undefined } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hero.kind).toBe("a");
      expect(r.data.hero.sub).toBe("");
    }
  });
  it("neutralise un chemin d'image forgé", () => {
    const r = pageShape(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, image: { path: "../x.png", alt: "" } } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hero.image.path).toBeNull();
  });
  it("refuse un document sans section", () => {
    expect(pageShape(DEF).safeParse("foo").success).toBe(false);
    expect(pageShape(DEF).safeParse({}).success).toBe(false);
  });
  it("ignore une clé inconnue", () => {
    const r = pageShape(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, extra: 1 } });
    expect(r.success && "extra" in r.data.hero).toBe(false);
  });
  it("remplace une image manquante ou mal formée par la valeur par défaut", () => {
    const missing = pageShape(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, image: undefined } });
    expect(missing.success).toBe(true);
    if (missing.success) expect(missing.data.hero.image).toEqual({ path: null, alt: "" });
    const malformed = pageShape(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, image: "x" } });
    expect(malformed.success).toBe(true);
    if (malformed.success) expect(malformed.data.hero.image).toEqual({ path: null, alt: "" });
  });
  it("neutralise un lien javascript: et une url invalide à la lecture, sans vider la liste qui les contient", () => {
    const r = pageShape(DEF).safeParse({
      ...DEFAULTS,
      hero: { ...DEFAULTS.hero, cta: { label: "x", href: "javascript:alert(1)" }, site: "instagram.com" },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hero.cta.href).toBe("/");
      expect(r.data.hero.site).toBe("");
    }
  });
  it("un item de liste dont le groupe est absent garde ses autres feuilles et reçoit un groupe vide, sans vider la liste", () => {
    const def = definePage({
      label: "Test",
      previewPath: "/",
      revalidate: ["/"],
      sections: {
        hero: {
          title: "Bandeau",
          fields: {
            items: f.list({
              label: "Éléments",
              labels: { singular: "élément", plural: "éléments" },
              fixed: true,
              fields: {
                name: f.text({ label: "Nom" }),
                cta: f.group({
                  label: "Bouton",
                  fields: {
                    label: f.text({ label: "Texte" }),
                    href: f.text({ label: "Lien", href: true }),
                  },
                }),
              },
            }),
          },
        },
      },
    });
    const r = pageShape(def).safeParse({ hero: { items: [{ name: "un" }] } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hero.items).toEqual([{ name: "un", cta: { label: "", href: "" } }]);
    }
  });
});

describe("pageStrict", () => {
  it("accepte les défauts", () => {
    expect(pageStrict(DEF).safeParse(DEFAULTS).success).toBe(true);
  });
  it("refuse un titre vide avec le libellé", () => {
    const r = pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, title: " " } });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toBe("Titre : champ obligatoire.");
  });
  it("refuse un texte trop long", () => {
    const r = pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, title: "x".repeat(11) } });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toBe("Titre : 10 caractères maximum.");
  });
  it("refuse un lien javascript: et accepte /, # et https", () => {
    const bad = pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, cta: { label: "x", href: "javascript:alert(1)" } } });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstIssue(bad.error)).toMatch(/Lien/);
    for (const href of ["/boutique", "#contact", "https://instagram.com/x"]) {
      expect(pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, cta: { label: "x", href } } }).success).toBe(true);
    }
  });
  it("refuse une url sans http et accepte le vide", () => {
    expect(pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, site: "instagram.com" } }).success).toBe(false);
    expect(pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, site: "" } }).success).toBe(true);
  });
  it("refuse un chemin d'image forgé", () => {
    const r = pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, image: { path: "../x.png", alt: "" } } });
    expect(r.success).toBe(false);
  });
  it("borne les listes", () => {
    const three = [DEFAULTS.hero.items[0], DEFAULTS.hero.items[0], DEFAULTS.hero.items[0]];
    expect(pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, items: three } }).success).toBe(false);
    expect(pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, items: [] } }).success).toBe(false);
  });
  it("supprime les espaces autour des textes", () => {
    const r = pageStrict(DEF).safeParse({ ...DEFAULTS, hero: { ...DEFAULTS.hero, title: "  Café  " } });
    expect(r.success && r.data.hero.title).toBe("Café");
  });
});

describe("mergeDefaults", () => {
  it("renvoie les défauts pour un document vide", () => {
    expect(mergeDefaults(DEFAULTS, {})).toEqual(DEFAULTS);
  });
  it("superpose les valeurs présentes, garde les défauts des clés absentes, prend les listes telles quelles", () => {
    const merged = mergeDefaults(DEFAULTS, { hero: { title: "Autre", items: [] } });
    expect(merged.hero.title).toBe("Autre");
    expect(merged.hero.sub).toBe("Un atelier");
    expect(merged.hero.items).toEqual([]);
  });
  it("garde une valeur vide explicite", () => {
    expect(mergeDefaults(DEFAULTS, { hero: { sub: "" } }).hero.sub).toBe("");
  });
  it("un item de liste auquel manque une clé de groupe garde ses autres valeurs et reçoit le défaut du modèle", () => {
    const defaults = { items: [{ name: "un", cta: { label: "Voir", href: "/boutique" } }] };
    const merged = mergeDefaults(defaults, { items: [{ name: "deux", cta: { label: "Autre" } }] });
    expect(merged.items).toEqual([{ name: "deux", cta: { label: "Autre", href: "/boutique" } }]);
  });
  it("un tableau stocké vide reste vide (ne reprend pas les défauts)", () => {
    const defaults = { items: [{ name: "un" }] };
    expect(mergeDefaults(defaults, { items: [] }).items).toEqual([]);
  });
});

describe("pageImagePaths", () => {
  it("collecte les chemins des images, y compris dans les listes", () => {
    const content = {
      ...DEFAULTS,
      hero: { ...DEFAULTS.hero, image: { path: IMG, alt: "" }, items: [{ name: "a", photo: { path: IMG.replace("png", "jpg"), alt: "" } }] },
    };
    expect(pageImagePaths(DEF, content)).toEqual([IMG, IMG.replace("png", "jpg")]);
    expect(pageImagePaths(DEF, DEFAULTS)).toEqual([]);
  });
});

describe("emptyItem", () => {
  it("construit un élément vide conforme à la forme", () => {
    expect(emptyItem(DEF.sections.hero.fields.items.fields)).toEqual({ name: "", photo: { path: null, alt: "" } });
  });
});
