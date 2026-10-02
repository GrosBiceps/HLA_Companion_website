import Link from "next/link";
import { Callout, LinkButton, PageHeader } from "@/components/ui";
import GraphExplorerClient from "@/components/GraphExplorerClient";
import type { Metadata } from "next";
import { OrganStrip } from "@/components/organ/OrganChip";
import {
  getCorpusStats,
  getDefaultGraphCenter,
  getNeighborhood,
  getOrgans,
} from "@/lib/queries";
import {
  ALL_ORGANS,
  organFromSearchParams,
  organShortLabel,
  withOrgan,
} from "@/lib/organ";
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
 *
 * ORGANE. `?organe=coeur` calcule le voisinage dans la STRATE de l'organe :
 * aretes, niveaux de signal et effectifs sont ceux de l'organe (leur propre
 * denominateur). Le centre par defaut est celui de la strate. Les liens du
 * graphe (recentrage, fiches) reportent l'organe.
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
    organe?: string;
  }>;
};

export default async function GraphPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const organ = organFromSearchParams(sp);
  const organs = getOrgans();
  const stratum = organs.find((o) => o.key === organ);

  const requested = sp.center?.trim();
  const fallback = getDefaultGraphCenter(organ);
  // Un `?center=` inconnu ne doit pas rendre une page blanche : on retombe
  // sur le centre par defaut et on le dit.
  const resolved =
    requested && getNeighborhood(requested, 0, undefined, organ).center
      ? requested
      : fallback;

  const rawDepth = Number.parseInt(sp.depth ?? "1", 10);
  const depth = Number.isFinite(rawDepth)
    ? Math.min(Math.max(rawDepth, 1), 3)
    : 1;

  const minSignal = SIGNAL_LEVELS.includes(sp.minSignal as SignalLevel)
    ? (sp.minSignal as SignalLevel)
    : undefined;

  const centerNode = resolved
    ? getNeighborhood(resolved, 0, undefined, organ).center
    : null;
  const baseHref = resolved
    ? `/graph?center=${encodeURIComponent(resolved)}&depth=${depth}${minSignal ? `&minSignal=${minSignal}` : ""}`
    : "/graph";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Explorateur de graphe"
        title="Co-mentions de proche en proche"
        description={
          centerNode ? (
            <>
              Vue centrée sur{" "}
              {/* Libelle affichable, jamais la cle technique. */}
              <strong
                className={centerNode.type === "hla" ? "allele text-fg" : "text-fg"}
              >
                {centerNode.label}
              </strong>
              , à {depth} saut{depth > 1 ? "s" : ""}
              {organ === ALL_ORGANS
                ? ""
                : ` — strate ${organShortLabel(organ)}`}
              . Survolez un nœud pour isoler ses voisins, cliquez pour le
              détail, double-cliquez pour vous y recentrer.
            </>
          ) : undefined
        }
        actions={
          centerNode ? (
            <LinkButton
              href={withOrgan(
                centerNode.type === "hla"
                  ? `/allele/${encodeURIComponent(centerNode.id)}`
                  : `/complication/${encodeURIComponent(centerNode.id)}`,
                organ,
              )}
              size="sm"
            >
              Fiche détaillée
            </LinkButton>
          ) : undefined
        }
      />

      <OrganStrip
        baseHref={baseHref}
        selected={organ}
        counts={Object.fromEntries(organs.map((o) => [o.key, o.nArticles]))}
        allCount={getCorpusStats().nArticles}
        stratum={{ nArticles: stratum?.nArticles, nTotal: getCorpusStats().nArticles }}
        hint="Le graphe est recalculé dans la strate de l'organe : liens, niveaux de signal et effectifs sont ceux de ses seuls articles."
      />


      <Callout tone="framing" aria-label="Comment lire ce graphe" title="Comment lire ce graphe">
        <p>
          Chaque lien signale que deux termes{" "}
          <strong>apparaissent dans les mêmes articles</strong> du corpus
          indexé. Ce n&apos;est pas un réseau de mécanismes biologiques : c&apos;est
          une carte de ce qui se publie ensemble. Un lien épais dit que la
          co-occurrence est marquée dans le texte, pas qu&apos;elle est
          observée chez des patients.
        </p>
        <p>
          Le graphe démarre à un seul saut pour rester lisible ; les signaux
          faibles sont estompés, jamais masqués.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      {requested && resolved !== requested && (
        <Callout tone="warn">
          Le point de départ demandé n&apos;existe pas dans ce corpus. La vue
          repart du point d&apos;entrée par défaut.
        </Callout>
      )}

      {!resolved ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3
                      text-sm text-fg-muted">
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
    </div>
  );
}
