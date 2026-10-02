import Link from "next/link";
import { ArrowRight, MousePointerClick, Quote, Search } from "lucide-react";
import { HighlightedSentence } from "@/components/HighlightedSentence";
import { SignalIndicator } from "@/components/SignalIndicator";
import { AlleleName, Badge, CategoryBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SIGNAL_CLASSES } from "@/lib/theme";
import type { SignalLevel } from "@/lib/types";
import { plural } from "./constellation";

/**
 * Gloses ACCENTUEES des niveaux de signal, pour la legende de l'accueil.
 * Meme semantique que `SIGNAL_LABELS` (`labels.ts`, miroir sans accents du
 * pipeline Python), reformulee pour une lecture de premier contact.
 */
const LEGEND: { level: SignalLevel; gloss: string }[] = [
  {
    level: "strong",
    gloss:
      "Co-occurrence fréquente (10 articles ou plus) et statistiquement marquée dans le corpus.",
  },
  {
    level: "clear",
    gloss: "Statistiquement marquée, sur un effectif modéré (3 à 9 articles).",
  },
  {
    level: "moderate",
    gloss: "Statistiquement marquée, mais sur 1 ou 2 articles seulement.",
  },
  {
    level: "inverse",
    gloss:
      "Moins de co-mentions qu'attendu par le hasard : un signal d'une autre nature, à vérifier.",
  },
  {
    level: "weak",
    gloss:
      "Non distinguable du hasard à l'échelle du corpus. Affiché grisé, jamais masqué.",
  },
];

export interface ReadingExample {
  hla: string;
  outcome: string;
  label: string;
  category: string;
  signalLevel: SignalLevel;
  nCooccurrence: number;
  nNegated: number;
  /** Corpus synthetique : la phrase d'exemple est fictive, on le dit. */
  synthetic: boolean;
  mention: {
    sentence: string;
    hlaSpan: string;
    outcomeSpan: string;
    pmid: string;
    year: number;
    journal: string | null;
  } | null;
}

function Step({
  n,
  icon,
  title,
  children,
  mock,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  mock: React.ReactNode;
}) {
  return (
    <li className="relative flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-serif text-sm font-semibold text-primary-fg">
          {n}
        </span>
        <span aria-hidden="true" className="text-fg-subtle [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      </div>
      <h3 className="mt-3 text-[0.975rem] font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{children}</p>
      <div className="mt-4 flex flex-1 flex-col justify-end">
        <div
          aria-hidden="true"
          className="rounded-lg border border-line bg-surface-muted p-3 text-xs"
        >
          {mock}
        </div>
      </div>
    </li>
  );
}

/**
 * « Comment lire le site » : le chemin de verification en trois temps
 * (allele → complication → phrases sources), illustre par une paire REELLE
 * du corpus (celle de l'allele vitrine), puis la legende des cinq niveaux.
 *
 * Les maquettes sont `aria-hidden` : ce sont des illustrations, le texte des
 * etapes porte l'information.
 */
export function ReadingGuide({ example }: { example: ReadingExample | null }) {
  const hla = example?.hla ?? "HLA-DQB1*02:01";
  const href = `/allele/${encodeURIComponent(hla)}`;

  return (
    <div className="space-y-6">
      <ol className="grid gap-4 md:grid-cols-3">
        <Step
          n={1}
          icon={<Search />}
          title="Choisir un allèle ou une complication"
          mock={
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg-subtle">
                <Search className="h-3.5 w-3.5" />
                <span className="allele text-fg">{hla.replace(/^HLA-/, "")}</span>
                <span className="h-3.5 w-px animate-pulse bg-primary" />
              </div>
              <div className="flex items-center justify-between rounded-md bg-primary-soft px-2.5 py-1.5">
                <AlleleName hla={hla} className="text-primary-soft-fg" />
                <span className="text-2xs uppercase tracking-wider text-fg-subtle">
                  Allèle
                </span>
              </div>
            </div>
          }
        >
          Par la recherche, le graphe ou la matrice. Chaque fiche liste{" "}
          <em>toutes</em> les complications co-mentionnées, y compris celles
          sans signal.
        </Step>

        <Step
          n={2}
          icon={<MousePointerClick />}
          title="Lire le niveau de signal et l'effectif"
          mock={
            example ? (
              <div
                className={cn(
                  "space-y-2 rounded-md border-l-[3px] bg-surface px-2.5 py-2",
                  SIGNAL_CLASSES[example.signalLevel].border,
                )}
              >
                <p className="font-semibold leading-snug text-fg">{example.label}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SignalIndicator level={example.signalLevel} />
                  <CategoryBadge category={example.category} />
                </div>
                <p className="text-fg-muted">
                  <strong className="font-semibold text-fg">
                    {plural(example.nCooccurrence, "article")}
                  </strong>
                  {example.nNegated > 0 ? ` · dont ${example.nNegated} au sens négatif` : ""}
                </p>
              </div>
            ) : (
              <SignalIndicator level="strong" />
            )
          }
        >
          Un niveau qualitatif, jamais un score ; le nombre d&apos;articles
          vient en premier, et les mentions négatives ne sont jamais masquées.
        </Step>

        <Step
          n={3}
          icon={<Quote />}
          title="Relire les phrases sources"
          mock={
            example?.mention ? (
              <div className="space-y-2">
                <p className="line-clamp-4 font-serif text-[0.8125rem] leading-relaxed text-fg">
                  « <HighlightedSentence
                    sentence={example.mention.sentence}
                    hlaSpan={example.mention.hlaSpan}
                    outcomeSpan={example.mention.outcomeSpan}
                  /> »
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-fg-subtle">
                  <span className="font-mono">PMID {example.mention.pmid}</span>
                  <span>·</span>
                  <span>{example.mention.year}</span>
                  {example.synthetic ? (
                    <Badge size="xs" tone="outline">
                      phrase fictive
                    </Badge>
                  ) : null}
                </p>
              </div>
            ) : (
              <p className="text-fg-muted">Phrase source surlignée.</p>
            )
          }
        >
          « Voir les N phrases » ouvre les extraits surlignés (allèle en bleu,
          complication en ambre) et leur article. Environ une mention sur cinq
          est erronée : c&apos;est ici qu&apos;on le voit.
        </Step>
      </ol>

      <div className="grid gap-4 rounded-xl border border-line bg-surface-muted p-4 sm:p-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-2">
          <p className="eyebrow">Légende</p>
          <p className="text-sm leading-snug text-fg-muted">
            Cinq niveaux de signal, décrits par leur libellé — la couleur ne
            porte jamais seule l&apos;information.
          </p>
          <Link href={href} className="link inline-flex flex-wrap items-center gap-x-1 text-sm">
            <span>Essayer sur</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <AlleleName hla={hla} />
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {LEGEND.map(({ level, gloss }) => (
            <div key={level} className="flex flex-col gap-1">
              <dt>
                <SignalIndicator level={level} />
              </dt>
              <dd className="text-xs leading-snug text-fg-muted">{gloss}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
