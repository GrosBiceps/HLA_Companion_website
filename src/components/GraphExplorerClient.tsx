"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Feedback";
import type { SignalLevel } from "@/lib/types";

/**
 * Coquille de chargement CLIENT-ONLY pour `GraphExplorer`.
 *
 * POURQUOI CE FICHIER EXISTE. Dans l'App Router de Next 16,
 * `dynamic(..., { ssr: false })` est REFUSE depuis un Server Component
 * (erreur de build explicite). La page `/graph` etant un Server Component —
 * elle lit SQLite pour resoudre le centre — l'option doit etre portee par un
 * module `"use client"`. C'est tout ce que fait ce fichier.
 *
 * Le rendu depend de la taille du conteneur et des evenements de pointeur ;
 * d3-force / d3-zoom ne sont charges qu'avec ce morceau, jamais sur les
 * autres pages.
 */
const GraphExplorer = dynamic(() => import("@/components/GraphExplorer"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <Skeleton className="h-[440px] w-full sm:h-[600px]" />
      <p className="mt-3 text-center text-sm text-fg-subtle">
        Chargement de l&apos;explorateur…
      </p>
    </div>
  ),
});

export default function GraphExplorerClient(props: {
  center: string;
  depth: number;
  minSignal?: SignalLevel;
}) {
  return <GraphExplorer {...props} />;
}
