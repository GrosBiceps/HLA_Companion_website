import Link from "next/link";
import { ArrowRight, Quote } from "lucide-react";
import { SignalIndicator } from "@/components/SignalIndicator";
import { AlleleName, CategoryBadge, cardClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SignalHighlight } from "@/lib/queries";
import { SIGNAL_CLASSES } from "@/lib/theme";
import { plural } from "@/components/landing/constellation";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";

/**
 * « Signaux les plus marques » — vitrine de paires (allele, complication).
 *
 * Chaque carte affiche ce que la fiche allele affiche : libelle clinique,
 * niveau QUALITATIF, nombre d'articles, mentions negatives. Aucune metrique
 * brute (NPMI, OR, FDR) : elles restent derriere le depliant des fiches.
 * Toute la carte mene a la fiche, d'ou l'on ouvre les phrases sources.
 */
export function SignalShowcase({
  pairs,
  organ = ALL_ORGANS,
}: {
  pairs: SignalHighlight[];
  organ?: OrganSelection;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pairs.map((p) => (
        <li key={`${p.hla}|${p.outcome}`}>
          <Link
            href={withOrgan(`/allele/${encodeURIComponent(p.hla)}`, organ)}
            className={cn(
              cardClasses({ interactive: true, padding: "none" }),
              "group flex h-full flex-col overflow-hidden",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-1 w-full", SIGNAL_CLASSES[p.signalLevel].bg)}
            />
            <span className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
              <span className="flex items-start justify-between gap-3">
                <AlleleName hla={p.hla} className="text-[0.9375rem] font-semibold text-fg" />
                <SignalIndicator level={p.signalLevel} />
              </span>
              <span className="flex items-center gap-2 text-xs text-fg-subtle">
                <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
                co-mentionné avec
              </span>
              <span className="font-serif text-lg font-semibold leading-snug text-fg">
                {p.label}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={p.category} />
              </span>
              <span className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3 text-xs text-fg-muted">
                <span>
                  <strong className="font-semibold text-fg">
                    {plural(p.nCooccurrence, "article")}
                  </strong>
                  {p.nNegated > 0 ? (
                    <span className="block text-fg-subtle">
                      dont {p.nNegated} au sens négatif
                    </span>
                  ) : (
                    <span className="block text-fg-subtle">aucune mention négative</span>
                  )}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-primary">
                  <Quote aria-hidden="true" className="h-3.5 w-3.5" />
                  Lire les phrases
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
