import { SignalGlyph } from "@/components/SignalIndicator";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_COLORS, categoryClasses, categoryDisplay } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { coAnchor, plural } from "@/lib/format";
import type { AssociationRow, SignalLevel } from "@/lib/types";
import { SignalLegend } from "./SignalLegend";

/**
 * Profil des complications co-mentionnees avec un allele — barres
 * horizontales groupees par categorie clinique.
 *
 * ENCODAGE. Longueur = nombre d'articles (la quantite verifiable) ; teinte =
 * niveau de signal qualitatif (`SIGNAL_COLORS`), double du glyphe et d'une
 * legende ; segment ambre en bout de barre = part des mentions au sens
 * negatif (jamais fondue). Aucune metrique brute.
 *
 * Chaque ligne est un lien vers la carte detaillee de la meme page (ancre
 * `#co-<cle>`), d'ou part le tiroir de phrases : le graphique est une table
 * des matieres, pas un cul-de-sac.
 */
export function OutcomeProfileChart({
  groups,
}: {
  groups: { category: string; rows: AssociationRow[] }[];
}) {
  const all = groups.flatMap((g) => g.rows);
  const max = Math.max(1, ...all.map((r) => r.nCooccurrence));
  const levels = [...new Set(all.map((r) => r.signalLevel))] as SignalLevel[];
  const hasNegated = all.some((r) => r.nNegated > 0);

  return (
    <div className="space-y-5">
      {groups.map(({ category, rows }) => (
        <div key={category}>
          <p className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
            <span
              aria-hidden="true"
              className={cn(
                "h-2 w-2 rounded-[2px]",
                categoryClasses(category).bg,
              )}
            />
            {categoryDisplay(category)}
          </p>
          <ul className="space-y-0.5">
            {rows.map((row) => {
              const pct = (row.nCooccurrence / max) * 100;
              const negPct =
                row.nCooccurrence > 0
                  ? (row.nNegated / row.nCooccurrence) * 100
                  : 0;
              const weak = row.signalLevel === "weak";
              const display = SIGNAL_DISPLAY[row.signalLevel];
              return (
                <li key={row.outcome}>
                  <a
                    href={`#${coAnchor(row.outcome)}`}
                    title={`${row.label} — ${plural(row.nCooccurrence, "article")}${
                      row.nNegated > 0
                        ? `, dont ${row.nNegated} au sens négatif`
                        : ""
                    } — ${display.label}`}
                    className="group grid grid-cols-1 items-center gap-x-3 gap-y-1 rounded-md px-1.5 py-1 hover:bg-fg/[0.04] sm:grid-cols-[minmax(0,18.5rem)_1fr_auto]"
                  >
                    <span
                      className={cn(
                        "truncate text-sm group-hover:text-primary",
                        weak ? "text-fg-muted" : "font-medium text-fg",
                      )}
                    >
                      {row.label}
                    </span>
                    <span className="flex items-center gap-2 sm:contents">
                      <span
                        aria-hidden="true"
                        className="relative block h-2.5 flex-1 overflow-hidden rounded-full bg-fg/[0.06]"
                      >
                        <span
                          className="absolute inset-y-0 left-0 flex gap-[2px] rounded-full"
                          style={{ width: `${Math.max(1.5, pct)}%` }}
                        >
                          <span
                            className="h-full flex-1 rounded-l-full"
                            style={{
                              background: SIGNAL_COLORS[row.signalLevel].css,
                              borderTopRightRadius: negPct > 0 ? 0 : 9999,
                              borderBottomRightRadius: negPct > 0 ? 0 : 9999,
                            }}
                          />
                          {negPct > 0 ? (
                            <span
                              className="h-full rounded-r-full bg-warn"
                              style={{ width: `${negPct}%`, minWidth: 3 }}
                            />
                          ) : null}
                        </span>
                      </span>
                      <span className="flex w-24 shrink-0 items-center justify-end gap-1.5 text-xs">
                        <span
                          className={cn(
                            "tabular",
                            weak ? "text-fg-subtle" : "text-fg-muted",
                          )}
                        >
                          {plural(row.nCooccurrence, "art.", "art.")}
                        </span>
                        <span className={display.tone}>
                          <SignalGlyph level={row.signalLevel} />
                        </span>
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <SignalLegend
        levels={levels}
        negated={hasNegated}
        className="border-t border-line pt-3"
      />
    </div>
  );
}
