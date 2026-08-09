"use client";

// Atelier couleurs — panneau flottant de réglage des fonds.
//
// Deux leviers, aucune injection de CSS :
//   • la palette passe par `documentElement.style.setProperty("--linen", …)` ;
//   • l'assignation passe par l'attribut `data-bg` de chaque section.
//
// Le second point n'est pas cosmétique : `components/effects.tsx` lit
// `dataset.bg` pour basculer le header en encre claire au-dessus des sections
// sombres. Une règle CSS aurait laissé le header désynchronisé — menu burgundy
// sur fond burgundy. On garde donc le mécanisme du site et on prévient l'écouteur.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import "./panel.css";
import {
  DEFAULT_PALETTE,
  INITIAL_STATE,
  INK_FOR_BG,
  PALETTE_ORDER,
  PARAM,
  contrastRatio,
  decodeState,
  encodeState,
  isBgName,
  isSectionKey,
  type BgName,
  type TweakState,
} from "@/lib/bg-tweak/state";

/** Signal écouté par `useHeaderTheme` pour recalculer l'encre du header. */
const HEADER_SYNC_EVENT = "coquelicot:bg-changed";

/** Seuil AA pour du texte courant, l'engagement documenté dans globals.css. */
const AA = 4.5;

type Detected = { el: HTMLElement; key: string; original: BgName };

/**
 * Les sections ne sont pas listées en dur : on énumère celles réellement
 * présentes, ce qui fait marcher le panneau sur la boutique et le tunnel
 * d'achat sans les y déclarer. L'`id` sert de clé quand il existe, sinon la
 * première classe ; un suffixe désambiguïse les doublons.
 */
function collectSections(): Detected[] {
  const seen = new Map<string, number>();
  const found: Detected[] = [];

  document.querySelectorAll<HTMLElement>("section[data-section]").forEach((el) => {
    // L'original est mémorisé sur l'élément : après un premier réglage,
    // `data-bg` ne le porte plus, et le DOM est reconstruit à chaque navigation.
    if (!el.dataset.bgOriginal && el.dataset.bg) el.dataset.bgOriginal = el.dataset.bg;
    const original = el.dataset.bgOriginal;
    if (!isBgName(original)) return;

    const base = el.id || el.classList[0] || "section";
    if (!isSectionKey(base)) return;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);

    found.push({ el, key: n === 0 ? base : `${base}-${n + 1}`, original });
  });

  return found;
}

export function BgTweakPanel() {
  const pathname = usePathname();
  // L'URL n'est lue qu'ici : ensuite c'est l'état React qui fait foi, et il
  // survit aux navigations internes puisque le panneau est monté dans le layout
  // racine, comme CartProvider. `window` est sûr — le module n'est chargé que
  // par un import dynamique en `ssr: false`.
  const [state, setState] = useState<TweakState>(() => decodeState(window.location.search));
  const [sections, setSections] = useState<Detected[]>([]);
  // Replié d'emblée sur téléphone : déplié, il couvrirait ce qu'on cherche à voir.
  const [open, setOpen] = useState(() => window.innerWidth > 520);
  // Le panneau flotte au-dessus de la page et peut donc recouvrir un élément
  // qu'on veut atteindre — le bouton de commande du checkout, par exemple.
  // D'où le passage d'un bord à l'autre.
  const [side, setSide] = useState<"right" | "left">("right");
  const [copied, setCopied] = useState(false);

  // Palette : on ne pose que ce qui diffère, pour que `:root` reprenne la main
  // dès qu'une couleur revient à sa valeur d'origine.
  useEffect(() => {
    const root = document.documentElement;
    for (const name of PALETTE_ORDER) {
      const value = state.palette[name];
      if (value === DEFAULT_PALETTE[name]) root.style.removeProperty(`--${name}`);
      else root.style.setProperty(`--${name}`, value);
    }
  }, [state.palette]);

  // Assignations : réappliquées à chaque changement de route, une fois le DOM
  // de la nouvelle page en place.
  useEffect(() => {
    const found = collectSections();
    for (const { el, key, original } of found) {
      const next = state.sections[key] ?? original;
      if (el.dataset.bg !== next) el.dataset.bg = next;
    }
    window.dispatchEvent(new Event(HEADER_SYNC_EVENT));

    // Les sections réglables sont un état du DOM, pas de React : on ne peut les
    // connaître qu'après le rendu de la page. La liste est conservée telle
    // quelle quand elle n'a pas bougé, donc régler une couleur ne provoque pas
    // de rendu en cascade — seul un changement de route en déclenche un.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSections((prev) =>
      prev.length === found.length && prev.every((p, i) => p.el === found[i].el)
        ? prev
        : found
    );
  }, [state.sections, pathname]);

  // L'URL est la seule mémoire : on la tient à jour pour qu'elle reste copiable
  // depuis n'importe quelle page.
  useEffect(() => {
    const ours = encodeState(state);
    const params = new URLSearchParams(window.location.search);
    // Fusion plutôt que remplacement : /boutique?categorie=… garde son filtre.
    for (const key of ["c", "s"]) {
      const value = ours.get(key);
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    params.set(PARAM, "1");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}${window.location.hash}`
    );
  }, [state, pathname]);

  const setColor = (name: BgName, value: string) =>
    setState((s) => ({ ...s, palette: { ...s.palette, [name]: value } }));

  const setSection = (key: string, bg: BgName, original: BgName) =>
    setState((s) => {
      const next = { ...s.sections };
      if (bg === original) delete next[key];
      else next[key] = bg;
      return { ...s, sections: next };
    });

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const dirty = useMemo(
    () =>
      Object.keys(state.sections).length > 0 ||
      PALETTE_ORDER.some((n) => state.palette[n] !== DEFAULT_PALETTE[n]),
    [state]
  );

  return (
    <aside
      className="bgt"
      data-open={open || undefined}
      data-side={side}
      aria-label="Atelier couleurs"
    >
      <div className="bgt__head">
        <button
          type="button"
          className="bgt__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="bgt__title">atelier couleurs</span>
          <span aria-hidden="true">{open ? "▾" : "▴"}</span>
        </button>
        <button
          type="button"
          className="bgt__move"
          onClick={() => setSide((s) => (s === "right" ? "left" : "right"))}
          title="Passer le panneau de l'autre côté"
          aria-label={`Déplacer le panneau à ${side === "right" ? "gauche" : "droite"}`}
        >
          <span aria-hidden="true">{side === "right" ? "⇤" : "⇥"}</span>
        </button>
      </div>

      {open && (
        <div className="bgt__body">
          <p className="bgt__legend">Palette</p>
          {PALETTE_ORDER.map((name) => (
            <label key={name} className="bgt__color">
              <input
                type="color"
                value={state.palette[name]}
                onChange={(e) => setColor(name, e.target.value)}
                aria-label={`Couleur ${name}`}
              />
              <span className="bgt__name">{name}</span>
              <code className="bgt__hex">{state.palette[name]}</code>
            </label>
          ))}

          <p className="bgt__legend">Fonds de cette page</p>
          {sections.map(({ key, original }) => {
            const bg = state.sections[key] ?? original;
            const ratio = contrastRatio(state.palette[bg], state.palette[INK_FOR_BG[bg]]);
            const weak = ratio < AA;
            return (
              <div key={key} className="bgt__section" role="group" aria-label={`Section ${key}`}>
                <span className="bgt__name" data-moved={bg !== original || undefined}>
                  {key}
                </span>
                <span
                  className="bgt__ratio"
                  data-weak={weak || undefined}
                  title={`Contraste fond / encre : ${ratio.toFixed(2)}:1 — ${
                    weak ? "sous" : "au-dessus du"
                  } seuil AA de ${AA}:1`}
                >
                  {ratio.toFixed(1)}
                </span>
                <div className="bgt__swatches">
                  {PALETTE_ORDER.map((name) => (
                    <label
                      key={name}
                      className="bgt__swatch"
                      data-on={name === bg || undefined}
                      style={{ background: state.palette[name] }}
                    >
                      <input
                        type="radio"
                        name={`bgt-${key}`}
                        value={name}
                        checked={name === bg}
                        onChange={() => setSection(key, name, original)}
                      />
                      <span className="bgt__sr">{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="bgt__foot">
            <button type="button" onClick={copy}>
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
            <button type="button" onClick={() => setState(INITIAL_STATE)} disabled={!dirty}>
              Réinitialiser
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
