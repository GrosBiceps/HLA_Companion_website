import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Carte — conteneur de surface de base.
 *
 * `tone` :
 *  - `default` : surface blanche (sombre en mode sombre), bordure fine ;
 *  - `muted`   : fond legerement teinte, pour un bloc secondaire ;
 *  - `outline` : sans fond, bordure seule (dans une zone deja teintee).
 *
 * `interactive` ajoute un retour de survol (bordure + ombre) : a reserver aux
 * cartes entierement cliquables (le lien couvre la carte).
 */
export interface CardProps {
  as?: ElementType;
  tone?: "default" | "muted" | "outline";
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

const PADDING = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-7" };

const TONE = {
  default: "bg-surface border border-line shadow-card",
  muted: "bg-surface-muted border border-line",
  outline: "border border-line",
};

export function cardClasses({
  tone = "default",
  padding = "md",
  interactive = false,
}: Pick<CardProps, "tone" | "padding" | "interactive"> = {}): string {
  return cn(
    "rounded-xl",
    TONE[tone],
    PADDING[padding],
    interactive &&
      "transition duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-raised",
  );
}

export function Card({
  as: Tag = "div",
  tone,
  padding,
  interactive,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(cardClasses({ tone, padding, interactive }), className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** En-tete de carte : surtitre, titre, actions a droite. */
export function CardHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-3", className)}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h3 className="text-base font-semibold leading-snug text-fg">{title}</h3>
        {description ? (
          <p className="text-sm text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
