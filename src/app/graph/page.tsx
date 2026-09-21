import Link from "next/link";
import GraphExplorerClient from "@/components/GraphExplorerClient";
import type { Metadata } from "next";
import { getDefaultGraphCenter, getNeighborhood } from "@/lib/queries";
import { SIGNAL_LEVELS } from "@/lib/labels";
import type { SignalLevel } from "@/lib/types";

/**
 * Explorateur de graphe — Server Component d'enveloppe.
 *
 * ROLE : resoudre le centre et le libelle du centre COTE SERVEUR (acces
 * SQLite natif), puis monter le composant de rendu cote client uniquement.
 * Le graphe depend de dimensions et d'evenements de pointeur : un rendu
 * serveur produirait un SVG fige a re-hydrater pour rien.
 *
 * `ssr: false` — dans l'App Router de Next 16, cette option n'est autorisee
 * que depuis un Client Component. Cette page etant un Server Component, le
 * montage client-only passe par `GraphExplorerClient`, une coquille "use
 * client" qui porte le `dynamic(..., { ssr: false })`.
 *
 * CENTRE PAR DEFAUT. Aucune cle n'est ecrite en dur : `getDefaultGraphCenter`
 * calcule l'allele portant le plus d'aretes a signal marque. Meme principe
 * que `getCorpusStats` — un identifiant fige mentirait a la reconstruction
 * suivante du corpus.
 *
 * ENCODAGE. `searchParams` livre des valeurs DEJA decodees : "HLA-DQB1*02:01"
 * arrive tel quel meme s'il a voyage en `HLA-DQB1%2A02%3A01`. On ne redecode
 * pas. Le retour est encode par `URLSearchParams` dans le composant client.
 */

export const metadata: Metadata = {
  title: "Explorateur de graphe — co-occurrences textuelles",
  description:
    "Navigation de proche en proche entre allèles HLA et complications " +
    "co-mentionnés dans la littérature indexée. Ce ne sont pas des " +
    "associations cliniques.",
};

type SearchParams = {
  searchParams: Promise<{
    center?: string;
    depth?: string;
    minSignal?: string;
  }>;
};

export default async function GraphPage({ searchParams }: SearchParams) {
  const sp = await searchParams;

  const requested = sp.center?.trim();
  const fallback = getDefaultGraphCenter();
  // Un `?center=` inconnu ne doit pas rendre une page blanche : on retombe
  // sur le centre par defaut et on le dit.
  const resolved =
    requested && getNeighborhood(requested, 0).center ? requested : fallback;

  const rawDepth = Number.parseInt(sp.depth ?? "1", 10);
  const depth = Number.isFinite(rawDepth)
    ? Math.min(Math.max(rawDepth, 1), 3)
    : 1;

  const minSignal = SIGNAL_LEVELS.includes(sp.minSignal as SignalLevel)
    ? (sp.minSignal as SignalLevel)
    : undefined;

  const centerNode = resolved ? getNeighborhood(resolved, 0).center : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          Explorateur de co-occurrences
        </h1>
        {centerNode && (
          <p className="text-sm text-slate-700">
            Vue centrée sur{" "}
            {/* Libelle affichable, jamais la cle technique. */}
            <strong>{centerNode.label}</strong>, à {depth} saut
            {depth > 1 ? "s" : ""}.
          </p>
        )}
      </header>

      <section
        aria-label="Comment lire ce graphe"
        className="rounded-md border-l-4 border-slate-900 bg-slate-100 px-4 py-3
                   text-sm text-slate-900"
      >
        <p>
          Chaque lien signale que deux termes{" "}
          <strong>apparaissent dans les mêmes articles</strong> du corpus
          indexé. Ce n&apos;est pas un réseau de mécanismes biologiques : c&apos;est
          une carte de ce qui se publie ensemble. Un lien épais dit que la
          co-occurrence est marquée dans le texte, pas qu&apos;elle est
          observée chez des patients.
        </p>
        <p className="mt-1">
          Le graphe démarre à un seul saut pour rester lisible. Cliquez un
          nœud pour vous y recentrer et avancer de proche en proche.{" "}
          <Link
            href="/methodologie"
            className="font-medium underline underline-offset-2
                       hover:text-slate-600"
          >
            Méthodologie
          </Link>
        </p>
      </section>

      {requested && resolved !== requested && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm
                      text-amber-900">
          Le point de départ demandé n&apos;existe pas dans ce corpus. La vue
          repart du point d&apos;entrée par défaut.
        </p>
      )}

      {!resolved ? (
        <p className="rounded-md border border-slate-300 bg-white px-4 py-3
                      text-sm text-slate-700">
          Ce corpus ne contient aucune co-occurrence indexée : il n&apos;y a
          rien à représenter. Ce n&apos;est pas un résultat sur la clinique,
          c&apos;est l&apos;état de la littérature extraite.
        </p>
      ) : (
        <GraphExplorerClient
          center={resolved}
          depth={depth}
          minSignal={minSignal}
        />
      )}

      {centerNode && (
        <p className="text-sm text-slate-600">
          Fiche détaillée :{" "}
          <Link
            href={
              centerNode.type === "hla"
                ? `/allele/${encodeURIComponent(centerNode.id)}`
                : `/complication/${encodeURIComponent(centerNode.id)}`
            }
            className="font-medium underline underline-offset-2"
          >
            {centerNode.label}
          </Link>
        </p>
      )}
    </div>
  );
}
