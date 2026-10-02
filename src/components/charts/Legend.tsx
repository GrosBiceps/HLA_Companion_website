import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Briques de legende pour les visualisations. Server Components (aucun
 * etat) : utilisables aussi bien dans une page serveur que dans un composant
 * client.
 *
 * Regle du design system : la couleur n'est JAMAIS seule. Chaque pastille
 * est accompagnee de son libelle en clair ; les pastilles sont
 * `aria-hidden`, le texte porte l'information.
 */

export function Legend({
  className,
  children,
  "aria-label": ariaLabel = "Légende",
}: {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-x-8 gap-y-4 rounded-xl border border-line bg-surface-muted/50 p-4 text-xs text-fg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function LegendGroup({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <p className="eyebrow">{title}</p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

export function LegendItem({
  swatch,
  children,
  className,
}: {
  swatch: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex items-center gap-2 leading-snug", className)}>
      <span aria-hidden="true" className="inline-flex w-7 shrink-0 justify-center">
        {swatch}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Pastille de noeud : cercle (allele) ou carre arrondi (complication). */
export function NodeSwatch({
  shape,
  color,
  size = 12,
  dashed = false,
  ring = false,
}: {
  shape: "circle" | "square";
  /** Couleur CSS (`ThemeColor.css`). */
  color: string;
  size?: number;
  dashed?: boolean;
  /** Anneau du noeud central. */
  ring?: boolean;
}) {
  const s = size;
  const pad = ring || dashed ? 4 : 1;
  const box = s + pad * 2;
  const c = box / 2;
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {ring ? (
        <circle
          cx={c}
          cy={c}
          r={s / 2 + 3}
          fill="rgb(var(--primary) / 0.1)"
          stroke="rgb(var(--primary) / 0.55)"
          strokeWidth={1.25}
        />
      ) : null}
      {shape === "circle" ? (
        <circle
          cx={c}
          cy={c}
          r={s / 2}
          fill={color}
          stroke={ring ? "rgb(var(--fg))" : "none"}
          strokeWidth={ring ? 1.75 : 0}
        />
      ) : (
        <rect
          x={c - s / 2}
          y={c - s / 2}
          width={s}
          height={s}
          rx={s * 0.3}
          fill={color}
        />
      )}
      {dashed ? (
        <circle
          cx={c}
          cy={c}
          r={s / 2 + 2.5}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      ) : null}
    </svg>
  );
}

/** Echantillon de lien. */
export function EdgeSwatch({
  color,
  width = 2,
  opacity = 1,
  dash,
  length = 26,
}: {
  color: string;
  width?: number;
  opacity?: number;
  dash?: string;
  length?: number;
}) {
  return (
    <svg width={length} height={12} viewBox={`0 0 ${length} 12`} aria-hidden="true">
      <line
        x1={2}
        y1={6}
        x2={length - 2}
        y2={6}
        stroke={color}
        strokeWidth={width}
        strokeOpacity={opacity}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}
