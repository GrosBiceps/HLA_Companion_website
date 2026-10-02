import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_LABELS } from "@/lib/labels";
import {
  CATEGORIES,
  CATEGORY_FALLBACK,
  categoryColor,
  categoryDisplay,
  SIGNAL_COLORS,
} from "@/lib/theme";
import { SIGNAL_SCALE } from "@/lib/viz-encoding";
import { cn } from "@/lib/cn";

/**
 * Echelles de couleur pour les legendes.
 *
 * `SignalScale` montre l'echelle ORDINALE (faible → fort, sequentiel bleu)
 * comme un ruban continu, et l'`inverse` A PART, separe par un espace : ce
 * n'est pas un echelon de l'echelle mais un signal d'une autre nature (cf.
 * `src/lib/theme.ts`). Chaque segment porte son libelle en clair.
 */
export function SignalScale({
  className,
  compact = false,
}: {
  className?: string;
  /** Libelles courts (« faible », « fort ») sous le ruban. */
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-x-5 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex overflow-hidden rounded-md ring-1 ring-inset ring-fg/10">
          {SIGNAL_SCALE.map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className="h-3 w-[4.75rem]"
              style={{ background: SIGNAL_COLORS[level].css }}
            />
          ))}
        </div>
        <div className="mt-1 flex">
          {SIGNAL_SCALE.map((level) => (
            <span
              key={level}
              title={SIGNAL_LABELS[level].description}
              className="w-[4.75rem] pr-1 text-2xs leading-tight text-fg-muted"
            >
              {compact
                ? SIGNAL_DISPLAY[level].label.replace(/^Signal /, "")
                : SIGNAL_DISPLAY[level].label}
            </span>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <span
          aria-hidden="true"
          className="block h-3 w-[4.75rem] rounded-md"
          style={{ background: SIGNAL_COLORS.inverse.css }}
        />
        <span
          title={SIGNAL_LABELS.inverse.description}
          className="mt-1 block text-2xs leading-tight text-fg-muted"
        >
          {compact ? "inverse" : SIGNAL_DISPLAY.inverse.label}
        </span>
      </div>
    </div>
  );
}

/** Liste des categories cliniques avec leur pastille. */
export function CategoryScale({
  className,
  shape = "square",
  extra,
}: {
  className?: string;
  shape?: "square" | "circle";
  /** Libelle d'une categorie supplementaire « autre » (teinte neutre). */
  extra?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-3.5 gap-y-1.5", className)}>
      {CATEGORIES.map((category) => (
        <li key={category} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "h-2.5 w-2.5",
              shape === "square" ? "rounded-[3px]" : "rounded-full",
            )}
            style={{ background: categoryColor(category).css }}
          />
          {categoryDisplay(category)}
        </li>
      ))}
      {extra ? (
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "h-2.5 w-2.5",
              shape === "square" ? "rounded-[3px]" : "rounded-full",
            )}
            style={{ background: CATEGORY_FALLBACK.css }}
          />
          {extra}
        </li>
      ) : null}
    </ul>
  );
}
