import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { organColor } from "@/lib/theme";
import {
  organLabel,
  type OrganKey,
  type OrganSelection,
} from "@/lib/organ";
import type { OrganCount } from "@/lib/types";
import { OrganMark } from "./OrganMark";

/**
 * Carte « Par organe » des fiches (allele, complication, serotype) : les
 * articles de l'entite repartis par organe, une barre par ligne, une puce
 * coloree (forme + libelle) et un lien qui selectionne l'organe.
 *
 * C'est une ventilation DESCRIPTIVE d'effectifs d'articles distincts : un
 * article multi-organe figure dans chacun de ses organes, la somme peut donc
 * depasser le total de l'entite. Rien n'est une metrique d'association.
 */
export function OrganBreakdown({
  counts,
  selected,
  hrefFor,
  total,
  unit = "article",
  title = "Par organe",
}: {
  counts: readonly OrganCount[];
  selected: OrganSelection;
  /** Lien d'un organe (selection de la strate sur la meme page). */
  hrefFor: (organ: OrganKey) => string;
  /** Articles de l'entite, tous organes confondus (pour la note de bas). */
  total?: number;
  unit?: string;
  title?: string;
}) {
  const max = Math.max(1, ...counts.map((c) => c.nArticles));
  const sorted = [...counts].sort((a, b) => b.nArticles - a.nArticles);
  return (
    <Card aria-label={title}>
      <CardHeader eyebrow="Répartition" title={title} />
      <ul className="mt-4 space-y-1">
        {sorted.map((c) => {
          const active = selected === c.organ;
          const color = organColor(c.organ).css;
          return (
            <li key={c.organ}>
              <Link
                href={hrefFor(c.organ)}
                aria-current={active ? "true" : undefined}
                title={`Voir cette fiche pour : ${organLabel(c.organ)}`}
                className={cn(
                  "group block rounded-lg px-2 py-1.5 transition-colors",
                  active ? "bg-primary-soft" : "hover:bg-surface-muted",
                  c.nArticles === 0 && "opacity-60",
                )}
              >
                <span className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-fg">
                    <OrganMark organ={c.organ} />
                    <span className="truncate">{organLabel(c.organ).replace(/ \(.*\)$/, "")}</span>
                  </span>
                  <span className="tabular shrink-0 text-fg-muted">
                    {formatInt(c.nArticles)}
                    <span className="sr-only"> {unit}{c.nArticles > 1 ? "s" : ""}</span>
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 block h-1 overflow-hidden rounded-full bg-fg/[0.06]"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(c.nArticles / max) * 100}%`,
                      background: color,
                    }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
        Articles distincts par organe
        {total !== undefined ? ` (${formatInt(total)} au total)` : ""} : un
        article qui concerne deux organes figure dans les deux. Cliquer un
        organe recalcule la fiche sur ses seuls articles.
      </p>
    </Card>
  );
}
