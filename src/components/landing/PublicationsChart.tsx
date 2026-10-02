import { cn } from "@/lib/cn";
import type { PublicationsPerYear } from "@/lib/types";
import { NUMBER_FORMAT, niceTicks, plural } from "./constellation";

/**
 * Histogramme des publications par annee — HTML/CSS pur (Server Component).
 *
 * Pourquoi pas un SVG a viewBox fixe : sur 390 px, ses libelles d'axe
 * tomberaient a 5-6 px. Ici les barres sont des boites flex en hauteur
 * relative et les textes restent a taille fixe, quelle que soit la largeur.
 *
 * Une seule serie : pas de legende, le titre la nomme. Deux etiquettes
 * directes seulement (premiere annee, pic). Survol / focus : infobulle CSS
 * par barre. Tableau equivalent pour les lecteurs d'ecran.
 *
 * `partialYear` : derniere annee incomplete (corpus fige en cours d'annee),
 * hachuree et annotee pour ne pas lire une baisse qui n'existe pas.
 */
export function PublicationsChart({
  series,
  partialYear,
  className,
}: {
  series: PublicationsPerYear[];
  partialYear?: number | null;
  className?: string;
}) {
  if (series.length === 0) return null;
  const max = Math.max(...series.map((p) => p.nArticles));
  const ticks = niceTicks(max, 5);
  const top = ticks[ticks.length - 1] || 1;
  const peak = series.reduce((a, b) => (b.nArticles > a.nArticles ? b : a));
  const n = series.length;

  return (
    <figure className={cn("space-y-3", className)}>
      <div className="flex gap-2">
        {/* Axe des ordonnees */}
        <div
          aria-hidden="true"
          className="relative mt-8 h-44 w-7 shrink-0 text-right text-2xs text-fg-subtle sm:h-52"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2"
              style={{ top: `${100 - (100 * t) / top}%` }}
            >
              {NUMBER_FORMAT.format(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative pt-8">
            {/* Grille */}
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-8">
              {ticks.map((t) => (
                <span
                  key={t}
                  className={cn(
                    "absolute inset-x-0 border-t",
                    t === 0 ? "border-line-strong" : "border-dashed border-line",
                  )}
                  style={{ top: `${100 - (100 * t) / top}%` }}
                />
              ))}
            </div>

            {/* Barres */}
            <div aria-hidden="true" className="relative flex h-44 items-end gap-[2px] sm:h-52">
              {series.map((p, i) => {
                const h = (100 * p.nArticles) / top;
                const partial = p.year === partialYear;
                const labelled = p === peak || i === 0;
                const align =
                  i < n / 5 ? "left-0" : i > (4 * n) / 5 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div key={p.year} className="group relative flex h-full flex-1 items-end">
                    <div
                      className={cn(
                        "relative w-full rounded-t-[3px] transition-colors",
                        partial
                          ? "bg-primary/25 ring-1 ring-inset ring-primary/50"
                          : "bg-primary/75 group-hover:bg-primary",
                      )}
                      style={{
                        height: `${Math.max(h, p.nArticles > 0 ? 1 : 0)}%`,
                        backgroundImage: partial
                          ? "repeating-linear-gradient(135deg, rgb(var(--primary) / 0.45) 0 1.5px, transparent 1.5px 4px)"
                          : undefined,
                      }}
                    >
                      {labelled ? (
                        <span className="tabular absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-2xs font-medium text-fg-muted group-hover:invisible">
                          {NUMBER_FORMAT.format(p.nArticles)}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "pointer-events-none invisible absolute -top-8 z-10 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-2xs text-canvas shadow-raised group-hover:visible",
                        align,
                      )}
                    >
                      <span className="font-semibold">{p.year}</span> ·{" "}
                      {plural(p.nArticles, "article")}
                      {partial ? " (année incomplète)" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Axe des abscisses : une annee sur cinq */}
          <div aria-hidden="true" className="mt-1.5 flex gap-[2px] text-2xs text-fg-subtle">
            {series.map((p) => (
              <span key={p.year} className="relative flex-1">
                {p.year % 5 === 0 ? (
                  <span className="tabular absolute left-1/2 -translate-x-1/2">
                    {p.year}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="sr-only">
      <table>
        <caption>Nombre d&apos;articles du corpus par année de publication</caption>
        <thead>
          <tr>
            <th scope="col">Année</th>
            <th scope="col">Articles</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.year}>
              <th scope="row">{p.year}</th>
              <td>{p.nArticles}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {partialYear ? (
        <figcaption className="flex items-center gap-2 pl-9 pt-3 text-2xs text-fg-subtle">
          <span
            aria-hidden="true"
            className="h-2.5 w-3 rounded-[2px] bg-primary/25 ring-1 ring-inset ring-primary/50"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgb(var(--primary) / 0.45) 0 1.5px, transparent 1.5px 4px)",
            }}
          />
          {partialYear} : année incomplète (corpus figé en cours d&apos;année).
        </figcaption>
      ) : null}
    </figure>
  );
}
