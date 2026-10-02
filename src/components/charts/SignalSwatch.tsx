import { SIGNAL_COLORS } from "@/lib/theme";
import { EDGE_WIDTH, cellScale } from "@/lib/viz-encoding";
import type { SignalLevel } from "@/lib/types";
import { EdgeSwatch } from "./Legend";

/**
 * Echantillon de couleur d'un niveau de signal, sous la forme qu'il prend
 * dans la visualisation : un TRAIT (graphe) ou une CASE (matrice).
 *
 * `aria-hidden` : a accompagner du libelle (`SIGNAL_DISPLAY[level].label`).
 */
export function SignalSwatch({
  level,
  variant = "line",
  size = 14,
  scale = 1,
}: {
  level: SignalLevel;
  variant?: "line" | "cell";
  /** Cote de la case (variante `cell`). */
  size?: number;
  /** Fraction de la case remplie (variante `cell`), cf. `cellScale`. */
  scale?: number;
}) {
  const color = SIGNAL_COLORS[level].css;
  if (variant === "line") {
    return (
      <EdgeSwatch
        color={color}
        width={EDGE_WIDTH[level]}
        opacity={level === "weak" ? 0.7 : 1}
      />
    );
  }
  const inner = size * scale;
  const offset = (size - inner) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={size - 1}
        rx={2}
        fill="none"
        stroke="rgb(var(--line))"
      />
      <rect
        x={offset}
        y={offset}
        width={inner}
        height={inner}
        rx={Math.max(1.5, inner * 0.18)}
        fill={color}
      />
    </svg>
  );
}

/** Ligne de tailles de case (effectif d'articles), pour la legende de matrice. */
export function CellSizeScale({
  max,
  steps,
  size = 16,
}: {
  max: number;
  steps: number[];
  size?: number;
}) {
  return (
    <span className="inline-flex items-end gap-3">
      {steps.map((n) => (
        <span key={n} className="inline-flex flex-col items-center gap-1">
          <SignalSwatch level="clear" variant="cell" size={size} scale={cellScale(n, max)} />
          <span className="tabular text-2xs text-fg-subtle">{n}</span>
        </span>
      ))}
    </span>
  );
}
