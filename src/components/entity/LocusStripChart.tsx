import Link from "next/link";
import { SIGNAL_LEVELS } from "@/lib/labels";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { CHART_NEUTRALS, SIGNAL_COLORS, hlaClassColor } from "@/lib/theme";
import { plural } from "@/lib/format";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";
import type { SignalLevel } from "@/lib/types";
import { SignalLegend } from "./SignalLegend";

/**
 * Vue d'ensemble des alleles co-mentionnes avec une complication — un
 * « nuage de points en bandes » (strip plot), une bande par locus.
 *
 * ENCODAGE. Position horizontale = nombre d'articles (echelle racine carree,
 * commune a toutes les bandes, pour que les petits effectifs — la majorite —
 * ne s'ecrasent pas contre zero) ; teinte du point = niveau de signal
 * qualitatif (legende avec glyphes) ; pastille de la bande = classe HLA
 * (I fonce, II clair). Les points `weak` sont dessines en premier et plus
 * petits : presents, mais en retrait — comme sur les cartes.
 *
 * Chaque point est un lien vers la fiche de l'allele, avec une infobulle
 * native (allele, effectif, niveau). Aucune metrique brute.
 *
 * Rendu HTML positionne (pas de SVG etire) : les points restent ronds a
 * toutes les largeurs, de 390 px a l'ecran large.
 */
export interface StripPoint {
  hla: string;
  locus: string;
  hlaClass: string;
  nCooccurrence: number;
  nNegated: number;
  signalLevel: SignalLevel;
}

export interface StripGroup {
  key: string;
  title: string;
  hlaClass: string | null;
  points: StripPoint[];
}

/** Graduations « rondes » sous le maximum, en echelle racine. */
export function stripTicks(max: number): number[] {
  const candidates = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const within = candidates.filter((t) => t <= max);
  // Garder au plus 5 graduations, les plus espacees en racine.
  if (within.length <= 5) return within;
  return [0, ...within.slice(-4)];
}

export function LocusStripChart({
  groups,
  organ = ALL_ORGANS,
}: {
  groups: StripGroup[];
  /** Strate reportee sur les liens vers les fiches. */
  organ?: OrganSelection;
}) {
  const all = groups.flatMap((g) => g.points);
  const max = Math.max(1, ...all.map((p) => p.nCooccurrence));
  const x = (n: number) => (Math.sqrt(n) / Math.sqrt(max)) * 100;
  const ticks = stripTicks(max);
  const levels = SIGNAL_LEVELS.filter((l) =>
    all.some((p) => p.signalLevel === l),
  );
  const rank = (l: SignalLevel) => (l === "weak" ? 0 : 1);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {groups.map((group) => {
          const marked = group.points.filter(
            (p) => p.signalLevel !== "weak",
          ).length;
          const ordered = [...group.points].sort(
            (a, b) => rank(a.signalLevel) - rank(b.signalLevel),
          );
          return (
            <div
              key={group.key}
              className="grid grid-cols-1 items-center gap-x-4 gap-y-1 border-b border-line/70 py-2 last:border-b-0 sm:grid-cols-[11rem_1fr]"
            >
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                  {group.hlaClass ? (
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ background: hlaClassColor(group.hlaClass).css }}
                    />
                  ) : null}
                  <span className={group.hlaClass ? "allele" : undefined}>
                    {group.title}
                  </span>
                </p>
                <p className="tabular text-2xs text-fg-subtle">
                  {plural(
                    group.points.length,
                    group.hlaClass ? "allèle" : "entité",
                  )}
                  {marked > 0 ? ` · ${marked} au-dessus du seuil` : ""}
                </p>
              </div>
              <div className="relative h-8">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-1/2 h-px bg-line"
                />
                {ordered.map((p, i) => {
                  const weak = p.signalLevel === "weak";
                  const size = weak ? 9 : 13;
                  // Trois couloirs deterministes pour limiter les recouvrements.
                  const lane = weak ? ((i % 3) - 1) * 7 : 0;
                  return (
                    <Link
                      key={p.hla}
                      href={withOrgan(`/allele/${encodeURIComponent(p.hla)}`, organ)}
                      title={`${p.hla} — ${plural(p.nCooccurrence, "article")}${
                        p.nNegated > 0
                          ? `, dont ${p.nNegated} au sens négatif`
                          : ""
                      } — ${SIGNAL_DISPLAY[p.signalLevel].label}`}
                      aria-label={`${p.hla}, ${plural(p.nCooccurrence, "article")}, ${SIGNAL_DISPLAY[p.signalLevel].label}`}
                      className="absolute rounded-full transition-transform hover:z-10 hover:scale-150 focus-visible:z-10 focus-visible:scale-150"
                      style={{
                        left: `calc(${x(p.nCooccurrence)}% - ${size / 2}px)`,
                        top: `calc(50% - ${size / 2}px + ${lane}px)`,
                        width: size,
                        height: size,
                        background: SIGNAL_COLORS[p.signalLevel].css,
                        boxShadow: `0 0 0 1.5px ${CHART_NEUTRALS.surface.css}`,
                        opacity: weak ? 0.85 : 1,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* Axe commun, aligne sur la colonne des bandes. */}
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[11rem_1fr]">
        <span className="hidden text-2xs text-fg-subtle sm:block">
          Articles
        </span>
        <div className="relative h-4 text-2xs text-fg-subtle">
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute -translate-x-1/2"
              style={{ left: `${x(t)}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <p className="text-2xs text-fg-subtle sm:hidden">
        Axe : nombre d&apos;articles (échelle racine carrée).
      </p>
      <SignalLegend levels={levels} className="border-t border-line pt-3" />
    </div>
  );
}
