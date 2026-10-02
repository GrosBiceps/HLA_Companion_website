import { CHART_NEUTRALS, cssAlpha } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { activeYears, plural } from "@/lib/format";
import type { YearCount } from "@/lib/queries";

/**
 * Histogramme annuel compact (« sparkline ») — SVG rendu cote serveur.
 *
 * Il distingue d'un coup d'oeil une entite dont la litterature s'est tue
 * d'une entite encore active (spec § 5.3). Il compte des ARTICLES, jamais une
 * metrique. Chaque barre porte un <title> (survol natif) et un resume textuel
 * accompagne le dessin pour les lecteurs d'ecran.
 *
 * L'axe couvre TOUT le corpus (serie densifiee par la requete) : deux
 * sparklines de fiches differentes sont donc comparables en forme. Le corpus
 * croit d'annee en annee : une pente montante peut ne refleter que cette
 * croissance, ce que dit la legende de la carte appelante.
 */
export function YearSparkline({
  series,
  unit = "article",
  height = 56,
  className,
}: {
  series: YearCount[];
  /** Unite comptee, au singulier. */
  unit?: string;
  height?: number;
  className?: string;
}) {
  if (series.length === 0) return null;

  const max = Math.max(1, ...series.map((p) => p.n));
  const peak = series.reduce((a, b) => (b.n > a.n ? b : a), series[0]);
  const span = activeYears(series);
  const total = series.reduce((s, p) => s + p.n, 0);

  // Geometrie en unites SVG : une colonne de 10, barre de 7 (gap de 3).
  const col = 10;
  const bar = 7;
  const w = series.length * col;
  const h = 40;

  const summary =
    total === 0
      ? `Aucun ${unit} entre ${series[0].year} et ${series[series.length - 1].year}.`
      : `${plural(total, unit)} entre ${series[0].year} et ${
          series[series.length - 1].year
        } ; maximum ${plural(peak.n, unit)} en ${peak.year}.`;

  return (
    <figure className={cn("space-y-1.5", className)}>
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
      >
        <line
          x1={0}
          x2={w}
          y1={h - 0.5}
          y2={h - 0.5}
          stroke={CHART_NEUTRALS.lineStrong.css}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {series.map((p, i) => {
          const bh = p.n === 0 ? 0 : Math.max(1.5, (p.n / max) * (h - 2));
          const isPeak = p === peak && p.n > 0;
          return (
            <g key={p.year}>
              <title>{`${p.year} : ${plural(p.n, unit)}`}</title>
              {/* Zone de survol pleine hauteur, plus large que la barre. */}
              <rect
                x={i * col}
                y={0}
                width={col}
                height={h}
                fill="transparent"
              />
              {bh > 0 ? (
                <rect
                  x={i * col + (col - bar) / 2}
                  y={h - 1 - bh}
                  width={bar}
                  height={bh}
                  fill={
                    isPeak
                      ? CHART_NEUTRALS.primary.css
                      : cssAlpha(CHART_NEUTRALS.primary, 0.45)
                  }
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="space-y-1.5 text-2xs text-fg-subtle">
        <span className="flex justify-between">
          <span className="tabular">{series[0].year}</span>
          <span className="tabular">{series[series.length - 1].year}</span>
        </span>
        <span className="tabular block text-xs text-fg-muted">
          {total > 0 ? (
            <>
              Pic :{" "}
              <strong className="font-semibold text-fg">
                {plural(peak.n, unit)}
              </strong>{" "}
              en {peak.year}
              {span && span.first !== span.last
                ? ` · actif de ${span.first} à ${span.last}`
                : ""}
            </>
          ) : (
            "Aucune mention dans le corpus."
          )}
        </span>
      </figcaption>
    </figure>
  );
}
