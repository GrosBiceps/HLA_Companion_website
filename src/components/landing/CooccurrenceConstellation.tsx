import Link from "next/link";
import { AlleleName } from "@/components/ui";
import { SignalIndicator } from "@/components/SignalIndicator";
import { cn } from "@/lib/cn";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import {
  SIGNAL_COLORS,
  categoryClasses,
  categoryDisplay,
  hlaClassColor,
} from "@/lib/theme";
import type { SignalLevel } from "@/lib/types";
import type { Constellation } from "./constellation";
import { NUMBER_FORMAT } from "./constellation";

const SIGNAL_LABEL_TEXT: Record<SignalLevel, string> = Object.fromEntries(
  Object.entries(SIGNAL_DISPLAY).map(([k, v]) => [k, v.label.toLowerCase()]),
) as Record<SignalLevel, string>;

/** Hauteur d'une ligne de noeud, en px (colonnes HTML et SVG partagent l'echelle). */
const ROW_H = 40;

/**
 * Reseau bipartite des co-occurrences les plus marquees — Server Component,
 * aucun JavaScript client.
 *
 * Les NOEUDS sont du HTML (texte net, liens accessibles, troncature propre
 * sur mobile) ; seuls les LIENS sont un SVG etire entre les deux colonnes
 * (`preserveAspectRatio="none"` + `vector-effect: non-scaling-stroke`, pour
 * que l'epaisseur reste en pixels quelle que soit la largeur).
 *
 * Encodage : couleur du lien = niveau de signal (`SIGNAL_COLORS`, avec
 * legende textuelle) ; epaisseur = nombre d articles co-citant la paire (effectif
 * verifiable, pas une metrique d'association). Pastilles : classe HLA a
 * gauche, categorie clinique a droite (nom en infobulle et dans la liste
 * accessible).
 */
export function CooccurrenceConstellation({
  data,
  className,
}: {
  data: Constellation;
  className?: string;
}) {
  const rows = Math.max(data.alleles.length, data.outcomes.length);
  if (rows === 0 || data.edges.length === 0) return null;
  const height = rows * ROW_H;
  const yA = (i: number) => ((i + 0.5) * height) / data.alleles.length;
  const yO = (i: number) => ((i + 0.5) * height) / data.outcomes.length;

  const counts = data.edges.map((e) => e.nCooccurrence);
  const nMin = Math.min(...counts);
  const nMax = Math.max(...counts);
  const width = (n: number) =>
    nMax === nMin ? 2.5 : 1.25 + (3.75 * (n - nMin)) / (nMax - nMin);

  // Liens les plus fins dessines en dernier : ils restent visibles par-dessus.
  const edges = [...data.edges].sort((a, b) => b.nCooccurrence - a.nCooccurrence);
  const levels = [...new Set(data.edges.map((e) => e.signalLevel))] as SignalLevel[];

  return (
    <figure className={cn("space-y-4", className)}>
      <div
        className="grid grid-cols-[auto_minmax(1.5rem,0.5fr)_minmax(0,1.6fr)] items-stretch sm:grid-cols-[auto_minmax(2.5rem,0.6fr)_minmax(0,1.5fr)]"
        style={{ height }}
      >
        {/* Colonne des alleles */}
        <ul aria-label="Allèles" className="flex flex-col" style={{ height }}>
          {data.alleles.map((a) => (
            <li
              key={a.hla}
              className="flex items-center justify-end"
              style={{ height: height / data.alleles.length }}
            >
              <Link
                href={`/allele/${encodeURIComponent(a.hla)}`}
                className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1.5 text-xs text-fg shadow-xs transition hover:border-primary/50 hover:text-primary"
              >
                <AlleleName hla={a.hla} className="text-[0.75rem]" />
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-surface"
                  style={{ background: hlaClassColor(a.hlaClass).css }}
                />
              </Link>
            </li>
          ))}
        </ul>

        {/* Liens */}
        <svg
          aria-hidden="true"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full overflow-visible"
          style={{ height }}
        >
          {edges.map((e) => {
            const y1 = yA(e.from);
            const y2 = yO(e.to);
            return (
              <path
                key={`${e.hla}|${e.outcome}`}
                d={`M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`}
                fill="none"
                stroke={SIGNAL_COLORS[e.signalLevel].css}
                strokeOpacity={e.signalLevel === "strong" ? 0.8 : 0.7}
                strokeWidth={width(e.nCooccurrence)}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Colonne des complications */}
        <ul aria-label="Complications" className="flex min-w-0 flex-col" style={{ height }}>
          {data.outcomes.map((o) => (
            <li
              key={o.outcome}
              className="flex min-w-0 items-center"
              style={{ height: height / data.outcomes.length }}
            >
              <Link
                href={`/complication/${encodeURIComponent(o.outcome)}`}
                title={`${o.label} — ${categoryDisplay(o.category)}`}
                className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1.5 pr-2.5 text-xs text-fg shadow-xs transition hover:border-primary/50 hover:text-primary"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface",
                    categoryClasses(o.category).bg,
                  )}
                />
                <span className="truncate">{o.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Equivalent textuel des liens, pour les lecteurs d'ecran. */}
      <ul className="sr-only" aria-label="Paires représentées">
        {data.edges.map((e) => {
          const o = data.outcomes[e.to];
          return (
            <li key={`${e.hla}|${e.outcome}`}>
              {e.hla} et {o?.label} : {SIGNAL_LABEL_TEXT[e.signalLevel]},{" "}
              {NUMBER_FORMAT.format(e.nCooccurrence)} articles
            </li>
          );
        })}
      </ul>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-2xs text-fg-subtle">
        {levels.map((l) => (
          <SignalIndicator key={l} level={l} variant="plain" />
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="0 0 28 8" className="h-2 w-7">
            <path d="M1 6 L27 2" stroke="currentColor" strokeWidth="1" />
            <path d="M1 7 L27 5" stroke="currentColor" strokeWidth="3" opacity="0.6" />
          </svg>
          épaisseur = nombre d&apos;articles ({NUMBER_FORMAT.format(nMin)} à{" "}
          {NUMBER_FORMAT.format(nMax)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: hlaClassColor("I").css }}
          />
          classe I
          <span
            aria-hidden="true"
            className="ml-1 h-2 w-2 rounded-full"
            style={{ background: hlaClassColor("II").css }}
          />
          classe II
        </span>
      </figcaption>
    </figure>
  );
}
