import { ArrowRight, Grid3x3, Network, ShieldAlert } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { LinkButton } from "@/components/ui";
import { EXTRACTION_METRICS } from "@/lib/extraction-metrics";
import { CooccurrenceConstellation } from "./CooccurrenceConstellation";
import type { Constellation } from "./constellation";
import { NUMBER_FORMAT } from "./constellation";

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
}: {
  nArticles: number;
  yearMin: number | null;
  yearMax: number | null;
  constellation: Constellation;
}) {
  const span =
    yearMin !== null && yearMax !== null ? `${yearMin} à ${yearMax}` : null;

  return (
    <section
      aria-labelledby="accueil-titre"
      className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)] lg:gap-12"
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
          className="font-serif text-[2.125rem] font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[2.7rem]"
        >
          Allèles HLA et complications de la greffe rénale,{" "}
          <span className="text-primary">tels que la littérature les cite ensemble.</span>
        </h1>

        <p className="max-w-[38rem] text-base leading-relaxed text-fg-muted sm:text-lg">
          Ce compagnon cartographie les{" "}
          <strong className="font-semibold text-fg">co-occurrences textuelles</strong>{" "}
          entre allèles HLA et complications dans{" "}
          <span className="tabular font-medium text-fg">
            {NUMBER_FORMAT.format(nArticles)}
          </span>{" "}
          articles indexés par PubMed{span ? ` (${span})` : ""}, et ramène chaque
          chiffre aux phrases sources qui le produisent.
        </p>

        <p className="flex max-w-[38rem] items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-soft/60 px-3.5 py-2.5 text-sm leading-snug text-fg">
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

        <div className="space-y-3">
          <SearchBar className="max-w-[38rem] [&_input]:h-12 [&_input]:shadow-raised" />
          <p className="text-xs text-fg-subtle">
            Exemples : <span className="allele">HLA-DQB1*02:01</span>, « rejet
            humoral », un nom d&apos;auteur. Raccourci <span className="kbd">/</span>{" "}
            depuis toute page.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <LinkButton href="/graph" variant="primary" size="lg">
            <Network aria-hidden="true" className="h-4 w-4" />
            Explorer le graphe
          </LinkButton>
          <LinkButton href="/matrice" variant="secondary" size="lg">
            <Grid3x3 aria-hidden="true" className="h-4 w-4" />
            Matrice allèles × complications
          </LinkButton>
          <LinkButton href="#lire" variant="ghost" size="lg">
            Comment lire le site
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </LinkButton>
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
