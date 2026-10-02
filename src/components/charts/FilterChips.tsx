"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Filtre a choix multiple sous forme de pastilles basculantes — Client
 * Component. Chaque pastille est un `<button aria-pressed>` dont le nom
 * accessible est son texte complet (libelle + compteur).
 *
 * Une pastille desactivee (decochee) reste VISIBLE et barree d'une teinte
 * neutre : on voit toujours ce qui a ete retire de la vue.
 */
export interface ChipOption<T extends string> {
  value: T;
  label: ReactNode;
  swatch?: ReactNode;
  count?: number;
  title?: string;
}

export function FilterChips<T extends string>({
  options,
  selected,
  onToggle,
  ariaLabel,
  className,
}: {
  options: ChipOption<T>[];
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() => onToggle(o.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition",
              on
                ? "bg-surface text-fg shadow-xs ring-line-strong hover:bg-surface-muted"
                : "bg-transparent text-fg-subtle ring-line line-through decoration-fg-faint hover:text-fg-muted",
            )}
          >
            {o.swatch ? (
              <span aria-hidden="true" className={cn("inline-flex", !on && "opacity-35 grayscale")}>
                {o.swatch}
              </span>
            ) : null}
            {o.label}
            {o.count !== undefined ? (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-2xs no-underline",
                  on ? "bg-fg/[0.06] text-fg-muted" : "text-fg-faint",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
