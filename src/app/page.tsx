import { Grid3x3 } from "lucide-react";
import { getCorpusVersion } from "@/lib/db";
import {
  getCorpusStats,
  getLocusOverview,
  getOutcomesByCategory,
  getPublicationsByYear,
  getSignalHighlights,
  getTopAuthors,
} from "@/lib/queries";
import { EpistemicNotice } from "@/components/EpistemicNotice";
import { LinkButton } from "@/components/ui";
import { buildConstellation, pickDiverse } from "@/components/landing/constellation";
import { CorpusFigures } from "@/components/landing/CorpusFigures";
import { EntryPoints } from "@/components/landing/EntryPoints";
import { Hero } from "@/components/landing/Hero";
import { LandingSection } from "@/components/landing/LandingSection";
import { FirstVisitHint } from "@/components/landing/FirstVisitHint";
import { QuickSteps } from "@/components/landing/QuickSteps";
import { ScientificContext } from "@/components/landing/ScientificContext";
import { SignalShowcase } from "@/components/landing/SignalShowcase";
import { getLegacyMapSize } from "@/components/landing/legacy";

/** Allele propose en exemple sous le champ de recherche. */
const EXAMPLE_ALLELE = "HLA-DQB1*02:01";

function formatBuiltAt(builtAt: string): string {
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return builtAt;
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(/^1 /, "1er ");
}

/**
 * Derniere annee du corpus, si elle est incomplete : le corpus a ete fige
 * avant le 31 decembre de cette annee-la. L'histogramme la hachure, pour ne
 * pas faire lire une baisse de publication qui n'est qu'une coupure.
 */
function partialYearOf(builtAt: string, yearMax: number | null): number | null {
  const date = new Date(builtAt);
  if (yearMax === null || Number.isNaN(date.getTime())) return null;
  const endOfYear = date.getUTCMonth() === 11 && date.getUTCDate() === 31;
  return date.getUTCFullYear() === yearMax && !endOfYear ? yearMax : null;
}

/**
 * Accueil — Server Component, aucun JavaScript client hors du champ de
 * recherche.
 *
 * LES EXPLICATIONS « COMMENT LIRE LE SITE » VIVENT DANS /guide : l'accueil
 * n'en garde qu'un bandeau de trois gestes (`QuickSteps`) et un lien.
 *
 * ORDRE DES SECTIONS. Le cadrage epistemique est lu AVANT tout chemin vers
 * une fiche : le bandeau d'ouverture dit « co-occurrences textuelles » et
 * « pas des associations cliniques ni causales » au-dessus du champ de
 * recherche, et l'encart complet (`EpistemicNotice`) suit immediatement le
 * bandeau, avant les chiffres. (Historique : l'encart a ete place avant la
 * recherche parce qu'un panneau de resultats le recouvrait ; le panneau est
 * dans le flux, et la ligne de cadrage du bandeau tient desormais ce role.)
 *
 * ⚠ Aucun compteur n'est ecrit en dur : tous viennent de la base, a chaque
 * rendu (`getCorpusStats`, `getPublicationsByYear`, requetes « accueil » de
 * `queries.ts`). Seuls N = 5 581 / N = 359 (perimetre du corpus REEL, que la
 * base synthetique ne contient pas) sont des constantes documentaires.
 *
 * ⚠ Aucune metrique d'association brute (NPMI, OR, FDR) n'est affichee :
 * l'accueil ne montre que des niveaux qualitatifs et des effectifs.
 */
export default function HomePage() {
  const corpus = getCorpusVersion();
  const stats = getCorpusStats();
  const series = getPublicationsByYear();
  const partialYear = partialYearOf(corpus.builtAt, stats.yearMax);

  const constellation = buildConstellation(
    getSignalHighlights({ levels: ["strong"], resolutions: ["2-digit"], limit: 40 }),
    { maxPerSide: 7, maxEdges: 12 },
  );
  const showcasePairs = pickDiverse(
    getSignalHighlights({ levels: ["strong", "clear"], resolutions: ["4-digit"], limit: 80 }),
    6,
  );

  const categories = getOutcomesByCategory();
  const topAuthor = getTopAuthors(1)[0] ?? null;
  const exampleOutcome =
    categories.flatMap((c) => c.outcomes).find((o) => /humoral/i.test(o.label)) ??
    categories[0]?.outcomes[0] ??
    null;

  return (
    <div className="space-y-16 sm:space-y-20">
      <Hero
        nArticles={stats.nArticles}
        yearMin={stats.yearMin}
        yearMax={stats.yearMax}
        constellation={constellation}
        examples={{
          allele: EXAMPLE_ALLELE,
          outcome: exampleOutcome
            ? { key: exampleOutcome.outcome, label: exampleOutcome.label }
            : null,
          author: topAuthor ? { id: topAuthor.authorId, name: topAuthor.displayName } : null,
        }}
      />

      <div id="cadrage" className="scroll-mt-28">
        <EpistemicNotice corpusVersion={corpus.version} />
      </div>

      <QuickSteps />

      <LandingSection
        id="corpus"
        index="01"
        eyebrow="Le corpus en chiffres"
        title="Ce que contient la base"
        lead={
          <>
            Effectifs comptés dans la base rendue, jamais déclarés. Corpus{" "}
            <span className="font-mono text-fg">{corpus.version}</span> (univers{" "}
            {corpus.universe}), figé le {formatBuiltAt(corpus.builtAt)} : les
            chiffres ne changent pas tant qu&apos;il n&apos;est pas reconstruit.
          </>
        }
      >
        <CorpusFigures
          stats={stats}
          series={series}
          partialYear={partialYear}
          nCategories={categories.length}
        />
      </LandingSection>

      {showcasePairs.length > 0 ? (
        <LandingSection
          id="signaux"
          index="02"
          eyebrow="Signaux les plus marqués"
          title="Des paires à relire en priorité"
          lead="Paires allèle × complication aux niveaux de signal les plus élevés (allèles à 4 champs, une paire par complication). Un signal fort est un point de départ de lecture, pas une conclusion : il peut refléter une mode de publication ou un biais d'indexation."
          actions={
            <LinkButton href="/matrice" variant="secondary" size="sm">
              <Grid3x3 aria-hidden="true" className="h-3.5 w-3.5" />
              Toutes les paires dans la matrice
            </LinkButton>
          }
        >
          <SignalShowcase pairs={showcasePairs} />
        </LandingSection>
      ) : null}

      <LandingSection
        id="entrees"
        index="03"
        eyebrow="Points d'entrée"
        title="Par où commencer ?"
        lead="Quatre portes d'entrée selon ce que vous avez en tête, puis les raccourcis par locus, par catégorie clinique et par auteur."
      >
        <EntryPoints
          loci={getLocusOverview(4)}
          categories={categories}
          authors={getTopAuthors(6)}
          synthetic={corpus.isSynthetic}
        />
      </LandingSection>

      <LandingSection
        id="contexte"
        index="04"
        eyebrow="Contexte scientifique"
        title="Une cartographie de la littérature, pas de la clinique"
      >
        <ScientificContext
          synthetic={corpus.isSynthetic}
          nArticles={stats.nArticles}
          legacy={getLegacyMapSize()}
        />
      </LandingSection>

      <FirstVisitHint />
    </div>
  );
}
