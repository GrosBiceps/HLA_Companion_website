import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { categoryClasses, categoryDisplay, hlaClassColor } from "@/lib/theme";

/**
 * Badge / pastille — etiquette courte, non interactive.
 *
 * `tone` designe un ROLE, pas une couleur : `warn` pour ce qui demande
 * prudence (mention negative, filtre actif), `danger` pour une panne,
 * `success` pour une confirmation, `primary`/`accent` pour la mise en avant,
 * `neutral` par defaut.
 */
export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "warn"
  | "danger"
  | "success"
  | "outline";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-fg-muted ring-1 ring-inset ring-line",
  primary: "bg-primary-soft text-primary-soft-fg ring-1 ring-inset ring-primary/15",
  accent: "bg-accent-soft text-accent-soft-fg ring-1 ring-inset ring-accent/20",
  warn: "bg-warn-soft text-warn-soft-fg ring-1 ring-inset ring-warn-line",
  danger: "bg-danger-soft text-danger-soft-fg ring-1 ring-inset ring-danger-line",
  success:
    "bg-success-soft text-success-soft-fg ring-1 ring-inset ring-success-line",
  outline: "text-fg-muted ring-1 ring-inset ring-line-strong",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  uppercase = false,
  icon,
  className,
  title,
  children,
}: {
  tone?: BadgeTone;
  size?: "xs" | "sm";
  uppercase?: boolean;
  icon?: ReactNode;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium",
        size === "xs" ? "px-1.5 py-px text-2xs" : "px-2 py-0.5 text-xs",
        uppercase && "uppercase tracking-wider",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Pastille de categorie clinique : point colore (echelle categorielle de
 * `theme.ts`) + libelle accentue. La couleur n'est jamais seule.
 */
export function CategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const { bg } = categoryClasses(category);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-line",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", bg)} />
      {categoryDisplay(category)}
    </span>
  );
}

/** Pastille de classe HLA (« Classe I » / « Classe II »). */
export function HlaClassBadge({
  hlaClass,
  className,
}: {
  hlaClass: string;
  className?: string;
}) {
  const known = hlaClass === "I" || hlaClass === "II";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-line",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={{ background: known ? hlaClassColor(hlaClass).css : undefined }}
      />
      {known ? `Classe ${hlaClass}` : "Classe non précisée"}
    </span>
  );
}
