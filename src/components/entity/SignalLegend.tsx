import { SignalGlyph } from "@/components/SignalIndicator";
import { SIGNAL_LEVELS } from "@/lib/labels";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_COLORS } from "@/lib/theme";
import { cn } from "@/lib/cn";
import type { SignalLevel } from "@/lib/types";

/**
 * Legende de l'echelle de signal pour les graphiques des fiches.
 *
 * Chaque teinte est doublee de son glyphe et de son libelle : la couleur
 * n'est jamais seule (cf. DESIGN_SYSTEM § 1.3). `levels` restreint la
 * legende aux niveaux effectivement presents dans le graphique ; `negated`
 * ajoute la pastille des mentions au sens negatif.
 */
export function SignalLegend({
  levels = SIGNAL_LEVELS,
  negated = false,
  className,
}: {
  levels?: readonly SignalLevel[];
  negated?: boolean;
  className?: string;
}) {
  const ordered = SIGNAL_LEVELS.filter((l) => levels.includes(l));
  return (
    <ul
      aria-label="Légende"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-fg-muted",
        className,
      )}
    >
      {ordered.map((level) => (
        <li key={level} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: SIGNAL_COLORS[level].css }}
          />
          <SignalGlyph level={level} />
          {SIGNAL_DISPLAY[level].label}
        </li>
      ))}
      {negated ? (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-warn" />
          Part au sens négatif
        </li>
      ) : null}
    </ul>
  );
}
