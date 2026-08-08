# Images produit (upload Supabase Storage) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de vraies images produit (upload Supabase Storage), avec couleur de fond optionnelle par image, en gardant les SVG comme fallback.

**Architecture:** Upload immédiat via server action dédiée → Supabase Storage (bucket public `product-images`), chemin stocké en DB sur `products` et `product_colors`. Un module client-safe (`lib/product-image.ts`) construit l'URL publique et valide les fichiers ; un module server-only (`lib/storage.ts`) fait l'upload/suppression avec la clé service-role. Le rendu (`ProductFigure`) affiche l'image si présente, sinon le SVG.

**Tech Stack:** Next.js 16 (App Router, server actions, next/image), Drizzle ORM, Postgres (Supabase) / PGlite en test, `@supabase/supabase-js`, Zod, Vitest, Playwright.

## Global Constraints

- **Commits :** l'utilisateur committe lui-même. NE JAMAIS lancer `git commit` — là où une étape dit « Checkpoint », lancer la suite de tests et faire une pause pour revue, sans committer.
- **Fallback SVG intact :** `illustrationVariant` (0–5) reste sur `products` et `product_colors` ; l'image est purement additive.
- **No-op sans Supabase :** en dev/tests (`DATABASE_URL` vide, PGlite ; pas de `SUPABASE_SECRET_KEY`), aucun appel réseau Supabase ne doit partir ; le rendu retombe sur le SVG.
- **Bucket :** `product-images`, lecture publique.
- **Env :** `NEXT_PUBLIC_SUPABASE_URL` (déjà présent, public) + nouvelle `SUPABASE_SECRET_KEY` (service-role, serveur uniquement).
- **Types image autorisés :** `image/png`, `image/jpeg`, `image/webp`. Taille max : 5 Mo (`5 * 1024 * 1024`).
- **Couleur de fond :** hex `#rgb` ou `#rrggbb`, ou vide → `null` (fond gris actuel).
- **Français partout** (libellés UI, messages d'erreur), accents corrects.
- Utiliser `rtk` pour grep/read/tests longs (cf. RTK.md).

---

## File Structure

- `lib/product-image.ts` **(créé)** — client-safe : `productImageUrl(path)`, `validateImageFile()`, constantes `MAX_IMAGE_BYTES`/`ALLOWED_IMAGE_TYPES`/`BUCKET`.
- `lib/storage.ts` **(créé)** — server-only : `uploadImage(file)`, `deleteImage(path)`, `storageConfigured()`. Dépend de `@supabase/supabase-js`.
- `lib/db/schema.ts` **(modifié)** — colonnes `imagePath`/`imageBgColor` sur `products` et `productColors`.
- `lib/db/migrations/0008_*.sql` **(généré)** — via `drizzle-kit generate`.
- `lib/products.ts` **(modifié)** — `ShopProduct`/`ShopColor` + `assemble()`.
- `components/illustrations.tsx` **(modifié)** — `ProductFigure` branche image.
- `next.config.ts` **(modifié)** — `images.remotePatterns`.
- `app/globals.css` **(modifié)** — style du média image.
- `components/product-detail.tsx` **(modifié)** — priorité coloris → produit → SVG.
- `components/boutique.tsx`, `components/sections.tsx`, `components/vase-suggestions.tsx` **(modifiés)** — passent les champs image à `ProductFigure`.
- `app/(admin)/admin/(panel)/produits/actions.ts` **(modifié)** — action `uploadProductImage`, schémas + persistance.
- `app/(admin)/admin/(panel)/produits/image-upload.tsx` **(créé)** — composant client réutilisable (produit + coloris).
- `app/(admin)/admin/(panel)/produits/product-form.tsx` **(modifié)** — câblage produit + coloris.

---

### Task 1: Module client-safe `lib/product-image.ts`

**Files:**
- Create: `lib/product-image.ts`
- Test: `lib/product-image.test.ts`

**Interfaces:**
- Produces:
  - `BUCKET = "product-images"` (const)
  - `MAX_IMAGE_BYTES = 5 * 1024 * 1024`
  - `ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]`
  - `productImageUrl(path: string): string`
  - `validateImageFile(file: { type: string; size: number }): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

```ts
// lib/product-image.test.ts
import { describe, expect, it } from "vitest";
import {
  productImageUrl,
  validateImageFile,
  MAX_IMAGE_BYTES,
} from "./product-image";

describe("productImageUrl", () => {
  it("construit l'URL publique du bucket", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(productImageUrl("uuid.png")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/product-images/uuid.png",
    );
  });
});

describe("validateImageFile", () => {
  it("accepte un png sous la limite", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toEqual({ ok: true });
  });
  it("refuse un type non autorisé", () => {
    const r = validateImageFile({ type: "image/gif", size: 1000 });
    expect(r.ok).toBe(false);
  });
  it("refuse au-dessus de la taille max", () => {
    const r = validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run lib/product-image.test.ts`
Expected: FAIL — module `./product-image` introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/product-image.ts
// Client-safe : aucune clé secrète, uniquement NEXT_PUBLIC_SUPABASE_URL.
// Importable depuis les composants client comme serveur.

export const BUCKET = "product-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export function productImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export type ImageValidation = { ok: true } | { ok: false; error: string };

export function validateImageFile(file: { type: string; size: number }): ImageValidation {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { ok: false, error: "Format non supporté — PNG, JPG ou WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image trop lourde — 5 Mo maximum." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run lib/product-image.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint (no commit)**

Run: `rtk vitest run lib/product-image.test.ts && npm run typecheck`
Pause pour revue. Ne pas committer.

---

### Task 2: Module server-only `lib/storage.ts` + dépendance

**Files:**
- Create: `lib/storage.ts`
- Modify: `package.json` (dépendance `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `validateImageFile`, `BUCKET` (Task 1)
- Produces:
  - `storageConfigured(): boolean`
  - `uploadImage(file: File): Promise<{ path: string }>` — throw si non configuré ou invalide
  - `deleteImage(path: string): Promise<void>` — best-effort, ne throw jamais

- [ ] **Step 1: Installer la dépendance**

Run: `npm install @supabase/supabase-js`
Expected: ajout dans `dependencies`.

- [ ] **Step 2: Écrire le module**

```ts
// lib/storage.ts
import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, validateImageFile } from "./product-image";

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg"; // image/jpeg
}

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export async function uploadImage(file: File): Promise<{ path: string }> {
  const v = validateImageFile(file);
  if (!v.ok) throw new Error(v.error);
  const client = getClient();
  if (!client) throw new Error("Stockage d'images non configuré.");
  const path = `${randomUUID()}.${extFor(file.type)}`;
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

export async function deleteImage(path: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.storage.from(BUCKET).remove([path]);
  } catch {
    // best-effort : un orphelin ne doit jamais casser une écriture produit.
  }
}
```

- [ ] **Step 3: Vérifier compilation/typecheck**

Run: `npm run typecheck`
Expected: PASS (pas d'erreur de type).

> Note : pas de test unitaire réseau ici (no-op sans clé). `storageConfigured()` renvoie `false` en test → `uploadImage` throw « non configuré », comportement couvert au niveau de l'action (Task 6).

- [ ] **Step 4: Checkpoint (no commit)**

Run: `npm run typecheck`
Pause pour revue.

---

### Task 3: Colonnes DB + migration `0008`

**Files:**
- Modify: `lib/db/schema.ts:43-60` (table `products`), `:80-92` (table `productColors`)
- Generate: `lib/db/migrations/0008_*.sql`
- Test: `tests/unit/product-image-columns.test.ts` (convention projet : tests dans `tests/unit/`, DB via `createTestDb`)

**Interfaces:**
- Produces: colonnes `image_path`/`image_bg_color` sur `products` et `product_colors` ; `ProductRow`/`ProductColorRow` (types inférés Drizzle) gagnent `imagePath: string | null`, `imageBgColor: string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/product-image-columns.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { products } from "@/lib/db/schema";
import { createTestDb } from "../helpers/db";

describe("colonnes image", () => {
  it("un produit peut porter image_path et image_bg_color", async () => {
    const db = await createTestDb({ seed: false });
    const [row] = await db
      .insert(products)
      .values({
        slug: "test-image-col",
        name: "test",
        tag: "t",
        description: "d",
        priceCents: 1000,
        category: "frais",
        imagePath: "uuid.png",
        imageBgColor: "#eee",
      })
      .returning();
    expect(row.imagePath).toBe("uuid.png");
    expect(row.imageBgColor).toBe("#eee");
    await db.delete(products).where(eq(products.id, row.id));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/unit/product-image-columns.test.ts`
Expected: FAIL — propriété `imagePath` inconnue (colonne absente).

- [ ] **Step 3: Ajouter les colonnes au schéma**

Dans `lib/db/schema.ts`, table `products` (après `illustrationVariant`, avant `active`) :

```ts
  illustrationVariant: integer("illustration_variant").notNull().default(0),
  imagePath: text("image_path"),
  imageBgColor: text("image_bg_color"),
  active: boolean("active").notNull().default(true),
```

Table `productColors` (après `illustrationVariant`, avant `sortOrder`) :

```ts
  illustrationVariant: integer("illustration_variant").notNull().default(0),
  imagePath: text("image_path"),
  imageBgColor: text("image_bg_color"),
  sortOrder: integer("sort_order").notNull().default(0),
```

- [ ] **Step 4: Générer la migration**

Run: `npm run db:generate`
Expected: création de `lib/db/migrations/0008_*.sql` avec `ALTER TABLE ... ADD COLUMN "image_path"` / `"image_bg_color"` sur les deux tables. Vérifier le SQL généré (lecture du fichier).

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk vitest run tests/unit/product-image-columns.test.ts`
Expected: PASS. (`createTestDb` monte une base PGlite neuve en mémoire à chaque run, migrations 0008 incluses — pas de cache à purger.)

- [ ] **Step 6: Checkpoint (no commit)**

Run: `npm run typecheck`
Pause pour revue. (⚠️ `npm run db:migrate` sur Supabase = étape ops, hors exécution de ce plan — cf. section finale.)

---

### Task 4: Flux de données `lib/products.ts`

**Files:**
- Modify: `lib/products.ts:16-17` (types), `:36-62` (`assemble`)
- Test: `tests/unit/products.test.ts` (ÉTENDRE le fichier existant — ne pas créer de doublon ; il utilise déjà `createTestDb` + `// @vitest-environment node`)

**Interfaces:**
- Consumes: `ProductRow`/`ProductColorRow` avec champs image (Task 3)
- Produces: `ShopProduct` et `ShopColor` avec `imagePath: string | null`, `imageBgColor: string | null`.

- [ ] **Step 1: Write the failing test**

Ajouter ce bloc `describe` dans `tests/unit/products.test.ts` (qui a déjà `const db` monté en `beforeEach` via `createTestDb()`). Utiliser le `db` du scope existant :

```ts
describe("assemble expose les champs image", () => {
  it("mappe imagePath/imageBgColor du produit", async () => {
    await db
      .update(products)
      .set({ imagePath: "hero.png", imageBgColor: "#faf0e6" })
      .where(eq(products.slug, "rivage"));
    const p = await queryProductBySlug(db, "rivage");
    expect(p?.imagePath).toBe("hero.png");
    expect(p?.imageBgColor).toBe("#faf0e6");
  });

  it("un produit sans image expose null", async () => {
    const p = await queryProductBySlug(db, "rivage");
    expect(p?.imagePath).toBeNull();
    expect(p?.imageBgColor).toBeNull();
  });
});
```

(`db`, `products`, `eq`, `queryProductBySlug` sont déjà importés/en scope dans le fichier. Pas de reset nécessaire : `createTestDb` reconstruit une base neuve à chaque `beforeEach`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/unit/products.test.ts`
Expected: FAIL — `imagePath` absent de `ShopProduct`.

- [ ] **Step 3: Étendre types + `assemble`**

Dans `lib/products.ts`, remplacer :

```ts
export type ShopColor = { id: string; label: string; illustrationVariant: number };
```

par :

```ts
export type ShopColor = {
  id: string;
  label: string;
  illustrationVariant: number;
  imagePath: string | null;
  imageBgColor: string | null;
};
```

Dans le type `ShopProduct`, ajouter après `variant` :

```ts
  variant: number; // illustration par défaut (aucun coloris)
  imagePath: string | null; // image produit (null → SVG fallback)
  imageBgColor: string | null; // fond de l'image (null → fond gris)
```

Dans `assemble()`, ajouter au retour (niveau produit, après `variant: row.illustrationVariant,`) :

```ts
    variant: row.illustrationVariant,
    imagePath: row.imagePath,
    imageBgColor: row.imageBgColor,
```

et dans le `map` des `colors` :

```ts
    colors: colors.map((c) => ({
      id: c.id,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
      imagePath: c.imagePath,
      imageBgColor: c.imageBgColor,
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run tests/unit/products.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint (no commit)**

Run: `rtk vitest run && npm run typecheck`
Expected: toute la suite verte. Pause pour revue.

---

### Task 5: Rendu image — `ProductFigure`, `next.config`, CSS, points d'appel

**Files:**
- Modify: `components/illustrations.tsx:257-271` (`ProductFigure`)
- Modify: `next.config.ts`
- Modify: `app/globals.css:409-428` (média carte) + `.product-page__media`
- Modify: `components/product-detail.tsx:28-58`
- Modify: `components/boutique.tsx:77-84`
- Modify: `components/sections.tsx:113-119`
- Modify: `components/vase-suggestions.tsx:27`
- Test: `tests/unit/product-figure.test.tsx` (ÉTENDRE le fichier existant — il teste déjà le fallback SVG ; ne pas créer de doublon)

**Interfaces:**
- Consumes: `productImageUrl` (Task 1), `ShopProduct`/`ShopColor` champs image (Task 4)
- Produces: `ProductFigure(props: { category: string; variant?: number; imagePath?: string | null; imageBgColor?: string | null; alt?: string; className?: string })`

- [ ] **Step 1: Write the failing test**

Ajouter ces deux `it` dans le `describe("ProductFigure", ...)` existant de `tests/unit/product-figure.test.tsx` (imports `render`, `ProductFigure` depuis `@/components/illustrations` déjà en place ; les tests SVG existants doivent rester verts) :

```tsx
  it("rend une image quand imagePath est fourni", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const { container } = render(
      <ProductFigure category="frais" imagePath="hero.png" imageBgColor="#eee" alt="rivage" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("rivage");
  });

  it("retombe sur le SVG quand imagePath est absent", () => {
    const { container } = render(<ProductFigure category="frais" variant={0} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
```

> Si le composant `next/image` ne se rend pas proprement sous jsdom, remplacer l'assertion `img` par une recherche du wrapper `.product-media` et de son `style.background`. Vérifier au Step 2 le message d'échec réel avant de figer l'assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/unit/product-figure.test.tsx`
Expected: FAIL — `ProductFigure` n'accepte pas `imagePath` / rend toujours le SVG.

- [ ] **Step 3: Modifier `ProductFigure`**

En haut de `components/illustrations.tsx`, ajouter les imports :

```ts
import Image from "next/image";
import { productImageUrl } from "@/lib/product-image";
```

Remplacer la fonction `ProductFigure` par :

```tsx
// Choisit l'illustration selon la catégorie produit (vase vs bouquet/fleur),
// ou affiche l'image uploadée si le produit/coloris en a une.
export function ProductFigure({
  category,
  variant,
  imagePath,
  imageBgColor,
  alt,
  className,
}: {
  category: string;
  variant?: number;
  imagePath?: string | null;
  imageBgColor?: string | null;
  alt?: string;
  className?: string;
}) {
  if (imagePath) {
    return (
      <span
        className="product-media"
        style={imageBgColor ? { background: imageBgColor } : undefined}
      >
        <Image
          src={productImageUrl(imagePath)}
          alt={alt ?? ""}
          fill
          sizes="(max-width: 640px) 50vw, 320px"
        />
      </span>
    );
  }
  return category === "vase" ? (
    <Vase variant={variant} className={className} />
  ) : (
    <Bouquet variant={variant} className={className} />
  );
}
```

- [ ] **Step 4: Configurer `next.config.ts`**

Remplacer le contenu par :

```ts
import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Drivers Postgres chargés via require natif (PGlite embarque du WASM).
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  ...(supabaseHost
    ? {
        images: {
          remotePatterns: [
            {
              protocol: "https",
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ],
        },
      }
    : {}),
};

export default nextConfig;
```

- [ ] **Step 5: Ajouter le CSS du média image**

Dans `app/globals.css`, juste après le bloc `.product-card:hover .product-card__media svg { ... }` (≈ ligne 428), ajouter :

```css
/* Image produit (remplace le SVG quand une photo est définie). Remplit le
   conteneur média ; la couleur de fond éventuelle est portée en inline. */
.product-media {
  position: absolute;
  inset: 0;
  display: block;
}
.product-media img {
  object-fit: cover;
}
```

Vérifier que `.product-page__media` (≈ ligne 521) contient `position: relative;` — l'ajouter si absent (nécessaire pour `Image fill`).

- [ ] **Step 6: Câbler `product-detail.tsx`**

Remplacer le bloc de dérivation (lignes ≈28-31) :

```tsx
  // Le coloris change l'illustration ; la taille porte le prix.
  const illustration = color?.illustrationVariant ?? product.variant;
  const priceCents = size?.priceCents ?? product.priceCents;
```

par :

```tsx
  // Le coloris change l'illustration/l'image ; la taille porte le prix.
  const illustration = color?.illustrationVariant ?? product.variant;
  const imagePath = color?.imagePath ?? product.imagePath;
  const imageBgColor = color?.imageBgColor ?? product.imageBgColor;
  const priceCents = size?.priceCents ?? product.priceCents;
```

Remplacer la ligne `<ProductFigure category={product.category} variant={illustration} />` par :

```tsx
        <ProductFigure
          category={product.category}
          variant={illustration}
          imagePath={imagePath}
          imageBgColor={imageBgColor}
          alt={name}
        />
```

- [ ] **Step 7: Câbler `boutique.tsx`**

Dans `ProductCard` (ligne ≈78), ajouter au destructuring `imagePath, imageBgColor` :

```tsx
  const { slug, name, tag, desc, badge, price, variant, category, imagePath, imageBgColor } = product;
```

Remplacer `<ProductFigure category={category} variant={variant} />` par :

```tsx
        <ProductFigure
          category={category}
          variant={variant}
          imagePath={imagePath}
          imageBgColor={imageBgColor}
          alt={name}
        />
```

- [ ] **Step 8: Câbler `sections.tsx`**

En haut du fichier, s'assurer que `ProductFigure` est importé depuis `./illustrations` (à côté de `Bouquet`/`ArrowRight`).

Dans le `ProductCard` de `sections.tsx` (ligne ≈113), remplacer la signature et le rendu :

```tsx
function ProductCard({ slug, name, tag, desc, price, variant, badge, category, imagePath, imageBgColor }: ShopProduct) {
  return (
    <Link href={`/boutique/${slug}`} className="product-card">
      <div className="product-card__media">
        {badge && <span className="product-card__badge">{badge}</span>}
        <ProductFigure
          category={category}
          variant={variant}
          imagePath={imagePath}
          imageBgColor={imageBgColor}
          alt={name}
        />
      </div>
```

(le reste du composant inchangé). Les tuiles décoratives `Gallery`/`TILES` restent en `<Bouquet>` — ce ne sont pas des produits.

- [ ] **Step 9: Câbler `vase-suggestions.tsx`**

Remplacer `<ProductFigure category={v.category} variant={v.variant} />` par :

```tsx
              <ProductFigure
                category={v.category}
                variant={v.variant}
                imagePath={v.imagePath}
                imageBgColor={v.imageBgColor}
                alt={v.name}
              />
```

(Vérifier que `v.name` existe dans le scope ; sinon utiliser le champ nom disponible.)

- [ ] **Step 10: Run test + typecheck**

Run: `rtk vitest run tests/unit/product-figure.test.tsx && npm run typecheck`
Expected: tests PASS, typecheck PASS.

- [ ] **Step 11: Checkpoint (no commit)**

Run: `rtk vitest run && npm run typecheck`
Pause pour revue.

---

### Task 6: Action `uploadProductImage` + validation/persistance dans `actions.ts`

**Files:**
- Modify: `app/(admin)/admin/(panel)/produits/actions.ts`
- Test: `tests/unit/actions-image.test.ts` (convention projet : `tests/unit/`, imports via alias `@/`)

**Interfaces:**
- Consumes: `uploadImage`, `deleteImage`, `storageConfigured` (Task 2)
- Produces:
  - `uploadProductImage(prev: UploadState, formData: FormData): Promise<UploadState>` où `type UploadState = { path?: string; error?: string } | undefined`
  - `ProductSchema`/`ColorSchema` acceptent `imagePath: string | null`, `imageBgColor: string | null`
  - `createProduct`/`updateProduct`/`syncChildren` persistent ces champs

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/actions-image.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// La session admin est validée hors-sujet ici → on la court-circuite.
vi.mock("@/lib/auth/dal", () => ({ verifySession: vi.fn().mockResolvedValue(undefined) }));

import { uploadProductImage } from "@/app/(admin)/admin/(panel)/produits/actions";

describe("uploadProductImage", () => {
  it("refuse un fichier de type non autorisé", async () => {
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.gif", { type: "image/gif" }));
    const res = await uploadProductImage(undefined, fd);
    expect(res?.error).toBeTruthy();
    expect(res?.path).toBeUndefined();
  });

  it("renvoie une erreur quand le stockage n'est pas configuré", async () => {
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.png", { type: "image/png" }));
    const res = await uploadProductImage(undefined, fd);
    // Sans SUPABASE_SECRET_KEY → uploadImage throw « non configuré ».
    expect(res?.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/unit/actions-image.test.ts`
Expected: FAIL — `uploadProductImage` n'existe pas.

- [ ] **Step 3: Ajouter l'action + les schémas + la persistance**

Dans `actions.ts`, ajouter les imports :

```ts
import { deleteImage, uploadImage } from "@/lib/storage";
import { validateImageFile } from "@/lib/product-image";
```

Ajouter, avant `ProductSchema`, deux helpers Zod :

```ts
// Champs image optionnels : "" → null. Hex #rgb / #rrggbb.
const optionalImagePath = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().trim().max(200).nullable(),
);
const optionalHexColor = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { error: "Couleur invalide." })
    .nullable(),
);
```

Dans `ProductSchema`, ajouter deux champs (après `illustrationVariant`) :

```ts
  imagePath: optionalImagePath,
  imageBgColor: optionalHexColor,
```

Dans `ColorSchema`, ajouter (après `illustrationVariant`) :

```ts
  imagePath: optionalImagePath,
  imageBgColor: optionalHexColor,
```

Dans `readForm`, ajouter les deux lignes au parse :

```ts
    illustrationVariant: formData.get("illustrationVariant"),
    imagePath: formData.get("imagePath"),
    imageBgColor: formData.get("imageBgColor"),
    active: formData.get("active") === "on",
```

Dans `syncChildren`, ajouter aux `values` du coloris (à côté de `illustrationVariant: c.illustrationVariant,`) :

```ts
      illustrationVariant: c.illustrationVariant,
      imagePath: c.imagePath,
      imageBgColor: c.imageBgColor,
```

Dans `createProduct`, l'objet `.values({...})` reçoit déjà `...rest` (qui contient désormais `imagePath`/`imageBgColor` — vérifier qu'ils ne sont pas exclus par la déstructuration `const { price, badge, ...rest }`). Rien à changer : ils passent via `...rest`.

Dans `updateProduct`, même chose via `...rest`. Ajouter en tête (avant la transaction) la suppression best-effort de l'ancienne image produit si elle change :

```ts
  const db = await getDb();
  const { price, badge, ...rest } = parsed.data;
  // Remplacement d'image : supprimer l'ancien objet (best-effort).
  const [prevRow] = await db
    .select({ imagePath: products.imagePath })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (prevRow?.imagePath && prevRow.imagePath !== rest.imagePath) {
    await deleteImage(prevRow.imagePath);
  }
```

Ajouter enfin l'action d'upload en fin de fichier :

```ts
export type UploadState = { path?: string; error?: string } | undefined;

export async function uploadProductImage(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  await verifySession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Aucun fichier sélectionné." };
  }
  const v = validateImageFile(file);
  if (!v.ok) return { error: v.error };
  try {
    const { path } = await uploadImage(file);
    return { path };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec de l'upload." };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run tests/unit/actions-image.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint (no commit)**

Run: `rtk vitest run && npm run typecheck`
Pause pour revue.

---

### Task 7: Composant réutilisable `ImageUpload`

**Files:**
- Create: `app/(admin)/admin/(panel)/produits/image-upload.tsx`
- Test: `tests/unit/image-upload.test.tsx` (convention projet : `tests/unit/`, imports via alias `@/`)

**Interfaces:**
- Consumes: `uploadProductImage` (Task 6), `productImageUrl` (Task 1)
- Produces:
  - `ImageUpload(props: { value: string | null; bgColor: string | null; onChange: (v: { imagePath: string | null; imageBgColor: string | null }) => void; fallback: React.ReactNode; label?: string; size?: "sm" | "md" })`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/image-upload.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImageUpload } from "@/app/(admin)/admin/(panel)/produits/image-upload";

vi.mock("@/app/(admin)/admin/(panel)/produits/actions", () => ({
  uploadProductImage: vi.fn().mockResolvedValue({ path: "uuid.png" }),
}));

describe("ImageUpload", () => {
  it("affiche le fallback quand aucune image", () => {
    render(
      <ImageUpload
        value={null}
        bgColor={null}
        onChange={() => {}}
        fallback={<svg data-testid="fallback" />}
        label="Image du produit"
      />,
    );
    expect(screen.getByTestId("fallback")).toBeTruthy();
    expect(screen.getByText("Image du produit")).toBeTruthy();
  });

  it("affiche l'image quand value est fourni", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const { container } = render(
      <ImageUpload
        value="uuid.png"
        bgColor="#eee"
        onChange={() => {}}
        fallback={<svg />}
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/unit/image-upload.test.tsx`
Expected: FAIL — module `./image-upload` introuvable.

- [ ] **Step 3: Écrire le composant**

```tsx
// app/(admin)/admin/(panel)/produits/image-upload.tsx
"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { productImageUrl, validateImageFile } from "@/lib/product-image";
import { uploadProductImage } from "./actions";

type Props = {
  value: string | null;
  bgColor: string | null;
  onChange: (v: { imagePath: string | null; imageBgColor: string | null }) => void;
  fallback: ReactNode;
  label?: string;
  size?: "sm" | "md";
};

export function ImageUpload({ value, bgColor, onChange, fallback, label, size = "md" }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = size === "sm" ? "h-10 w-10" : "h-24 w-24";

  async function handleFile(file: File) {
    const v = validateImageFile(file);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadProductImage(undefined, fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.path) onChange({ imagePath: res.path, imageBgColor: bgColor });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <span className="text-xs text-muted">{label}</span>}
      <div
        className={`relative overflow-hidden rounded-lg border border-line ${box} [&_svg]:h-full [&_svg]:w-full`}
        style={bgColor ? { background: bgColor } : undefined}
      >
        {value ? (
          <Image src={productImageUrl(value)} alt="" fill sizes="96px" style={{ objectFit: "cover" }} />
        ) : (
          fallback
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <label className="cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-medium text-ink transition hover:bg-stone-100">
          {pending ? "Envoi…" : value ? "Remplacer" : "Ajouter une image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label="Couleur de fond"
            value={bgColor ?? "#ffffff"}
            onChange={(e) => onChange({ imagePath: value, imageBgColor: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border border-line bg-transparent p-0"
          />
          {(bgColor || value) && (
            <button
              type="button"
              onClick={() => onChange({ imagePath: null, imageBgColor: null })}
              className="text-xs text-danger hover:underline"
            >
              Retirer
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run tests/unit/image-upload.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint (no commit)**

Run: `npm run typecheck`
Pause pour revue.

---

### Task 8: Câblage du formulaire admin (produit + coloris)

**Files:**
- Modify: `app/(admin)/admin/(panel)/produits/product-form.tsx`
- Test: `tests/unit/product-form.test.tsx` (convention projet : `tests/unit/`, imports via alias `@/`)

**Interfaces:**
- Consumes: `ImageUpload` (Task 7), `ProductRow`/`ProductColorRow` avec champs image (Task 3)
- Produces: le formulaire soumet `imagePath`/`imageBgColor` (produit, champs cachés) et les mêmes champs par coloris (dans le JSON `colors`).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/product-form.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductForm } from "@/app/(admin)/admin/(panel)/produits/product-form";

vi.mock("@/app/(admin)/admin/(panel)/produits/actions", () => ({ uploadProductImage: vi.fn() }));

describe("ProductForm — image", () => {
  it("affiche le contrôle d'image produit", () => {
    render(<ProductForm action={async () => undefined} submitLabel="Créer" />);
    expect(screen.getByText("Image du produit")).toBeTruthy();
  });

  it("expose les champs cachés imagePath/imageBgColor", () => {
    const { container } = render(
      <ProductForm action={async () => undefined} submitLabel="Créer" />,
    );
    expect(container.querySelector('input[name="imagePath"]')).not.toBeNull();
    expect(container.querySelector('input[name="imageBgColor"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/unit/product-form.test.tsx`
Expected: FAIL — pas de « Image du produit » / pas de champ caché.

- [ ] **Step 3: Câbler le niveau produit**

Dans `product-form.tsx`, ajouter l'import :

```ts
import { ImageUpload } from "./image-upload";
```

Ajouter l'état image produit (après `const [variant, setVariant] = ...`) :

```ts
  const [productImage, setProductImage] = useState<{
    imagePath: string | null;
    imageBgColor: string | null;
  }>({
    imagePath: product?.imagePath ?? null,
    imageBgColor: product?.imageBgColor ?? null,
  });
```

Remplacer le bloc « Aperçu » (le `<div className="flex w-36 flex-col items-center ...">` contenant `<Bouquet variant={variant} />`) par un `ImageUpload` :

```tsx
        <div className="flex w-36 flex-col items-center gap-2 rounded-xl border border-line bg-panel p-3">
          <ImageUpload
            value={productImage.imagePath}
            bgColor={productImage.imageBgColor}
            onChange={setProductImage}
            fallback={<Bouquet variant={variant} />}
            label="Image du produit"
          />
        </div>
```

Ajouter les champs cachés à côté des `<input type="hidden" name="sizes" ...>` :

```tsx
      <input type="hidden" name="imagePath" value={productImage.imagePath ?? ""} />
      <input type="hidden" name="imageBgColor" value={productImage.imageBgColor ?? ""} />
```

- [ ] **Step 4: Câbler le niveau coloris**

Étendre `ColorDraft` :

```ts
type ColorDraft = {
  key: string;
  id?: string;
  label: string;
  illustrationVariant: number;
  imagePath: string | null;
  imageBgColor: string | null;
  active: boolean;
};
```

Dans l'initialisation `useState<ColorDraft[]>`, mapper les nouveaux champs :

```ts
    (initialColors ?? []).map((c) => ({
      key: c.id,
      id: c.id,
      label: c.label,
      illustrationVariant: c.illustrationVariant,
      imagePath: c.imagePath,
      imageBgColor: c.imageBgColor,
      active: c.active,
    })),
```

Dans la ligne coloris, remplacer le mini-aperçu SVG :

```tsx
            <div className="h-10 w-10 shrink-0 text-wine [&_svg]:h-full [&_svg]:w-full">
              <Bouquet variant={c.illustrationVariant} />
            </div>
```

par un `ImageUpload` compact :

```tsx
            <div className="shrink-0 text-wine">
              <ImageUpload
                value={c.imagePath}
                bgColor={c.imageBgColor}
                onChange={(v) => updateColor(i, v)}
                fallback={<Bouquet variant={c.illustrationVariant} />}
                size="sm"
              />
            </div>
```

Dans le bouton « + Ajouter un coloris », initialiser les nouveaux champs :

```ts
              { key: nextKey(), label: "", illustrationVariant: 0, imagePath: null, imageBgColor: null, active: true },
```

(`updateColor` accepte déjà un `Partial<ColorDraft>` → `onChange={(v) => updateColor(i, v)}` fonctionne tel quel. Le JSON caché `colors` embarque automatiquement `imagePath`/`imageBgColor`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk vitest run tests/unit/product-form.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `rtk vitest run && npm run typecheck && npm run lint`
Expected: tout vert.

- [ ] **Step 7: Checkpoint (no commit)**

Pause pour revue finale du code.

---

### Task 9: Vérification manuelle (app réelle) + ops Supabase

**Files:** aucun (vérification).

- [ ] **Step 1: Créer le bucket Supabase**

Dans le dashboard Supabase → Storage → créer un bucket `product-images` **public**. Récupérer la clé **service-role** (Settings → API) → la poser dans `.env.local` sous `SUPABASE_SECRET_KEY=...` et sur Vercel (env Production/Preview).

- [ ] **Step 2: Appliquer les migrations sur Supabase**

Run: `npm run db:migrate`
Expected: applique 0003→0008 (dont les colonnes image). Cf. mémoire migrations en retard.

- [ ] **Step 3: Vérifier le flux via le skill `verify`**

Lancer le skill `verify` (ou `npm run dev`) : dans `/admin/produits`, éditer un produit, uploader une image + choisir une couleur de fond, enregistrer. Vérifier :
  - la carte boutique et la page produit affichent l'image sur son fond ;
  - un produit sans image affiche toujours le SVG ;
  - un coloris avec image bascule l'image en page produit à la sélection.

- [ ] **Step 4: Checkpoint final (no commit)**

Récapituler l'état ; laisser l'utilisateur committer.

---

## Notes de revue (self-review du plan)

- **Couverture spec :** stockage (T1-T2), migration/colonnes (T3), flux données (T4), rendu + fallback + fond (T5), action upload + validation + persistance + delete-on-replace (T6), UI réutilisable (T7), câblage admin produit+coloris (T8), ops+vérif (T9). ✅
- **No-op sans Supabase :** garanti par `storageConfigured()`/`getClient()` (T2) + test T6 « non configuré ». ✅
- **Cohérence des types :** `imagePath`/`imageBgColor` (`string | null`) homogènes de la DB (T3) → `ShopProduct`/`ShopColor` (T4) → `ProductFigure`/`ImageUpload` (T5/T7) → schémas Zod (T6). `uploadProductImage(prev, formData)` même signature en T6/T7/T8. ✅
- **Orphelins coloris :** delete-on-replace couvert au niveau produit uniquement (T6) ; coloris = hors périmètre (documenté dans la spec).
