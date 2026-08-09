# Atelier couleurs — panneau de réglage des fonds

**Date :** 2026-08-09
**Statut :** validé, prêt à implémenter

## Objectif

Pouvoir essayer d'autres couleurs de fond sur le site en direct, depuis le
navigateur, et partager la variante obtenue par simple copie de l'URL.

## Portée

- Joignable **en production** derrière un paramètre d'URL (`?atelier=1`).
- Agit sur **tout le site** : accueil, boutique, fiche produit, panier,
  checkout, confirmation.
- Deux leviers : la **valeur** des 5 couleurs de marque, et **l'assignation**
  d'une couleur à chaque section.
- L'état vit **dans l'URL**. Pas de `localStorage`, pas de préréglages,
  pas de génération de CSS.

## Mécanique

### Ce qui existe déjà

`app/globals.css:6-10` définit les 5 couleurs de marque dans `:root`
(`--burgundy`, `--pale-oak`, `--coffee-bean`, `--coffee-bean-2`, `--linen`).
Tout le site les consomme par `var(--token)` ; aucun hex n'est répété ailleurs.

`app/globals.css:140-144` traduit `section[data-bg="<nom>"]` en couple
fond/encre (`--bg` / `--fg`). `--muted` et `--line` en dérivent par `color-mix`.

### Ce que fait le panneau

Aucune injection de CSS. Deux API du DOM :

| Levier | Mécanisme |
|---|---|
| Palette | `document.documentElement.style.setProperty("--linen", "#…")` |
| Assignation | `section.dataset.bg = "pale-oak"` |

Passer par l'attribut plutôt que par une règle CSS n'est pas cosmétique :
`components/effects.tsx:37-52` observe `dataset.bg` pour basculer le header en
encre claire au-dessus des sections sombres. Une règle CSS laisserait le header
désynchronisé — menu burgundy sur fond burgundy.

Corollaire de spécificité évité : `section[data-bg="linen"]` pèse (0,1,1), une
règle `.hero` pèserait (0,1,0) et perdrait silencieusement.

Reste que l'`IntersectionObserver` du header ne se redéclenche qu'aux entrées et
sorties : réassigner une section déjà en place ne le réveille pas. Le panneau
émet donc `coquelicot:bg-changed` après chaque application, et `useHeaderTheme`
s'y abonne. Coût pour un visiteur ordinaire : un écouteur qui ne se déclenche
jamais.

### Découverte des sections

Les réglages ne sont pas codés en dur. Au montage et à chaque changement de
route, le panneau énumère `section[data-section]` du document et construit une
ligne par section, identifiée par son `id` s'il existe, sinon par sa première
classe. L'accueil expose 7 sections (`hero`, `shop`, `gallery`, `prestations`,
`atelier-strip`, `about`, `contact`), `/boutique` en expose 2, le tunnel 1.

### Cycle de vie

Le composant est monté dans `app/layout.tsx`, au même niveau que
`CartProvider` : son état React survit aux navigations internes. Un effet sur
`usePathname()` réapplique les assignations au DOM de la nouvelle page et
ré-accroche le paramètre d'URL par `history.replaceState`, pour que le lien
reste copiable depuis n'importe quelle page.

Un rechargement (F5) ou un nouvel onglet repart de la palette d'origine :
conséquence assumée du choix « lien partageable, sans mémorisation locale ».

### Coût en production

Le composant monté dans le layout est un client component minimal qui lit
`window.location.search` dans un effet — pas `useSearchParams`, pour ne pas
faire basculer les pages statiques en rendu dynamique. Sans le paramètre, il ne
rend rien. Le panneau lui-même est chargé à la demande par
`dynamic(() => import("./panel"), { ssr: false })`.

Un bref éclair aux couleurs d'origine précède l'application du réglage. Accepté :
c'est un outil d'essai, pas la peine d'un script bloquant.

## Sécurité

Le panneau étant joignable en production, tout ce qui vient de l'URL est
attaquant-contrôlé et doit être validé **avant** d'atteindre le DOM :

- couleur : `/^#[0-9a-f]{6}$/i`, sinon rejet ;
- nom de fond : appartenance à la liste des 5 valeurs de `SectionBg` ;
- clé de section : `/^[a-z0-9-]+$/i`, appliquée par comparaison aux sections
  réellement présentes, jamais par construction de sélecteur.

Toute valeur invalide est ignorée et laisse la valeur d'origine en place.

## Format d'URL

```
?atelier=1&c=870c20,e0caaf,6d4d36,130105,f3ebe2&s=hero:pale-oak,about:burgundy
```

- `c` — les 5 couleurs dans l'ordre `burgundy, pale-oak, coffee-bean,
  coffee-bean-2, linen`, sans `#`. Omis si aucune n'est modifiée.
- `s` — uniquement les sections réassignées, `clé:couleur` séparés par `,`.
  Omis si aucune ne l'est.

Encodage et décodage sont des fonctions pures, testées unitairement.

## Interface

Panneau flottant en bas à droite, repliable, au-dessus du calque de grain
(`z-index` supérieur à `--z-grain`) :

1. **Palette** — 5 lignes : `<input type="color">`, nom, hex.
2. **Sections** — une ligne par section détectée : nom, cinq pastilles cliquables
   (des radios, pour la navigation au clavier) dont l'active porte un anneau
   ambre lisible sur clair comme sur sombre, et le **ratio de contraste WCAG**
   du couple fond/encre résultant, marqué lorsqu'il descend sous 4.5:1. Le
   fichier `globals.css:137` documente un engagement AA explicite ; l'indicateur
   évite de retenir une palette qui le casse. Un point ambre signale les
   sections déplacées hors de leur fond d'origine.
3. **Pied** — bouton « Copier le lien », bouton « Réinitialiser ».

Le panneau flotte au-dessus de la page et recouvre donc ce qui se trouve dans
son coin — sur `/checkout`, le bouton de commande. Deux échappatoires : un
bouton fait passer le panneau d'un bord à l'autre, et le repli le ramène à
175 × 39 px, largeur de son seul titre.

Sur téléphone il s'ouvre replié et se plafonne à 62 vh : ouvert en grand il
masquerait précisément ce qu'on cherche à voir. Les réglages s'appliquent quand
même — un lien partagé montre la variante, pas le panneau.

Les styles du panneau vivent dans `components/bg-tweak/panel.css`, pas dans
`globals.css` : c'est un outil, il ne doit pas peser sur la feuille de style du
site, et ses couleurs sont en dur pour rester lisibles sous n'importe quelle
palette d'essai.

## Limites connues

- `.site-footer` pose `background: var(--coffee-bean-2)` en dur
  (`globals.css:979-983`). Il suit les changements de palette mais n'a pas de
  réglage individuel.
- Le header n'a pas de fond propre ; il suit l'observateur de `effects.tsx`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `lib/bg-tweak/state.ts` | types, valeurs par défaut, encodage/décodage, validation, contraste |
| `components/bg-tweak/gate.tsx` | client, monté dans le layout, détecte le paramètre, importe le panneau |
| `components/bg-tweak/panel.tsx` | UI et application au DOM |
| `components/bg-tweak/panel.css` | habillage du panneau |
| `app/layout.tsx` | montage du gate |
| `components/effects.tsx` | abonnement du header à `coquelicot:bg-changed` |
| `tests/unit/bg-tweak-state.test.ts` | encodage/décodage, rejet des entrées invalides, contraste |
