---
name: Coquelicot
description: L'affiche d'atelier d'un fleuriste rochelais — fleurs fraîches & séchées, imprimé et chaleureux.
colors:
  burgundy: "#870c20"
  linen: "#f3ebe2"
  pale-oak: "#e0caaf"
  coffee-bean: "#6d4d36"
  espresso: "#130105"
typography:
  display:
    fontFamily: "Bagel Fat One, system-ui, sans-serif"
    fontSize: "clamp(56px, 8vw, 140px)"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "-0.01em"
  script:
    fontFamily: "Caveat, cursive"
    fontSize: "clamp(28px, 3vw, 44px)"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "normal"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.18em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "20px"
  pill: "999px"
spacing:
  stack: "24px"
  container: "48px"
  section: "120px"
components:
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.burgundy}"
    rounded: "{rounded.pill}"
    padding: "16px 24px"
    typography: "{typography.label}"
  button-outline-hover:
    backgroundColor: "{colors.burgundy}"
    textColor: "{colors.linen}"
    rounded: "{rounded.pill}"
    padding: "16px 24px"
  button-filled:
    backgroundColor: "{colors.burgundy}"
    textColor: "{colors.linen}"
    rounded: "{rounded.pill}"
    padding: "16px 24px"
    typography: "{typography.label}"
  chip-pill:
    backgroundColor: "transparent"
    textColor: "{colors.burgundy}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  chip-pill-active:
    backgroundColor: "{colors.burgundy}"
    textColor: "{colors.linen}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  input-underline:
    backgroundColor: "transparent"
    textColor: "{colors.espresso}"
    rounded: "0"
    padding: "8px 0 10px"
  card:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.burgundy}"
    rounded: "{rounded.md}"
    padding: "40px 32px"
---

# Design System: Coquelicot

## 1. Overview

**Creative North Star: "L'Affiche d'Atelier"**

Coquelicot se conçoit comme une affiche imprimée d'atelier, pas comme un site de fleuriste. Le système emprunte au flyer rivage : un display chunky et gras (Bagel Fat One) porté en très grand, des aplats de couleur franche qui saturent des sections entières, un grain papier posé en overlay `multiply` sur toute la page, et des accents manuscrits à la Caveat qui signent l'ensemble comme une main l'aurait fait. L'atmosphère est **joyeuse, franche, généreuse** — la couleur et la typographie ne s'excusent jamais.

La tension qui tient le système : le fond est bruyant, le détail est calme. L'audace vit dans le color-drench et l'échelle typographique ; les composants eux-mêmes sont **délicats et retenus** — champs en simple soulignement, filets de 1px, pills à bord net, transitions longues et douces. On n'empile pas les effets. Une section = une idée de couleur, un titre géant, une illustration au trait qui hérite de la couleur d'encre de la section.

Ce système rejette explicitement le catalogue de fleuriste en ligne générique (Interflora, Aquarelle) froid et couvert de bandeaux promo ; le luxe minimaliste distant en noir-blanc-or ; le corporate/SaaS aseptisé sans personnalité ; et l'écolo cliché (kraft, feuilles vertes, jute). La durabilité des fleurs séchées se lit dans le propos et la matière, jamais dans la panoplie bio attendue.

**Key Characteristics:**
- Affiche imprimée : type géant + grain papier + couleur pleine.
- Color-drench par section : cinq peaux, une par section, jamais de dégradé.
- Illustrations SVG au trait en `currentColor`, qui héritent de l'encre de la section.
- Bruyant au fond, retenu au détail : l'audace est dans la couleur et l'échelle, pas dans le chrome.
- Accent manuscrit (Caveat) comme signature, jamais comme texte courant.

## 2. Colors

Une palette chaude et terreuse de cinq encres, où chaque section choisit un couple fond/encre et s'y tient entièrement.

### Primary
- **Coquelicot Burgundy** (`#870c20`) : la couleur-signature. Encre par défaut sur les fonds clairs (titres, texte, filets, bordures de boutons) et fond pleine section pour les moments forts. C'est le rouge du coquelicot, profond et mat, jamais vif-pompier.

### Secondary
- **Linen Crème** (`#f3ebe2`) : le fond papier par défaut du site et l'encre claire sur les sections foncées. Chaud sans virer au beige-sable générique.
- **Pale Oak** (`#e0caaf`) : fond de section alternatif, plus doré, pour varier le rythme sans quitter la famille chaude.

### Tertiary
- **Coffee Bean** (`#6d4d36`) : brun moyen, fond de section chaleureux (encre linen dessus). La matière bois/tige.

### Neutral
- **Espresso Noir** (`#130105`) : le presque-noir. Couleur du corps de texte sur linen, fond du footer, et encre la plus dense de la famille. Un noir chaud, pas un gris.

### Named Rules
**The Section-Drench Rule.** Chaque section commet un seul couple `--bg` / `--fg` pris dans les cinq encres (`linen`, `burgundy`, `pale-oak`, `coffee-bean`, `espresso`). Toute la section — titres, filets, texte atténué, illustrations — en découle. Jamais deux fonds dans une même section, jamais de dégradé.

**The No-Gray Rule.** Le texte atténué et les filets ne sont JAMAIS un gris neutre. Ils sont une transparence de l'encre de la section : `--muted` = `color-mix(in srgb, var(--fg) 74%, transparent)` (dosé pour le corps de texte : ≥4.5:1 AA sur linen), `--line` = `22%`. Un gris importé sur un fond coloré paraît délavé — interdit.

## 3. Typography

**Display Font:** Bagel Fat One (avec `system-ui, sans-serif`)
**Script Font:** Caveat (avec `cursive`)
**Body Font:** DM Sans (avec `system-ui, sans-serif`)

**Character:** Un display rond, gras et rétro, franchement pop, contrebalancé par un corps DM Sans neutre et lisible ; le Caveat manuscrit vient signer, pas raconter. Le contraste display↔corps est extrême et voulu — c'est l'axe de tout le système.

### Hierarchy
- **Display** (Bagel Fat One 400, `clamp(56px, 8vw, 140px)` — jusqu'à `clamp(72px, 11vw, 200px)` sur le hero, line-height 0.88, lowercase) : titres de section et hero. Toujours en bas de casse.
- **Script** (Caveat 500, `clamp(28px, 3vw, 44px)`, souvent `rotate(-3deg)`) : mot-accent inséré dans ou à côté d'un titre display, prix des prestations, stickers, signatures.
- **Body large** (DM Sans 400, 22px, line-height 1.45) : chapôs, intros de section.
- **Body** (DM Sans 400, 17px, line-height 1.55, `text-wrap: pretty`) : texte courant. Viser 60–75ch de large.
- **Label** (DM Sans 500, 12px, letter-spacing 0.18em, UPPERCASE) : eyebrows, libellés de champs, fils d'Ariane, colonnes de footer.

### Named Rules
**The Lowercase Display Rule.** Bagel Fat One est TOUJOURS en `text-transform: lowercase`. Les capitales cassent la rondeur pop du flyer.

**The Script-Signs-Only Rule.** Caveat ne sert qu'à signer : un mot dans un titre, un prix, un sticker penché. Jamais de phrase courante, jamais de paragraphe en manuscrit.

## 4. Elevation

**⚠ À rediscuter — état factuel documenté, pas encore figé en doctrine.**

Aujourd'hui le système est **entièrement plat** : aucune `box-shadow` dans tout le CSS. La profondeur est purement optique — fonds légèrement teintés (`color-mix(in srgb, var(--fg) 5–10%, transparent)` sur les médias et cartes), filets de 1px (`--line`), coins arrondis, et le grain papier en overlay `multiply` qui unifie les plans. Les surfaces flottantes (récap panier `sticky`) tiennent sans ombre, par le seul filet et le fond.

Le survol ne « soulève » pas : il **inverse la couleur** (le bouton passe fond↔encre) ou décale légèrement (`translateY(-4px)` sur les tuiles de galerie). C'est cohérent avec l'esprit imprimé — une affiche n'a pas d'ombre portée.

Point ouvert à trancher : autoriser ou non une ombre discrète et ponctuelle sur les vrais éléments flottants (modales, panier sticky, cookie banner). Tant que ce n'est pas décidé, rester plat par défaut.

## 5. Components

### Buttons
- **Shape :** pill intégrale (`border-radius: 999px`).
- **Outline (défaut) :** fond transparent, bord `1px solid currentColor`, libellé en Label (13px, UPPERCASE, letter-spacing 0.16em), padding `16px 24px`. Hérite de l'encre de la section.
- **Filled :** fond `--fg`, texte `--bg` (donc burgundy/linen sur une section claire).
- **Hover :** inversion complète fond↔encre via une transition longue `cubic-bezier(0.16, 1, 0.3, 1)` (~0.3s). La flèche `.btn__arrow` glisse de 4px vers la droite.
- **Link-arrow :** variante texte soulignée dont le `gap` s'ouvre de 8px→16px au survol.

### Chips (filtres & variantes)
- **Style :** pill bordée `1px var(--line)`, fond transparent, texte `--fg`.
- **Active :** fond burgundy plein, texte linen. Sert aux filtres catalogue et aux options de variante (taille/coloris).
- **Hover :** la bordure passe à burgundy.

### Cards / Containers
- **Corner Style :** `8px` (cartes prestations, perks, récap panier, confirmation) ; `6px` sur les médias de carte produit ; `4px` sur tuiles de galerie ; `20px` sur le média de page produit.
- **Background :** teinte de l'encre de section (`color-mix`, 5–10%) ou `--bg` plein.
- **Shadow Strategy :** aucune (voir Elevation).
- **Border :** `1px solid var(--line)` sur les cartes bordées ; les cartes produit n'ont pas de bordure (média teinté seul).
- **Internal Padding :** ~`40px 32px` sur les cartes de contenu.
- **Note :** la carte produit N'EST PAS le motif par défaut — le catalogue s'appuie sur des médias illustrés au trait, pas sur des cartes chrome.

### Inputs / Fields
- **Style :** « ghost field » — fond transparent, aucune boîte, uniquement un `border-bottom: 1px solid var(--line)`, `border-radius: 0`. Libellé au-dessus en Label (UPPERCASE 13px). Corps de saisie DM Sans 16px.
- **Focus :** le soulignement passe à `currentColor` (pas de glow, pas de halo).
- **Placeholder :** `--muted` — attention contraste sur sections foncées (viser ≥4.5:1).
- **Radio-cartes (checkout) :** `.checkout-choice` bordée 8px ; l'option active prend un fond teinté `color-mix(var(--fg) 6%)` et une bordure `currentColor`.

### Navigation
- **Style :** header fixe, transparent, DM Sans 14px, letter-spacing 0.04em. Logo en display 28px. Bascule en encre claire (`--light`) au-dessus des sections foncées.
- **Hover :** soulignement animé qui se déploie de gauche à droite (`scaleX(0)→1`, `cubic-bezier(0.16, 1, 0.3, 1)`).
- **Mobile (≤700px) :** la nav se masque ; le logo et les actions restent.

### Signature — Section color-drenchée + illustration au trait
Le composant identitaire : une `<section data-bg="…">` qui repeint fond ET encre, avec un titre display géant, un mot-accent Caveat penché, et une illustration SVG en `currentColor` qui hérite de l'encre. C'est ce motif, répété avec des peaux différentes, qui fait le rythme du site.

### Motion
- **Courbe unique :** `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out expo) sur quasi toutes les transitions.
- **Reveal au scroll :** `translateY(28px)` + opacité, 0.9s, correctement gardé par `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)` — le contenu rendu serveur reste visible sans JS et en motion réduite. Conserver ce garde-fou sur toute nouvelle animation.

## 6. Do's and Don'ts

### Do:
- **Do** appliquer la Section-Drench Rule : un seul couple fond/encre par section, pris dans les cinq encres.
- **Do** dériver `--muted` et `--line` de l'encre de section (`color-mix` de `--fg`), jamais un gris importé (No-Gray Rule).
- **Do** garder Bagel Fat One en bas de casse, toujours, à grande échelle (Lowercase Display Rule).
- **Do** réserver Caveat aux signatures (mot-accent, prix, sticker), jamais au texte courant.
- **Do** faire inverser les boutons (fond↔encre) au survol plutôt que les « soulever ».
- **Do** garder les champs en ghost field (soulignement 1px, pas de boîte) et vérifier le contraste du placeholder (≥4.5:1) sur les sections burgundy/coffee-bean/espresso.
- **Do** garder le grain papier et les illustrations au trait `currentColor` — ce sont des marqueurs de marque.
- **Do** fournir une alternative `prefers-reduced-motion` à toute animation, sans jamais masquer le contenu par défaut.

### Don't:
- **Don't** ressembler à Interflora / Aquarelle : catalogue froid, grilles de cartes chrome identiques, bandeaux promo.
- **Don't** virer au luxe minimaliste froid (noir-blanc-or distant) ni au corporate/SaaS aseptisé sans personnalité.
- **Don't** tomber dans l'écolo cliché (kraft, feuilles vertes partout, jute) pour dire « durable » — le propos et la matière suffisent.
- **Don't** introduire de dégradé, ni de texte en dégradé (`background-clip: text`).
- **Don't** ajouter de bordure latérale colorée >1px (`border-left`/`border-right` accent) comme décor de carte ou d'alerte — utiliser filet complet ou fond teinté.
- **Don't** poser de glassmorphism ni d'ombre par défaut ; le système est plat (élévation à rediscuter avant toute exception).
- **Don't** mettre Bagel Fat One en capitales, ni du corps de texte en manuscrit.
- **Don't** dépasser ~75ch de largeur de lecture sur le texte courant.
