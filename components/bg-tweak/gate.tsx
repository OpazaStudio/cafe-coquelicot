"use client";

// Portillon de l'atelier couleurs : monté dans le layout racine, il ne rend
// rien tant que `?atelier=1` n'est pas dans l'URL, et ne charge le panneau
// qu'à ce moment-là. Pour un visiteur ordinaire, le coût se limite à ce fichier.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PARAM } from "@/lib/bg-tweak/state";

const Panel = dynamic(() => import("./panel").then((m) => m.BgTweakPanel), { ssr: false });

export function BgTweakGate() {
  const [armed, setArmed] = useState(false);

  // `window.location` plutôt que `useSearchParams` : lire les paramètres par le
  // hook ferait basculer les pages statiques en rendu dynamique, pour un outil
  // que personne n'ouvre en temps normal. On lit une seule fois — une fois
  // ouvert, le panneau reste monté d'une page à l'autre.
  useEffect(() => {
    // Armement one-shot depuis l'URL (système externe) : le SSR doit rendre
    // null, le paramètre n'existe que dans le navigateur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArmed(new URLSearchParams(window.location.search).has(PARAM));
  }, []);

  return armed ? <Panel /> : null;
}
