# Images produit (upload Supabase Storage) — Design

**Date :** 2026-07-13
**Statut :** validé, prêt pour le plan d'implémentation

## Contexte

Aujourd'hui les produits n'ont pas de photos : ils sont représentés par des SVG
au trait codés en dur (`Bouquet` / `Vase` via `ProductFigure`), choisis par un
entier `illustrationVariant` (0–5) porté à la fois par `products` et par
`productColors` (un coloris change le SVG affiché). Rendu à 4 endroits — carte
boutique (`components/boutique.tsx`), carte home (`components/sections.tsx`),
page produit (`components/product-detail.tsx`), suggestions de vase
(`components/vase-suggestions.tsx`) — tous via `ProductFigure`, dans un conteneur
`.product-card__media` / `.product-page__media` (fond gris `var(--fg) 8%`).

Objectif : permettre de vraies **images** (PNG/JPG/WebP), avec une **couleur de
fond optionnelle** par image, en **gardant le SVG comme fallback**.

## Décisions

- **Stockage :** upload depuis le back-office → **Supabase Storage** ; le chemin
  de l'objet est enregistré en DB.
- **Granularité :** une image par **produit** ET une image par **coloris**.
- **Couleur de fond :** hex optionnelle, **même granularité** (produit + coloris) ;
  vide → fond gris actuel.
- **SVG :** conservé comme fallback quand aucune image n'est définie.
- **Flux d'upload :** upload immédiat au choix du fichier via une server action
  dédiée (approche A), pas dans la soumission principale (approche B rejetée :
  fragile avec les lignes de coloris dynamiques).

## Architecture

### 1. Module de stockage — `lib/storage.ts` (nouveau)

Enveloppe isolée de Supabase Storage, seul point qui parle au réseau :

- `uploadImage(file: File): Promise<{ path: string }>`
- `deleteImage(path: string): Promise<void>` (best-effort, jamais bloquant)
- `publicUrl(path: string): string` — construit
  `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`

Détails :

- Dépendance nouvelle : `@supabase/supabase-js`.
- Clé **service-role** côté serveur via nouvelle env `SUPABASE_SECRET_KEY`
  (le bucket n'est pas ouvert en écriture au public). Lecture publique du bucket
  `product-images`.
- **No-op / erreur propre si non configuré** (pas d'URL ou pas de clé) : l'upload
  renvoie une erreur exploitable par l'action, et le rendu retombe sur le SVG —
  cohérent avec le pattern GA/Resend du projet (dev et tests ne touchent pas
  Supabase).
- Validation : type ∈ {png, jpg/jpeg, webp}, taille max ~5 Mo. Nom d'objet
  `<crypto.randomUUID()>.<ext>`. La validation type/taille est une **fonction
  pure** testable indépendamment du réseau.

### 2. Schéma + migration `0008`

Colonnes nullables ajoutées à **`products`** et **`product_colors`** :

- `image_path text` (chemin de l'objet dans le bucket, `null` = pas d'image)
- `image_bg_color text` (hex `#rgb`/`#rrggbb`, `null` = fond gris actuel)

`illustrationVariant` **reste inchangé** (fallback). Généré par
`drizzle-kit generate` → appliqué automatiquement en PGlite (via `migrate()` dans
`lib/db/client.ts`, donc tests + local) et sur Supabase via `npm run db:migrate`.

> Rappel mémoire : migrations 0003–0007 en attente d'application sur Supabase.
> `0008` s'ajoute à cette file ; lancer `db:migrate` couvre l'ensemble.

### 3. Flux de données — `lib/products.ts`

- `ShopProduct` gagne `imagePath: string | null`, `imageBgColor: string | null`.
- `ShopColor` gagne `imagePath: string | null`, `imageBgColor: string | null`.
- `assemble()` mappe les nouvelles colonnes. Aucune requête supplémentaire.

### 4. Rendu — `components/illustrations.tsx`

`ProductFigure` reçoit `imagePath`/`imageBgColor` en plus de `category`/`variant` :

- Si `imagePath` présent → `<Image>` (next/image) posé sur un conteneur
  `style={{ background: imageBgColor ?? undefined }}`, `src = publicUrl(imagePath)`.
- Sinon → SVG actuel (`Vase`/`Bouquet` selon la catégorie).

Configuration `next.config` : `images.remotePatterns` sur l'hôte Supabase
(dérivé de `NEXT_PUBLIC_SUPABASE_URL`).

`product-detail.tsx` : le coloris sélectionné fournit son image (et son fond) s'il
en a une, sinon on retombe sur l'image du produit, sinon SVG — même logique de
priorité qu'aujourd'hui avec `illustrationVariant`.

Les 4 points de rendu reçoivent les nouveaux champs (déjà présents sur
`ShopProduct`/`ShopColor`).

### 5. Back-office — `product-form.tsx` + `actions.ts`

**Niveau produit** (près du bloc « Aperçu ») :
- Contrôle d'upload image (appelle `uploadProductImage`, aperçu instantané).
- Input couleur de fond (`<input type="color">` + hex, effaçable).
- L'aperçu montre l'image uploadée si présente, sinon le SVG de la variante.

**Par coloris** (chaque ligne) :
- Mini-contrôle d'upload + couleur de fond.
- `ColorDraft` gagne `imagePath?`, `imageBgColor?` (sérialisés dans le JSON caché).

**Server action `uploadProductImage(formData)` (nouvelle) :**
- `verifySession()`, lit le `File`, valide type/taille, `uploadImage()`, renvoie
  `{ path }` (ou une erreur exploitable côté client).

**`actions.ts` :**
- `ProductSchema` et `ColorSchema` gagnent `imagePath`/`imageBgColor` optionnels
  (validés : chemin non vide, hex `#rgb`/`#rrggbb`).
- `createProduct`/`updateProduct` persistent les colonnes produit ; `syncChildren`
  persiste les colonnes coloris.
- Remplacement d'une image → `deleteImage()` best-effort de l'ancien objet.

### 6. Tests

- **Unit :** `publicUrl()` construit la bonne URL ; validation upload (type/taille)
  en fonction pure ; `assemble()` inclut les nouveaux champs.
- **Composant / e2e :** le formulaire affiche les contrôles image ; `lib/storage.ts`
  est mockable/no-op en test (aucun appel réseau Supabase) ; les `path` enregistrés
  persistent et se réaffichent au rechargement.

## Hors périmètre

- Recadrage / compression d'image côté serveur.
- Galerie multi-images par produit.
- Nettoyage périodique des objets orphelins (upload abandonné sans soumission).

## Décisions opérationnelles requises

- **Nouvelle env `SUPABASE_SECRET_KEY`** (clé service-role) — nécessaire pour
  l'upload serveur. À poser en `.env.local` et sur Vercel. (Débrief prévu.)
- **Nouvelle dépendance `@supabase/supabase-js`.**
- Créer le bucket public `product-images` sur Supabase.
