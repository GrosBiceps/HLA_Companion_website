import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_LABELS } from "@/lib/labels";
import type { SignalLevel } from "@/lib/types";

/**
 * Indicateur qualitatif de signal — pastilles + libellé.
 *
 * Les pastilles seules seraient une metrique deguisee : « ●●●● » invite a
 * comparer et a classer sans dire de quoi il s'agit. Le libelle les accompagne
 * donc TOUJOURS, et la glose de `SIGNAL_LABELS` est exposee en `title` pour
 * qui veut savoir ce que le niveau recouvre.
 *
 * Les pastilles sont `aria-hidden` : a la synthese vocale elles se liraient
 * « cercle noir cercle noir cercle blanc… ». Le lecteur d'ecran recoit le
 * libelle textuel, qui porte la meme information en clair.
 */
export function SignalIndicator({
  level,
  className = "",
}: {
  level: SignalLevel;
  className?: string;
}) {
  const display = SIGNAL_DISPLAY[level];
  const gloss = SIGNAL_LABELS[level].description;

  return (
    <span
      title={gloss}
      className={`inline-flex items-baseline gap-1.5 whitespace-nowrap ${display.tone} ${className}`}
    >
      <span aria-hidden="true" className="tracking-tight">
        {display.dots}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide">
        {display.label}
      </span>
    </span>
  );
}
