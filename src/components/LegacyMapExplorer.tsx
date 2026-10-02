"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  CATEGORY_FALLBACK,
  CHART_NEUTRALS,
  categoryColor,
  categoryDisplay,
  HLA_CLASS_COLORS,
} from "@/lib/theme";
import { compressRadially, relaxPositions } from "@/lib/network-layout";
import type { LegacyMap, LegacyNode } from "@/lib/legacy-map";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { NetworkView, type NetEdge, type NetNode } from "@/components/charts/NetworkView";
import { cn } from "@/lib/cn";

/**
 * Explorateur de la carte v1 (donnees reelles de l'etude anterieure) —
 * Client Component, monte en `ssr: false` par `LegacyMapClient`.
 *
 * Reutilise la vue de reseau de l'explorateur de graphe (`NetworkView`),
 * avec un encodage DIFFERENT pour les liens : ici il n'existe aucun niveau
 * de signal, seulement un COMPTE BRUT de PMID. Les liens sont donc dessines
 * dans une encre neutre, l'epaisseur suivant le compte — jamais avec les
 * couleurs de l'echelle de signal, qui feraient croire a une analyse
 * statistique que cette carte ne porte pas.
 *
 * Positions : celles de la disposition Gephi d'origine (y inverse : Gephi
 * pointe vers le haut, SVG vers le bas), legerement desserrees pour que
 * les noeuds ne se chevauchent plus (`relaxPositions`).
 */

const SCALE = 2.4;

function legacyColor(n: LegacyNode): string {
  if (n.kind === "complication") {
    return n.category ? categoryColor(n.category).css : CATEGORY_FALLBACK.css;
  }
  return n.hlaClass ? HLA_CLASS_COLORS[n.hlaClass].css : CATEGORY_FALLBACK.css;
}

function legacyRadius(n: LegacyNode): number {
  return 4 + n.size * 0.62;
}

function kindText(n: LegacyNode): string {
  if (n.kind === "complication") {
    return n.category
      ? `Complication · regroupée sous « ${categoryDisplay(n.category)} »`
      : "Complication · hors catégories du site";
  }
  const cls = n.hlaClass ? `classe ${n.hlaClass}` : "classe non déduite";
  return `HLA · ${cls}${n.serological ? " · notation sérologique" : ""}`;
}

export default function LegacyMapExplorer({ map }: { map: LegacyMap }) {
  const [query, setQuery] = useState("");
  const [minWeight, setMinWeight] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string | null>(null);

  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);

  const positions = useMemo(
    () =>
      relaxPositions(
        compressRadially(
          map.nodes.map((n) => ({
            id: n.id,
            x: n.x * SCALE,
            y: -n.y * SCALE,
            r: legacyRadius(n),
          })),
          0.55,
        ),
        { padding: 9 },
      ),
    [map],
  );

  const edges = useMemo(
    () => map.edges.filter((e) => e.weight >= minWeight),
    [map, minWeight],
  );
  const visibleIds = useMemo(() => {
    if (minWeight === 1) return new Set(map.nodes.map((n) => n.id));
    const s = new Set<string>();
    for (const e of edges) {
      s.add(e.hla);
      s.add(e.complication);
    }
    return s;
  }, [edges, map, minWeight]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return map.nodes.filter(
      (n) =>
        visibleIds.has(n.id) &&
        (n.label.toLowerCase().includes(q) || (n.gloss ?? "").toLowerCase().includes(q)),
    );
  }, [query, map, visibleIds]);
  const matchedIds = useMemo(
    () => (matches ? new Set(matches.map((n) => n.id)) : null),
    [matches],
  );

  const netNodes: NetNode[] = useMemo(
    () =>
      map.nodes
        .filter((n) => visibleIds.has(n.id))
        .map((n) => {
          const p = positions.get(n.id) ?? { x: 0, y: 0 };
          return {
            id: n.id,
            label: n.label,
            x: p.x,
            y: p.y,
            r: legacyRadius(n),
            fill: legacyColor(n),
            shape: n.kind === "hla" ? "circle" : "square",
            mono: n.kind === "hla",
            dashedOutline: n.serological,
            priority: (n.kind === "complication" ? 40 : 0) + n.size * 3 + n.strength * 4,
            ariaLabel: `${n.label} — ${kindText(n)}, ${n.degree} partenaire${n.degree > 1 ? "s" : ""}`,
          };
        }),
    [map, positions, visibleIds],
  );

  const netEdges: NetEdge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.hla,
        target: e.complication,
        stroke: e.weight >= 2 ? CHART_NEUTRALS.primary.css : CHART_NEUTRALS.fgSubtle.css,
        width: e.weight === 1 ? 1.1 : e.weight === 2 ? 2.6 : 4,
        opacity: e.weight === 1 ? 0.4 : 0.85,
        order: e.weight,
      })),
    [edges],
  );

  const renderTooltip = useCallback(
    (nn: NetNode) => {
      const n = byId.get(nn.id);
      if (!n) return null;
      return (
        <div className="space-y-1">
          <p className={cn("font-semibold text-fg", n.kind === "hla" && "allele")}>{n.label}</p>
          {n.gloss ? <p className="text-fg-muted">≈ {n.gloss}</p> : null}
          <p className="text-fg-subtle">{kindText(n)}</p>
          <p className="tabular text-fg-muted">
            {n.degree} partenaire{n.degree > 1 ? "s" : ""} sur la carte
          </p>
        </div>
      );
    },
    [byId],
  );

  const selectedNode = selected ? byId.get(selected) : undefined;
  const partners = useMemo(() => {
    if (!selectedNode) return [];
    return edges
      .filter((e) => e.hla === selectedNode.id || e.complication === selectedNode.id)
      .map((e) => ({
        node: byId.get(e.hla === selectedNode.id ? e.complication : e.hla)!,
        weight: e.weight,
      }))
      .sort((a, b) => b.weight - a.weight || a.node.label.localeCompare(b.node.label));
  }, [selectedNode, edges, byId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-xs">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
          <span className="sr-only">Rechercher un libellé sur la carte</span>
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : DR15, CMV, rejet…"
            className="h-8 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-8 text-sm text-fg shadow-xs placeholder:text-fg-faint focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 text-fg-subtle hover:text-fg"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Liens</span>
          <SegmentedControl
            ariaLabel="Poids minimal des liens"
            options={[
              { value: 1 as const, label: "Tous", count: map.edges.length },
              {
                value: 2 as const,
                label: "≥ 2 PMID",
                count: map.edges.filter((e) => e.weight >= 2).length,
              },
            ]}
            value={minWeight}
            onChange={(v) => setMinWeight(v)}
          />
        </div>
        <p className="tabular text-xs text-fg-subtle sm:ml-auto" aria-live="polite">
          {matches
            ? `${matches.length} libellé${matches.length > 1 ? "s" : ""} trouvé${matches.length > 1 ? "s" : ""}`
            : `${netNodes.length} nœuds · ${netEdges.length} liens`}
        </p>
      </div>

      {matches && matches.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Libellés trouvés">
          {matches.slice(0, 16).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setSelected(n.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-xs ring-1 ring-inset ring-line-strong hover:bg-surface-muted",
                  n.kind === "hla" && "allele",
                  selected === n.id && "ring-2 ring-primary",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2", n.kind === "hla" ? "rounded-full" : "rounded-[2px]")}
                  style={{ background: legacyColor(n) }}
                />
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NetworkView
          nodes={netNodes}
          edges={netEdges}
          selectedId={selected && visibleIds.has(selected) ? selected : null}
          onSelect={setSelected}
          matchedIds={matchedIds}
          renderTooltip={renderTooltip}
          fitKey={String(minWeight)}
          curvature={0.12}
          ariaLabel="Carte v1 : réseau des co-occurrences entre libellés HLA et complications de l'étude antérieure. Le tableau des paires plus bas en donne une lecture équivalente."
          className="h-[60vh] min-h-[380px] sm:h-[600px]"
          hint="Molette ou pincement : zoom · glisser : déplacer · clic : détail"
        />

        <aside
          aria-label="Détail du libellé sélectionné"
          className="min-w-0 self-start rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          {selectedNode ? (
            <>
              <p className="eyebrow">Libellé sélectionné</p>
              <h2
                className={cn(
                  "mt-1 break-words text-lg font-semibold text-fg",
                  selectedNode.kind === "hla" ? "allele" : "font-serif",
                )}
              >
                {selectedNode.label}
              </h2>
              {selectedNode.gloss ? (
                <p className="text-sm text-fg-muted">≈ {selectedNode.gloss} (traduction indicative)</p>
              ) : null}
              <p className="mt-1 text-xs text-fg-subtle">{kindText(selectedNode)}</p>
              {selectedNode.serological && (
                <p className="mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-2xs leading-relaxed text-warn-soft-fg">
                  Notation sérologique de l&apos;étude d&apos;origine, non
                  normalisée vers la nomenclature allélique actuelle.
                </p>
              )}
              <p className="eyebrow mt-4">
                Partenaires ({partners.length})
              </p>
              <ul className="mt-2 divide-y divide-line">
                {partners.map(({ node, weight }) => (
                  <li key={node.id} className="flex items-center gap-2 py-1.5 text-xs">
                    <span
                      aria-hidden="true"
                      className={cn("h-2.5 w-2.5 shrink-0", node.kind === "hla" ? "rounded-full" : "rounded-[3px]")}
                      style={{ background: legacyColor(node) }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelected(node.id)}
                      className={cn(
                        "min-w-0 flex-1 truncate text-left text-fg hover:text-primary hover:underline",
                        node.kind === "hla" && "allele",
                      )}
                    >
                      {node.label}
                    </button>
                    <span className="tabular shrink-0 text-fg-subtle">
                      {weight} PMID
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="eyebrow">Mode d&apos;emploi</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Cliquez un nœud pour lister ses partenaires et le nombre de
                PMID qui les citent ensemble. La recherche accepte les
                libellés d&apos;origine (en anglais) et leur traduction
                indicative.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
                Les positions reprennent la disposition Gephi de l&apos;étude
                d&apos;origine, desserrées pour éviter les chevauchements.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
