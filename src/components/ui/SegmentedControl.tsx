"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Controle segmente (« onglets » de filtre) — Client Component.
 *
 * Chaque option est un <button aria-pressed>, pas un role="tab" : ce sont des
 * FILTRES d'une meme liste (toutes / positives / negatives ; profondeur 1-3),
 * pas des panneaux distincts. Le nom accessible du bouton est son texte
 * complet, compteur inclus (« Négatives 1 »).
 */
export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Compteur affiche a droite du libelle. */
  count?: number;
  disabled?: boolean;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap gap-0.5 rounded-lg bg-surface-sunken p-0.5 ring-1 ring-inset ring-line",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-surface text-fg shadow-xs ring-1 ring-line"
                : "text-fg-muted hover:text-fg",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <>
                {" "}
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-2xs",
                    active ? "bg-primary-soft text-primary-soft-fg" : "bg-fg/5",
                  )}
                >
                  {option.count}
                </span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
