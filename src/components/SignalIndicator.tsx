import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_LABELS } from "@/lib/labels";
import { SIGNAL_CLASSES, SIGNAL_RANK } from "@/lib/theme";
import { cn } from "@/lib/cn";
import type { SignalLevel } from "@/lib/types";

/**
 * Indicateur qualitatif de signal — jauge + libellé.
 *
 * La jauge seule serait une metrique deguisee : quatre barres invitent a
 * comparer et a classer sans dire de quoi il s'agit. Le libelle l'accompagne
 * donc TOUJOURS, et la glose de `SIGNAL_LABELS` est exposee en `title` pour
 * qui veut savoir ce que le niveau recouvre.
 *
 * La jauge est `aria-hidden` : le lecteur d'ecran recoit le libelle textuel,
 * qui porte la meme information en clair.
 *
 * `inverse` n'a PAS de jauge : ce n'est pas un echelon de l'echelle mais un
 * signal d'une autre nature (moins de co-mentions qu'attendu). Il recoit un
 * glyphe propre (demi-disque) dans sa teinte orange.
 *
 * `variant` : `pill` (defaut, pastille teintee) ou `plain` (texte seul, pour
 * une legende ou une ligne de tableau).
 */
export function SignalIndicator({
  level,
  variant = "pill",
  className = "",
}: {
  level: SignalLevel;
  variant?: "pill" | "plain";
  className?: string;
}) {
  const display = SIGNAL_DISPLAY[level];
  const gloss = SIGNAL_LABELS[level].description;
  const classes = SIGNAL_CLASSES[level];

  return (
    <span
      title={gloss}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        display.tone,
        variant === "pill" &&
          cn("rounded-full py-0.5 pl-2 pr-2.5", classes.soft),
        className,
      )}
    >
      <SignalGlyph level={level} />
      <span className="text-xs font-semibold tracking-wide">
        {display.label}
      </span>
    </span>
  );
}

/**
 * Glyphe seul (jauge 4 barres, ou demi-disque pour l'inverse). Exporte pour
 * les legendes et tableaux ; toujours a accompagner d'un libelle.
 */
export function SignalGlyph({
  level,
  className,
}: {
  level: SignalLevel;
  className?: string;
}) {
  const classes = SIGNAL_CLASSES[level];

  if (level === "inverse") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className={cn("h-3 w-3 shrink-0", classes.text, className)}
      >
        <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 1.25 A4.75 4.75 0 0 0 6 10.75 Z" fill="currentColor" />
      </svg>
    );
  }

  const rank = SIGNAL_RANK[level];
  return (
    <span aria-hidden="true" className={cn("inline-flex items-end gap-[2px]", className)}>
      {[1, 2, 3, 4].map((step) => (
        <span
          key={step}
          className={cn(
            "w-[3px] rounded-[1px]",
            step <= rank ? classes.bg : "bg-fg/15",
          )}
          style={{ height: `${5 + step * 1.75}px` }}
        />
      ))}
    </span>
  );
}
