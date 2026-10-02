import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * En-tete de page — titre en serif, surtitre, chapo, meta-donnees.
 *
 * Un seul `PageHeader` par page (il porte le <h1>). `meta` accueille des
 * badges (classe, categorie, effectif) ; `actions` des LinkButton.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn("space-y-3", className)}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="min-w-0 break-words font-serif text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
      {description ? (
        <p className="max-w-prose text-base leading-relaxed text-fg-muted">
          {description}
        </p>
      ) : null}
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
      {children}
    </header>
  );
}

/**
 * Section de page — titre de niveau 2, description, actions a droite.
 * `aria-label` est derive du titre s'il est une chaine.
 */
export function Section({
  id,
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      className={cn("space-y-4", className)}
    >
      {title || eyebrow || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? (
              <h2 className="font-serif text-xl font-semibold tracking-tight text-fg">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-prose text-sm text-fg-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Conteneur de largeur de contenu, avec les gouttieres du site. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}
