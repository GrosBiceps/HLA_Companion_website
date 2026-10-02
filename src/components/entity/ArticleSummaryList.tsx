import Link from "next/link";
import { FileText } from "lucide-react";
import { plural } from "@/lib/format";
import type { ArticleSummary } from "@/lib/queries";

/**
 * Liste d'articles « les plus riches en co-mentions » d'une entite.
 *
 * Le classement compte des PHRASES de co-mention dans l'article (effectif
 * verifiable sur la fiche article), pas un score. Les phrases au sens negatif
 * sont dites, jamais fondues dans le total.
 */
export function ArticleSummaryList({
  articles,
  partnerUnit,
}: {
  articles: ArticleSummary[];
  /** Ce que sont les partenaires : « complication » ou « allèle ». */
  partnerUnit: string;
}) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      {articles.map((a) => (
        <li key={a.pmid} className="flex gap-3 px-4 py-3 sm:px-5">
          <FileText
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint"
          />
          <div className="min-w-0 flex-1">
            <Link
              href={`/article/${encodeURIComponent(a.pmid)}`}
              className="font-serif text-[0.975rem] font-semibold leading-snug text-fg hover:text-primary hover:underline hover:decoration-primary/40 hover:underline-offset-[3px]"
            >
              {a.title}
            </Link>
            <p className="mt-1 text-xs text-fg-muted">
              {a.firstAuthor ? (
                <>
                  {a.firstAuthor}
                  {a.nAuthors > 1 ? " et al." : ""} ·{" "}
                </>
              ) : null}
              <span className="italic">
                {a.journal ?? "Revue non renseignée"}
              </span>{" "}
              · <span className="tabular">{a.year}</span> ·{" "}
              <span className="allele text-fg-subtle">PMID {a.pmid}</span>
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-fg-subtle">
              <span className="tabular">
                {plural(a.nSentences, "phrase")} de co-mention ·{" "}
                {plural(a.nPartners, partnerUnit)}
              </span>
              {a.nNegated > 0 ? (
                <span className="font-medium text-warn-soft-fg">
                  {`dont ${a.nNegated} au sens négatif`}
                </span>
              ) : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
