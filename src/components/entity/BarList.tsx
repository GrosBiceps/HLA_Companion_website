import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";

/**
 * Liste a barres horizontales — EFFECTIFS DESCRIPTIFS uniquement (articles
 * partages, articles d'un auteur...). Jamais une metrique d'association.
 *
 * Le libelle est un vrai texte (lien si `href`), la valeur est ecrite en
 * clair a droite : la barre ne fait que doubler visuellement le nombre. La
 * couleur de la barre porte une identite (categorie, classe HLA) que le
 * libelle ou une pastille redit toujours.
 */
export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  href?: string;
  /** Couleur CSS de la barre (jeton de `theme.ts`). Defaut : encre primaire. */
  color?: string;
  /** Pastille avant le libelle (meme couleur que la barre, si fournie). */
  dot?: string;
  /** Infobulle native de la ligne. */
  title?: string;
}

export function BarList({
  items,
  unit,
  max,
  className,
}: {
  items: BarListItem[];
  /** Unite affichee apres la valeur (« art. »). */
  unit?: string;
  /** Echelle commune (defaut : la plus grande valeur de la liste). */
  max?: number;
  className?: string;
}) {
  const scale = Math.max(1, max ?? Math.max(0, ...items.map((i) => i.value)));
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => {
        const label = (
          <span className="flex min-w-0 items-center gap-1.5">
            {item.dot ? (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: item.dot }}
              />
            ) : null}
            <span className="truncate">{item.label}</span>
          </span>
        );
        return (
          <li key={item.key} title={item.title} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              {item.href ? (
                <Link
                  href={item.href}
                  className="min-w-0 text-fg hover:text-primary hover:underline hover:decoration-primary/40 hover:underline-offset-[3px]"
                >
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 text-fg">{label}</span>
              )}
              <span className="tabular shrink-0 text-xs text-fg-muted">
                {formatInt(item.value)}
                {unit ? <span className="text-fg-subtle"> {unit}</span> : null}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (item.value / scale) * 100)}%`,
                  background: item.color ?? "rgb(var(--primary) / 0.7)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
