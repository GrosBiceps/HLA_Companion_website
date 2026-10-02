"use client";

import dynamic from "next/dynamic";
import type { LegacyMap } from "@/lib/legacy-map";
import { Skeleton } from "@/components/ui/Feedback";

/**
 * Coquille CLIENT-ONLY de la carte v1 — meme raison que
 * `GraphExplorerClient` : `ssr: false` n'est autorise que depuis un module
 * "use client", et le rendu depend de la taille du conteneur (mesuree) et
 * des evenements de pointeur.
 */
const LegacyMapExplorer = dynamic(() => import("@/components/LegacyMapExplorer"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <Skeleton className="h-[380px] w-full sm:h-[600px]" />
      <p className="mt-3 text-center text-sm text-fg-subtle">Chargement de la carte…</p>
    </div>
  ),
});

export default function LegacyMapClient({ map }: { map: LegacyMap }) {
  return <LegacyMapExplorer map={map} />;
}
