import {
  BookOpen,
  CalendarRange,
  Dna,
  FileText,
  Globe2,
  Quote,
  Stethoscope,
  Users,
} from "lucide-react";
import { SignalIndicator } from "@/components/SignalIndicator";
import { StatTile } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CorpusStats } from "@/lib/queries";
import { SIGNAL_CLASSES } from "@/lib/theme";
import type { PublicationsPerYear, SignalLevel } from "@/lib/types";
import { NUMBER_FORMAT, formatPct } from "./constellation";
import { PublicationsChart } from "./PublicationsChart";

/** Ordre de lecture de la repartition : du plus marque au non distinguable. */
const DISTRIBUTION_ORDER: SignalLevel[] = [
  "strong",
  "clear",
  "moderate",
  "inverse",
  "weak",
];

/**
 * « Le corpus en chiffres » : tuiles d'effectifs, chronologie des
 * publications, repartition des paires par niveau de signal.
 *
 * Tous les chiffres sont des EFFECTIFS calcules en base (`getCorpusStats`,
 * `getPublicationsByYear`) — aucun n'est ecrit en dur, aucun n'est une
 * metrique d'association.
 */
export function CorpusFigures({
  stats,
  series,
  partialYear,
  nCategories,
}: {
  stats: CorpusStats;
  nCategories: number;
  series: PublicationsPerYear[];
  partialYear: number | null;
}) {
  const nYears =
    stats.yearMin !== null && stats.yearMax !== null
      ? stats.yearMax - stats.yearMin + 1
      : 0;
  const total = stats.nAssociations;
  const marked =
    stats.associationsBySignal.strong +
    stats.associationsBySignal.clear +
    stats.associationsBySignal.moderate +
    stats.associationsBySignal.inverse;
  const first = series[0];
  const lastFull = [...series].reverse().find((p) => p.year !== partialYear);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={<FileText />}
          label="Articles"
          value={NUMBER_FORMAT.format(stats.nArticles)}
          hint="titres et résumés PubMed"
        />
        <StatTile
          icon={<Dna />}
          label="Allèles"
          value={NUMBER_FORMAT.format(stats.nAlleles2Digit + stats.nAlleles4Digit)}
          hint={`${NUMBER_FORMAT.format(stats.nAlleles2Digit)} à 2 champs · ${NUMBER_FORMAT.format(stats.nAlleles4Digit)} à 4 champs`}
        />
        <StatTile
          icon={<Stethoscope />}
          label="Complications"
          value={NUMBER_FORMAT.format(stats.nOutcomes)}
          hint={`${nCategories} catégories cliniques`}
        />
        <StatTile
          icon={<CalendarRange />}
          label="Période"
          value={
            stats.yearMin !== null ? `${stats.yearMin}–${stats.yearMax}` : "—"
          }
          hint={`${nYears} années de publication`}
        />
        <StatTile
          icon={<Quote />}
          label="Phrases sources"
          value={NUMBER_FORMAT.format(stats.nPairMentions)}
          hint="mentions allèle + complication"
        />
        <StatTile
          icon={<BookOpen />}
          label="Paires co-citées"
          value={NUMBER_FORMAT.format(stats.nAssociations)}
          hint="allèle × complication, ≥ 1 phrase"
        />
        <StatTile
          icon={<Users />}
          label="Auteurs"
          value={NUMBER_FORMAT.format(stats.nAuthors)}
          hint="noms normalisés"
        />
        <StatTile
          icon={<Globe2 />}
          label="Revues"
          value={NUMBER_FORMAT.format(stats.nJournals)}
          hint={`${NUMBER_FORMAT.format(stats.nCountries)} pays d'édition`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-semibold text-fg">Articles par année de publication</h3>
            {first && lastFull ? (
              <p className="text-xs text-fg-subtle">
                <span className="tabular font-medium text-fg-muted">
                  {NUMBER_FORMAT.format(first.nArticles)}
                </span>{" "}
                en {first.year} →{" "}
                <span className="tabular font-medium text-fg-muted">
                  {NUMBER_FORMAT.format(lastFull.nArticles)}
                </span>{" "}
                en {lastFull.year}
              </p>
            ) : null}
          </div>
          <PublicationsChart
            series={series}
            partialYear={partialYear}
            className="mt-3"
          />
        </div>

        <div className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <h3 className="font-semibold text-fg">
            Paires co-citées, par niveau de signal
          </h3>
          <p className="mt-3 font-serif text-[2rem] font-semibold leading-none tracking-tight text-fg">
            <span className="tabular">{formatPct(stats.associationsBySignal.weak, total)}</span>
          </p>
          <p className="mt-1.5 text-sm leading-snug text-fg-muted">
            des {NUMBER_FORMAT.format(total)} paires ne se distinguent pas du
            hasard à l&apos;échelle du corpus. Seules{" "}
            <span className="tabular font-medium text-fg">
              {NUMBER_FORMAT.format(marked)}
            </span>{" "}
            ressortent (dont{" "}
            {NUMBER_FORMAT.format(stats.associationsBySignal.inverse)} en signal
            inverse) — c&apos;est là que la relecture commence.
          </p>
          <ul className="mt-5 space-y-2.5">
            {DISTRIBUTION_ORDER.map((level) => {
              const n = stats.associationsBySignal[level];
              const pct = total > 0 ? (100 * n) / total : 0;
              return (
                <li
                  key={level}
                  className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.25rem] items-center gap-3"
                >
                  <SignalIndicator level={level} variant="plain" />
                  <span aria-hidden="true" className="h-2 rounded-full bg-surface-sunken">
                    <span
                      className={cn("block h-2 rounded-full", SIGNAL_CLASSES[level].bg)}
                      style={{ width: `${Math.max(pct, n > 0 ? 1.5 : 0)}%` }}
                    />
                  </span>
                  <span className="tabular text-right text-xs font-medium text-fg-muted">
                    {NUMBER_FORMAT.format(n)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto pt-4 text-2xs leading-snug text-fg-subtle">
            Un niveau de signal qualifie la fréquence d&apos;une co-occurrence
            dans le texte, comparée au hasard — jamais une relation chez le
            patient.
          </p>
        </div>
      </div>
    </div>
  );
}
