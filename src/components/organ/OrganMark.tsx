import { cn } from "@/lib/cn";
import type { OrganSelection } from "@/lib/organ";
import { ORGAN_SHAPES, organColor } from "@/lib/theme";

/**
 * Pastille d'organe : une FORME propre a l'organe, dans la couleur de l'organe
 * (`ORGAN_COLORS`). Le double codage forme + couleur sert les lecteurs
 * daltoniens et l'impression en niveaux de gris ; la pastille accompagne
 * toujours un libelle (cf. `OrganChip`) et reste `aria-hidden`.
 *
 * Formes : cercle (rein), carre (foie), losange (coeur), triangle (poumon),
 * hexagone (GCSH), pentagone (pancreas), barre (intestin), anneau (tous).
 */
export function OrganMark({
  organ,
  className,
}: {
  organ: OrganSelection;
  className?: string;
}) {
  const fill = organColor(organ).css;
  const shape = ORGAN_SHAPES[organ];
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn("h-3 w-3 shrink-0", className)}
    >
      {shape === "ring" ? (
        <circle cx="8" cy="8" r="5.2" fill="none" stroke={fill} strokeWidth="2.2" />
      ) : shape === "circle" ? (
        <circle cx="8" cy="8" r="6.2" fill={fill} />
      ) : shape === "square" ? (
        <rect x="2" y="2" width="12" height="12" rx="2" fill={fill} />
      ) : shape === "diamond" ? (
        <path d="M8 0.8 15.2 8 8 15.2 0.8 8Z" fill={fill} />
      ) : shape === "triangle" ? (
        <path d="M8 1.6 15 14H1Z" fill={fill} />
      ) : shape === "hexagon" ? (
        <path d="M4.6 1.8h6.8L15 8l-3.6 6.2H4.6L1 8Z" fill={fill} />
      ) : shape === "pentagon" ? (
        <path d="M8 1 15 6.2 12.4 14.6H3.6L1 6.2Z" fill={fill} />
      ) : (
        <rect x="1" y="5" width="14" height="6" rx="3" fill={fill} />
      )}
    </svg>
  );
}
