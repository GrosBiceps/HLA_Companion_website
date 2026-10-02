import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { AlleleName } from "@/components/ui";
import { EXTRACTION_METRICS } from "@/lib/extraction-metrics";
import { CooccurrenceConstellation } from "./CooccurrenceConstellation";
import type { Constellation } from "./constellation";
import { NUMBER_FORMAT } from "./constellation";

/** Exemples cliquables sous le champ de recherche (un par type d'entite). */
export interface HeroExamples {
  allele: string;
  outcome: { key: string; label: string } | null;
  author: { id: string; name: string } | null;
}

const CHIP =
  "inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg shadow-xs transition hover:border-primary/50 hover:bg-primary-soft hover:text-primary-soft-fg";

/**
 * Bandeau d'ouverture de l'accueil.
 *
 * ORDRE DE LECTURE. Le cadrage epistemique precede la recherche : le chapo
 * dit « co-occurrences textuelles », puis une ligne de cadrage dit ce que ce
 * n'est PAS et donne le taux d'erreur, AVANT le champ de recherche. L'encart
 * complet (`EpistemicNotice`) suit immediatement le bandeau. C'est la
 * garantie historique de l'accueil (l'encart etait place avant la recherche
 * pour qu'on ne rejoigne pas une fiche sans avoir lu une ligne du cadrage) :
 * elle est conservee sous une forme compacte, dans le champ de vision du
 * champ de recherche.
 */
export function Hero({
  nArticles,
  yearMin,
  yearMax,
  constellation,
  examples,
}: {
  nArticles: number;
  yearMin: number | null;
  yearMax: number | null;
  constellation: Constellation;
  examples: HeroExamples;
}) {
  const span =
    yearMin !== null && yearMax !== null ? `${yearMin} à ${yearMax}` : null;

  return (
    <section
      aria-labelledby="accueil-titre"
      className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10"
    >
      <div className="space-y-6">
        <p className="eyebrow flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Compagnon bibliométrique</span>
          <span aria-hidden="true" className="text-fg-faint">·</span>
          <span>Corpus A</span>
          <span aria-hidden="true" className="text-fg-faint">·</span>
          <span>espace allélique</span>
        </p>

        <h1
          id="accueil-titre"
          className="font-serif text-[2.125rem] font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[2.45rem]"
        >
          Allèles HLA et complications de la greffe rénale,{" "}
          <span className="text-primary">tels que la littérature les cite ensemble.</span>
        </h1>

        <p className="hidden max-w-[40rem] text-base leading-relaxed text-fg-muted sm:block sm:text-lg">
          Ce compagnon cartographie les{" "}
          <strong className="font-semibold text-fg">co-occurrences textuelles</strong>{" "}
          entre allèles HLA et complications dans{" "}
          <span className="tabular font-medium text-fg">
            {NUMBER_FORMAT.format(nArticles)}
          </span>{" "}
          articles indexés par PubMed{span ? ` (${span})` : ""}, et ramène chaque
          chiffre aux phrases sources qui le produisent.
        </p>

        <p className="flex max-w-[40rem] items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-soft/60 px-3.5 py-2.5 text-sm leading-snug text-fg">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong className="font-semibold">
              Pas des associations cliniques ni causales.
            </strong>{" "}
            <span className="text-fg-muted">
              Extraction automatique : {EXTRACTION_METRICS.errorRatePhrase}.
            </span>{" "}
            <a href="#cadrage" className="link whitespace-nowrap">
              Lire le cadrage
            </a>
          </span>
        </p>

        <div id="recherche" className="scroll-mt-28 space-y-3">
          <SearchBar className="max-w-[40rem] [&_input]:h-14 [&_input]:text-base [&_input]:shadow-raised" />
          <div className="flex max-w-[40rem] flex-wrap items-center gap-2">
            <span className="text-xs text-fg-subtle">Essayez :</span>
            <Link href={`/allele/${encodeURIComponent(examples.allele)}`} className={CHIP}>
              <AlleleName hla={examples.allele} />
            </Link>
            {examples.outcome ? (
              <Link
                href={`/complication/${encodeURIComponent(examples.outcome.key)}`}
                className={CHIP}
              >
                {examples.outcome.label}
              </Link>
            ) : null}
            {examples.author ? (
              <Link
                href={`/auteur/${encodeURIComponent(examples.author.id)}`}
                className={CHIP}
              >
                {examples.author.name}
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-fg-subtle">
            Allèle, complication, article ou auteur. Raccourci{" "}
            <span className="kbd">/</span> depuis toute page.
          </p>
        </div>
      </div>

      <div className="relative">
        {/* Trame de points decorative derriere la carte. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-4 rounded-[1.75rem] opacity-70 sm:-inset-6"
          style={{
            backgroundImage:
              "radial-gradient(rgb(var(--line-strong)) 1px, transparent 1.2px)",
            backgroundSize: "18px 18px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />
        <div className="relative rounded-2xl border border-line bg-surface/95 px-3 py-4 shadow-raised sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-serif text-lg font-semibold tracking-tight text-fg">
              Les co-occurrences les plus marquées
            </p>
            <p className="text-2xs uppercase tracking-wider text-fg-subtle">
              {constellation.edges.length} paires · calculé en base
            </p>
          </div>
          <CooccurrenceConstellation data={constellation} />
        </div>
      </div>
    </section>
  );
}
