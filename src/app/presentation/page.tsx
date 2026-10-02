import type { Metadata } from "next";
import { Grid3x3, ListTree } from "lucide-react";
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
import { LinkButton, PageHeader } from "@/components/ui";
import { pickDiverse } from "@/components/landing/constellation";
import { LandingSection } from "@/components/landing/LandingSection";
import { getLegacyMapSize } from "@/components/landing/legacy";
import { CorpusFigures } from "@/components/presentation/CorpusFigures";
import { EntryPoints } from "@/components/presentation/EntryPoints";
import { QuickSteps } from "@/components/presentation/QuickSteps";
import { ScientificContext } from "@/components/presentation/ScientificContext";
import { SignalShowcase } from "@/components/presentation/SignalShowcase";

export const metadata: Metadata = {
  title: "Présentation — le corpus et la démarche",
  description:
    "Ce que contient le corpus, comment lire une co-occurrence, les signaux les plus marqués, " +
    "les points d'entrée et le contexte scientifique du compagnon.",
};

const TOC = [
  { id: "cadrage", label: "Ce que le site ne dit pas" },
  { id: "corpus", label: "Le corpus en chiffres" },
  { id: "gestes", label: "Les trois gestes" },
  { id: "signaux", label: "Signaux les plus marqués" },
  { id: "entrees", label: "Par où commencer ?" },
  { id: "contexte", label: "Contexte scientifique" },
];

function TocList({ className, ids }: { className?: string; ids: string[] }) {
  return (
    <ol className={className}>
      {TOC.filter((t) => ids.includes(t.id)).map((t, i) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className="group flex items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
          >
            <span className="tabular w-5 text-2xs text-fg-subtle group-hover:text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            {t.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

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
 * Presentation — tout ce qui a ete retire de l'accueil, pour que l'accueil ne
 * serve qu'a chercher : cadrage epistemique complet, chiffres du corpus, trois
 * gestes, signaux les plus marques, points d'entree, contexte scientifique.
 * Le mode d'emploi oriente « tache » reste dans /guide.
 *
 * ORDRE. Le cadrage epistemique complet ouvre la page, avant les chiffres.
 *
 * ⚠ Aucun compteur n'est ecrit en dur : tous viennent de la base, a chaque
 * rendu. Seuls N = 5 581 / N = 359 (perimetre du corpus REEL) sont des
 * constantes documentaires (dans `ScientificContext`).
 * ⚠ Aucune metrique d'association brute (NPMI, OR, FDR) n'est affichee :
 * seulement des niveaux qualitatifs et des effectifs.
 */
export default function PresentationPage() {
  const corpus = getCorpusVersion();
  const stats = getCorpusStats();
  const series = getPublicationsByYear();
  const partialYear = partialYearOf(corpus.builtAt, stats.yearMax);

  const showcasePairs = pickDiverse(
    getSignalHighlights({ levels: ["strong", "clear"], resolutions: ["4-digit"], limit: 80 }),
    6,
  );

  const categories = getOutcomesByCategory();
  const ids = TOC.filter((t) => t.id !== "signaux" || showcasePairs.length > 0).map((t) => t.id);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Présentation"
        title="Le compagnon HLA en bref"
        description="Ce que contient le corpus, ce que les chiffres veulent dire (et ne veulent pas dire), et par où commencer. Pour un mode d'emploi selon votre besoin, ouvrez le guide."
        actions={
          <LinkButton href="/guide" variant="primary" size="lg">
            Ouvrir le guide d&apos;utilisation
          </LinkButton>
        }
      />

      {/* Sommaire mobile : depliant, sans JavaScript. */}
      <details className="group rounded-xl border border-line bg-surface shadow-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
          <ListTree aria-hidden="true" className="h-4 w-4 text-primary" />
          Sommaire de la page
        </summary>
        <nav aria-label="Sommaire de la présentation" className="border-t border-line p-2">
          <TocList ids={ids} />
        </nav>
      </details>

      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <nav aria-label="Sommaire de la présentation" className="sticky top-36 space-y-2">
            <p className="eyebrow px-2.5">Sur cette page</p>
            <TocList ids={ids} className="space-y-0.5 border-l border-line" />
          </nav>
        </aside>

        <div className="min-w-0 space-y-16 sm:space-y-20">
          <div id="cadrage" className="scroll-mt-28">
            <EpistemicNotice corpusVersion={corpus.version} />
          </div>

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

          <div id="gestes" className="scroll-mt-28">
            <QuickSteps />
          </div>

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
        </div>
      </div>
    </div>
  );
}
