import Link from "next/link";
import { EXTRACTION_METRICS } from "@/lib/extraction-metrics";
import type { CorpusVersion } from "@/lib/types";
import { LogoMark } from "./Logo";
import { NAV_ITEMS } from "./nav";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Pied de page — version du corpus, rappel epistemique, credits.
 *
 * Le rappel est volontairement redit ici : le pied est l'endroit ou l'on
 * cherche « d'ou viennent ces chiffres ». Il ne remplace ni le bandeau de
 * tete ni l'encart de l'accueil.
 */
export function SiteFooter({ corpus }: { corpus: CorpusVersion }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface-muted/60">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LogoMark className="h-6 w-6" />
            <span className="font-serif text-base font-semibold text-fg">
              Compagnon HLA
            </span>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-fg-muted">
            Ce site cartographie des{" "}
            <strong className="font-semibold text-fg">
              co-occurrences textuelles
            </strong>{" "}
            dans la littérature indexée : ce ne sont pas des associations
            cliniques ni causales. Extraction automatique, précision mesurée{" "}
            {EXTRACTION_METRICS.precisionPct} — {EXTRACTION_METRICS.errorRatePhrase}.
          </p>
        </div>

        <div className="space-y-3">
          <p className="eyebrow">Corpus</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-fg-subtle">Version</dt>
            <dd className="font-mono text-xs leading-5 text-fg">
              {corpus.version}
            </dd>
            <dt className="text-fg-subtle">Univers</dt>
            <dd className="text-fg">{corpus.universe}</dd>
            <dt className="text-fg-subtle">Figé le</dt>
            <dd className="text-fg">{formatDate(corpus.builtAt)}</dd>
            <dt className="text-fg-subtle">Données</dt>
            <dd className={corpus.isSynthetic ? "font-medium text-warn-soft-fg" : "text-fg"}>
              {corpus.isSynthetic ? "Synthétiques (démonstration)" : "Pipeline réel"}
            </dd>
          </dl>
        </div>

        <div className="space-y-3">
          <p className="eyebrow">Naviguer</p>
          <ul className="space-y-1.5 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-fg-muted transition-colors hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-content flex-col gap-1 px-4 py-4 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            Sources : résumés indexés par PubMed · Méthode : Donthu et al.
            (2021), analyse de performance et cartographie scientifique.
          </p>
          <p>Prototype de recherche — laboratoire HLA.</p>
        </div>
      </div>
    </footer>
  );
}
