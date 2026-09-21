"use client";

import dynamic from "next/dynamic";
import type { SignalLevel } from "@/lib/types";

/**
 * Coquille de chargement CLIENT-ONLY pour `GraphExplorer`.
 *
 * POURQUOI CE FICHIER EXISTE. Le brief demande
 * `dynamic(() => import(...), { ssr: false })`. Dans l'App Router de Next 16,
 * `ssr: false` est REFUSE depuis un Server Component (erreur de build
 * explicite). La page `/graph` etant un Server Component — elle lit SQLite
 * pour resoudre le centre — l'option doit etre portee par un module
 * `"use client"`. C'est tout ce que fait ce fichier.
 *
 * Le rendu depend de dimensions et d'evenements de pointeur : une passe
 * serveur produirait un SVG fige a re-hydrater immediatement, pour rien.
 */
const GraphExplorer = dynamic(() => import("@/components/GraphExplorer"), {
  ssr: false,
  loading: () => (
    <p className="rounded border border-slate-200 bg-white p-8 text-center
                  text-slate-500">
      Chargement de l&apos;explorateur…
    </p>
  ),
});

export default function GraphExplorerClient(props: {
  center: string;
  depth: number;
  minSignal?: SignalLevel;
}) {
  return <GraphExplorer {...props} />;
}
