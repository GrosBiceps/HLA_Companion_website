import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Tuile de statistique — un chiffre DESCRIPTIF du corpus (effectif, periode).
 *
 * ⚠ Reservee aux comptes verifiables (articles, alleles, annees). Jamais une
 * metrique d'association (NPMI, OR, FDR) : une grosse valeur dans une tuile
 * se lit comme un resultat.
 *
 * Poids visuel volontairement modere : l'encart epistemique de l'accueil doit
 * peser plus lourd que ces tuiles.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface px-4 py-3 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-fg-subtle">
        {icon ? (
          <span aria-hidden="true" className="[&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        ) : null}
        <p className="eyebrow">{label}</p>
      </div>
      <p className="tabular mt-1 font-serif text-2xl font-semibold tracking-tight text-fg">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}
