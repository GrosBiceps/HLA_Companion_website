import Link from "next/link";
import {
  ArrowRight,
  Database,
  FileSearch,
  Filter,
  Map as MapIcon,
  ScanText,
  Sigma,
} from "lucide-react";
import { Badge, LinkButton } from "@/components/ui";
import { NUMBER_FORMAT } from "@/components/landing/constellation";

const PIPELINE = [
  {
    icon: <FileSearch />,
    title: "Collecte",
    text: "Requête PubMed : titres, résumés, MeSH.",
  },
  {
    icon: <Filter />,
    title: "Filtrage",
    text: "Greffes d'organes et de cellules souches, espace allélique (corpus A). Seul le rein dispose à ce jour d'un corpus réel.",
  },
  {
    icon: <ScanText />,
    title: "Extraction",
    text: "Allèles, complications et négations, phrase par phrase.",
  },
  {
    icon: <Sigma />,
    title: "Statistiques",
    text: "Co-occurrence observée contre attendue, correction des tests multiples.",
  },
  {
    icon: <Database />,
    title: "Base figée",
    text: "Corpus versionné, scellé par empreinte SHA-256.",
  },
];

/**
 * Contexte scientifique : methode bibliometrique (Donthu et al., 2021),
 * chaine de traitement, perimetre des corpus A / B, et lien vers la carte v1
 * (etude precedente). Le detail des statistiques reste sur /methode.
 */
export function ScientificContext({
  synthetic,
  nArticles,
  legacy,
}: {
  synthetic: boolean;
  nArticles: number;
  legacy: { nodes: number; edges: number } | null;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-fg-muted">
          <p>
            Le compagnon suit la démarche de l&apos;analyse bibliométrique
            décrite par <strong className="font-semibold text-fg">Donthu et al. (2021)</strong> :
            une <em>analyse de performance</em> (qui publie, où, quand) et une{" "}
            <em>cartographie scientifique</em>, ici par analyse de
            co-occurrence — quels termes la littérature emploie dans les mêmes
            phrases.
          </p>
          <p>
            Ce que l&apos;on cartographie est donc un{" "}
            <strong className="font-semibold text-fg">objet de discours</strong> :
            la manière dont les auteurs écrivent sur les allèles HLA et les
            complications de la greffe. C&apos;est un outil de veille et
            d&apos;orientation dans la littérature, pas un instrument
            d&apos;inférence clinique.
          </p>
        </div>

        <ol aria-label="Chaîne de traitement" className="relative space-y-0">
          {PIPELINE.map((s, i) => (
            <li
              key={s.title}
              className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-3 last:pb-0"
            >
              {i < PIPELINE.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[0.9375rem] top-8 w-px bg-line-strong"
                />
              ) : null}
              <span
                aria-hidden="true"
                className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-primary ring-1 ring-line [&>svg]:h-4 [&>svg]:w-4"
              >
                {s.icon}
              </span>
              <p className="pt-1.5 text-sm leading-snug">
                <span className="font-semibold text-fg">
                  <span className="tabular text-fg-subtle">{i + 1}.</span> {s.title}
                </span>{" "}
                <span className="text-fg-muted">— {s.text}</span>
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs leading-snug text-fg-subtle">
            Donthu N, Kumar S, Mukherjee D, Pandey N, Lim WM. How to conduct a
            bibliometric analysis: an overview and guidelines.{" "}
            <em>J Bus Res</em>. 2021;133:285-96.
          </p>
          <LinkButton href="/methode" variant="secondary" size="sm">
            Méthode détaillée
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </LinkButton>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <p className="eyebrow">Périmètre</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border-2 border-primary/40 bg-primary-soft/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-lg font-semibold text-fg">Corpus A</span>
                <Badge tone="primary" size="xs">
                  inclus
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">Espace allélique</p>
              <p className="tabular mt-2 font-serif text-2xl font-semibold text-fg">
                N = 5 581
              </p>
              <p className="text-2xs leading-snug text-fg-subtle">
                articles cibles du corpus réel
                {synthetic
                  ? ` — remplacés ici par ${NUMBER_FORMAT.format(nArticles)} articles fictifs`
                  : ""}
              </p>
            </div>
            <div className="rounded-lg border border-dashed border-line-strong p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-lg font-semibold text-fg-muted">
                  Corpus B
                </span>
                <Badge tone="outline" size="xs">
                  exclu
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">Espace éplétique</p>
              <p className="tabular mt-2 font-serif text-2xl font-semibold text-fg-muted">
                N = 359
              </p>
              <p className="text-2xs leading-snug text-fg-subtle">
                vocabulaire et dénominateurs distincts : jamais combiné à A
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/carte-v1"
          className="group flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-4 transition hover:border-line-strong hover:shadow-raised sm:p-5"
        >
          <span className="flex items-center gap-2">
            <MapIcon aria-hidden="true" className="h-4 w-4 text-accent" />
            <span className="eyebrow">Étude précédente</span>
          </span>
          <span className="font-semibold text-fg">
            Carte v1 — cartographie HLA × complications
          </span>
          <span className="text-sm leading-relaxed text-fg-muted">
            La carte d&apos;ensemble réalisée sur données réelles
            {legacy
              ? ` (${legacy.nodes} nœuds, ${legacy.edges} liens pondérés par le nombre d'articles)`
              : ""}
            , dont ce compagnon reprend le vocabulaire et ajoute le retour aux
            phrases sources.
          </span>
          <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
            Voir la carte v1
            <ArrowRight
              aria-hidden="true"
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>
      </div>
    </div>
  );
}
