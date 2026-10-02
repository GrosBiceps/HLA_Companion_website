"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganSelection } from "@/components/organ/useOrganSelection";
import { ORGAN_PARAM, organSlug } from "@/lib/organ";
import {
  ArrowUpRight,
  Crosshair,
  List,
  Network,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { CATEGORIES, SIGNAL_LABELS, type Category } from "@/lib/labels";
import {
  categoryColor,
  categoryDisplay,
  CATEGORY_FALLBACK,
  HLA_CLASS_COLORS,
  hlaClassFromKey,
  SIGNAL_COLORS,
} from "@/lib/theme";
import {
  articlesLabel,
  EDGE_ORDER,
  EDGE_WIDTH,
  edgeOpacity,
  hlaNodeColor,
  NEGATED_DASH,
  SIGNAL_READING_ORDER,
} from "@/lib/viz-encoding";
import { layoutNeighborhood, mentionRadius } from "@/lib/network-layout";
import {
  countByLevel,
  filterGraph,
  neighboursOf,
  sortEdgesForList,
} from "@/lib/graph-view";
import { entityHref, graphHref } from "@/lib/graph-url";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Callout, Skeleton } from "@/components/ui/Feedback";
import { CategoryBadge, HlaClassBadge, Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { SignalGlyph, SignalIndicator } from "@/components/SignalIndicator";
import { NetworkView, type NetEdge, type NetNode } from "@/components/charts/NetworkView";
import { FilterChips } from "@/components/charts/FilterChips";
import {
  EdgeSwatch,
  Legend,
  LegendGroup,
  LegendItem,
  NodeSwatch,
} from "@/components/charts/Legend";
import { SignalSwatch } from "@/components/charts/SignalSwatch";
import { cn } from "@/lib/cn";
import type { SignalLevel } from "@/lib/types";
import type { GraphEdge, GraphNode, Neighborhood } from "@/lib/queries";

/**
 * Explorateur de graphe — Client Component (monte en `ssr: false` par
 * `GraphExplorerClient`).
 *
 * ⚠ N'importe NI `db.ts` NI l'execution de `queries.ts` : seuls les TYPES
 * viennent de `queries.ts` (effaces a la compilation). Les donnees arrivent
 * par `/api/graph`.
 *
 * ── RENDU ─────────────────────────────────────────────────────────────────
 * SVG + d3-force (disposition) + d3-zoom (zoom / deplacement), via la vue
 * generique `NetworkView`. Choix justifie dans docs/VISUALISATIONS.md : au
 * plafond de 150 noeuds, le SVG reste fluide, garde des etiquettes nettes,
 * suit le theme par variables CSS et reste accessible au clavier — ce que
 * WebGL (Sigma.js) n'apporterait qu'au prix d'un moteur plus lourd.
 *
 * ── INTERACTION ───────────────────────────────────────────────────────────
 *  - survol : le noeud, ses voisins et ses liens restent nets ;
 *  - clic : selection → panneau de detail (voisins, lien vers la fiche) ;
 *  - second clic sur le noeud selectionne, double-clic ou Entree :
 *    RECENTRAGE (`?center=` dans l'URL, round-trip garanti par `graphHref`) ;
 *  - filtres de niveau de signal et de categorie : retirent de la VUE, et
 *    l'interface le dit ;
 *  - vue « Liste » : alternative accessible, meme contenu, meme filtres.
 *
 * Aucune metrique (NPMI, FDR, odds ratio) n'entre ici : infobulles et
 * panneau parlent en vocabulaire de signal (`SIGNAL_DISPLAY`) et en
 * effectifs d'articles.
 */

export interface GraphExplorerProps {
  center: string;
  depth: number;
  minSignal?: SignalLevel;
}

const ALL_LEVELS = new Set<SignalLevel>(SIGNAL_READING_ORDER);
const ALL_CATEGORIES = new Set<Category>(CATEGORIES);
const LIST_PAGE = 60;

function nodeColor(node: GraphNode): string {
  return node.type === "outcome"
    ? categoryColor(node.category).css
    : hlaNodeColor(node.id).css;
}

function kindLabel(node: GraphNode): string {
  if (node.type === "outcome") {
    return `Complication · ${node.category ? categoryDisplay(node.category) : "catégorie non précisée"}`;
  }
  const cls = hlaClassFromKey(node.id);
  return cls ? `Allèle HLA · classe ${cls}` : "Entité HLA";
}

export default function GraphExplorer({
  center,
  depth,
  minSignal,
}: GraphExplorerProps) {
  const router = useRouter();
  // Strate d'organe : lue dans l'URL (`?organe=`), comme sur toutes les pages.
  const organ = useOrganSelection();
  const [graph, setGraph] = useState<Neighborhood | null>(null);
  const [pending, setPending] = useState(true);
  /**
   * Etat d'erreur DISTINCT du graphe vide. Confondre les deux ferait dire au
   * site « ce centre n'a aucun voisin » alors qu'il vient d'echouer a
   * consulter le corpus et n'en sait rien.
   */
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [levels, setLevels] = useState<Set<SignalLevel>>(() => new Set(ALL_LEVELS));
  const [categories, setCategories] = useState<Set<Category>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [view, setView] = useState<"graph" | "list">("graph");
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  /** Filtres replies par defaut sous `lg` (toujours visibles au-dela). */
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setFailed(false);
    setSelected(null);
    setListLimit(LIST_PAGE);

    const params = new URLSearchParams({ center, depth: String(depth) });
    if (minSignal) params.set("minSignal", minSignal);
    const slug = organSlug(organ);
    if (slug) params.set(ORGAN_PARAM, slug);

    fetch(`/api/graph?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { graph: Neighborhood }) => {
        if (cancelled) return;
        setGraph(data.graph);
        setPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [center, depth, minSignal, organ]);

  /** Recentrage : `graphHref` encode la cle (`*`, `:`) sans perte. */
  const recenter = useCallback(
    (id: string) => {
      router.push(graphHref({ center: id, depth, minSignal, organ }), { scroll: false });
    },
    [router, depth, minSignal, organ],
  );

  // ── Disposition (sur le voisinage COMPLET : stable sous filtre) ──
  const maxMentions = useMemo(
    () => Math.max(1, ...(graph?.nodes ?? []).map((n) => n.nMentions)),
    [graph],
  );
  const radiusOf = useCallback(
    (n: { distance: number; nMentions?: number }) =>
      n.distance === 0 ? 17 : mentionRadius(n.nMentions ?? 0, maxMentions, 4.5, 14),
    [maxMentions],
  );
  const positions = useMemo(
    () =>
      graph
        ? layoutNeighborhood(graph.nodes, graph.edges, (n) =>
            radiusOf(n as GraphNode),
          )
        : new Map<string, { x: number; y: number }>(),
    [graph, radiusOf],
  );

  // ── Filtres ──
  const visible = useMemo(
    () =>
      graph
        ? filterGraph(graph, levels, categories)
        : { nodes: [], edges: [], hiddenNodes: 0, hiddenEdges: 0 },
    [graph, levels, categories],
  );
  const filtersActive =
    levels.size < ALL_LEVELS.size || categories.size < ALL_CATEGORIES.size;

  const levelCounts = useMemo(() => countByLevel(graph?.edges ?? []), [graph]);
  const categoryCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const n of graph?.nodes ?? []) {
      if (n.type === "outcome" && n.distance > 0 && n.category) {
        out.set(n.category, (out.get(n.category) ?? 0) + 1);
      }
    }
    return out;
  }, [graph]);

  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph],
  );

  // Une selection masquee par un filtre retombe sur le centre.
  const visibleIds = useMemo(
    () => new Set(visible.nodes.map((n) => n.id)),
    [visible],
  );
  const selectedVisible = selected && visibleIds.has(selected) ? selected : null;

  // ── Noeuds et liens dessines ──
  const netNodes: NetNode[] = useMemo(() => {
    const bestRank = new Map<string, number>();
    for (const e of visible.edges) {
      const r = EDGE_ORDER[e.signalLevel];
      for (const end of [e.source, e.target]) {
        bestRank.set(end, Math.max(bestRank.get(end) ?? 0, r));
      }
    }
    return visible.nodes.map((n) => {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      const isCenter = n.distance === 0;
      return {
        id: n.id,
        label: n.label,
        x: p.x,
        y: p.y,
        r: radiusOf(n),
        fill: nodeColor(n),
        shape: n.type === "hla" ? "circle" : "square",
        mono: n.type === "hla",
        emphasis: isCenter,
        priority:
          (isCenter ? 1000 : 0) +
          (n.type === "outcome" ? 120 : 0) +
          (bestRank.get(n.id) ?? 0) * 40 +
          (n.distance === 1 ? 30 : 0) +
          Math.sqrt(n.nMentions),
        ariaLabel: `${n.label} — ${kindLabel(n)}${isCenter ? " (centre du graphe)" : ""}`,
      };
    });
  }, [visible, positions, radiusOf]);

  const netEdges: NetEdge[] = useMemo(() => {
    const total = visible.edges.length;
    const centerId = graph?.center?.id;
    return visible.edges.map((e) => {
      // Au-dela d'un saut, les liens qui ne touchent pas le centre sont du
      // CONTEXTE : plus discrets, ils restent visibles et le survol d'un
      // noeud les fait ressortir.
      const context =
        depth > 1 && e.source !== centerId && e.target !== centerId;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        stroke: SIGNAL_COLORS[e.signalLevel].css,
        width: EDGE_WIDTH[e.signalLevel] * (context ? 0.7 : 1),
        opacity: edgeOpacity(e.signalLevel, total) * (context ? 0.4 : 1),
        dash: e.majorityNegative ? NEGATED_DASH : undefined,
        order: EDGE_ORDER[e.signalLevel] + (context ? 0 : 10),
      };
    });
  }, [visible, graph, depth]);

  const renderTooltip = useCallback(
    (n: NetNode) => {
      const node = nodeById.get(n.id);
      if (!node) return null;
      const counts = countByLevel(
        visible.edges.filter((e) => e.source === n.id || e.target === n.id),
      );
      return (
        <div className="space-y-1.5">
          <p className={cn("font-semibold text-fg", node.type === "hla" && "allele")}>
            {node.label}
          </p>
          <p className="text-fg-subtle">{kindLabel(node)}</p>
          <p className="tabular text-fg-muted">
            {node.nMentions} mention{node.nMentions > 1 ? "s" : ""} dans le corpus
          </p>
          <ul className="space-y-0.5">
            {SIGNAL_READING_ORDER.filter((l) => counts[l] > 0).map((l) => (
              <li key={l} className={cn("flex items-center gap-1.5", SIGNAL_DISPLAY[l].tone)}>
                <SignalGlyph level={l} />
                <span className="tabular">{counts[l]}</span>
                {SIGNAL_DISPLAY[l].label.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="border-t border-line pt-1.5 text-2xs text-fg-subtle">
            {node.distance === 0
              ? "Centre du graphe"
              : "Clic : détail · double-clic : recentrer"}
          </p>
        </div>
      );
    },
    [nodeById, visible],
  );

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const resetFilters = () => {
    setLevels(new Set(ALL_LEVELS));
    setCategories(new Set(ALL_CATEGORIES));
  };

  const panelNode =
    (selectedVisible && nodeById.get(selectedVisible)) || graph?.center || null;
  const panelRows = useMemo(
    () => (panelNode ? neighboursOf(panelNode.id, visible) : []),
    [panelNode, visible],
  );

  const listEdges = useMemo(() => sortEdgesForList(visible.edges), [visible]);

  return (
    <div className="space-y-4">
      {/* -------- Commandes -------- */}
      <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-2.5">
            <span className="eyebrow">Profondeur</span>
            <SegmentedControl
              ariaLabel="Profondeur d'exploration (nombre de sauts)"
              options={[1, 2, 3].map((d) => ({ value: d, label: String(d) }))}
              value={depth}
              onChange={(d) =>
                router.push(graphHref({ center, depth: d, minSignal, organ }), {
                  scroll: false,
                })
              }
            />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="eyebrow">Affichage</span>
            <SegmentedControl
              ariaLabel="Mode d'affichage"
              options={[
                {
                  value: "graph" as const,
                  label: (
                    <>
                      <Network className="h-3.5 w-3.5" aria-hidden="true" /> Graphe
                    </>
                  ),
                },
                {
                  value: "list" as const,
                  label: (
                    <>
                      <List className="h-3.5 w-3.5" aria-hidden="true" /> Liste
                    </>
                  ),
                },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="graph-filters"
            className={cn(buttonClasses("secondary", "sm"), "lg:hidden")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Filtres{filtersActive ? " (actifs)" : ""}
          </button>
          {graph && (
            <p className="tabular text-xs text-fg-subtle lg:ml-auto" aria-live="polite">
              {visible.nodes.length} nœuds · {visible.edges.length} liens
              {filtersActive ? ` (sur ${graph.nodes.length} · ${graph.edges.length})` : ""}
            </p>
          )}
        </div>

        <div
          id="graph-filters"
          className={cn(
            "gap-3 border-t border-line pt-3 lg:grid lg:grid-cols-[auto_1fr] lg:items-start lg:gap-x-4",
            filtersOpen ? "grid" : "hidden",
          )}
        >
          <span className="eyebrow pt-1.5">Signal</span>
          <FilterChips
            ariaLabel="Filtrer par niveau de signal"
            options={SIGNAL_READING_ORDER.map((level) => ({
              value: level,
              label: SIGNAL_DISPLAY[level].label,
              title: SIGNAL_LABELS[level].description,
              count: levelCounts[level],
              swatch: <SignalSwatch level={level} />,
            }))}
            selected={levels}
            onToggle={(l) => setLevels((s) => toggle(s, l))}
          />
          {categoryCounts.size > 0 && (
            <>
          <span className="eyebrow pt-1.5">Catégorie</span>
          <FilterChips
            ariaLabel="Filtrer par catégorie clinique"
            options={CATEGORIES.filter((c) => categoryCounts.has(c)).map((c) => ({
              value: c,
              label: categoryDisplay(c),
              count: categoryCounts.get(c) ?? 0,
              swatch: (
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: categoryColor(c).css }}
                />
              ),
            }))}
            selected={categories}
            onToggle={(c) => setCategories((s) => toggle(s, c))}
          />
            </>
          )}
        </div>
      </div>

      {/*
        Les filtres RETIRENT des liens : on le dit, parce qu'un graphe allege
        pourrait autrement se lire comme un corpus pauvre.
      */}
      {filtersActive && graph && (
        <Callout tone="warn">
          <p>
            Filtre actif : {visible.hiddenEdges} lien
            {visible.hiddenEdges > 1 ? "s" : ""} et {visible.hiddenNodes} nœud
            {visible.hiddenNodes > 1 ? "s" : ""} sont retirés de cette vue. Ils
            restent présents dans le corpus.{" "}
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Tout réafficher
            </button>
          </p>
        </Callout>
      )}

      {minSignal && (
        <Callout tone="warn">
          Filtre d&apos;URL actif : les co-occurrences plus faibles que «{" "}
          {SIGNAL_LABELS[minSignal].label} » ont été écartées avant le
          parcours. Elles restent présentes dans le corpus.{" "}
          <Link
            href={graphHref({ center, depth, organ })}
            className="font-medium underline underline-offset-2"
          >
            Retirer ce filtre
          </Link>
        </Callout>
      )}

      {graph?.truncated && (
        <Callout tone="warn" title="Voisinage tronqué à 150 nœuds">
          <p>
            À cette profondeur, le voisinage dépasse le plafond de lisibilité.
            Les nœuds portant les signaux les plus marqués ont été conservés ;
            des nœuds au signal faible ne sont pas dessinés. Réduisez la
            profondeur pour une vue complète.
          </p>
        </Callout>
      )}

      {/* -------- Vue -------- */}
      {pending && (
        <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <Skeleton className="h-[440px] w-full sm:h-[600px]" />
          <p className="mt-3 text-center text-sm text-fg-subtle">Lecture du voisinage…</p>
        </div>
      )}

      {failed && (
        <Callout tone="danger" role="alert" title="Le corpus n'a pas pu être consulté">
          Ce n&apos;est pas un résultat : aucune conclusion n&apos;est à tirer
          de cette absence. Réessayez dans un instant.
        </Callout>
      )}

      {!pending && !failed && graph && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            {view === "graph" ? (
              <NetworkView
                nodes={netNodes}
                edges={netEdges}
                selectedId={selectedVisible}
                onSelect={setSelected}
                onActivate={(id) => {
                  if (id !== graph.center?.id) recenter(id);
                }}
                renderTooltip={renderTooltip}
                fitKey={`${center}|${depth}|${minSignal ?? ""}`}
                ariaLabel={`Graphe des co-mentions autour de ${graph.center?.label ?? center}, profondeur ${depth}. Une vue en liste équivalente est disponible.`}
                className="h-[62vh] min-h-[380px] sm:h-[620px]"
                hint="Molette ou pincement : zoom · glisser : déplacer · double-clic : recentrer"
              />
            ) : (
              <EdgeList
                edges={listEdges.slice(0, listLimit)}
                total={listEdges.length}
                nodeById={nodeById}
                depth={depth}
                centerId={graph.center?.id ?? center}
                onMore={() => setListLimit((n) => n + LIST_PAGE)}
              />
            )}
          </div>

          {panelNode && (
            <DetailPanel
              node={panelNode}
              isCenter={panelNode.id === graph.center?.id}
              rows={panelRows}
              depth={depth}
              onSelect={setSelected}
            />
          )}
        </div>
      )}

      {/* -------- Legende -------- */}
      <GraphLegend />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  isCenter,
  rows,
  depth,
  onSelect,
}: {
  node: GraphNode;
  isCenter: boolean;
  rows: { node: GraphNode; edge: GraphEdge }[];
  depth: number;
  onSelect: (id: string | null) => void;
}) {
  const organ = useOrganSelection();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [node.id]);
  const shown = expanded ? rows : rows.slice(0, 10);
  const cls = node.type === "hla" ? hlaClassFromKey(node.id) : null;

  return (
    <aside
      aria-label="Détail du nœud sélectionné"
      className="min-w-0 self-start rounded-xl border border-line bg-surface p-4 shadow-card lg:sticky lg:top-[calc(var(--header-h)+4.5rem)]"
    >
      <p className="eyebrow">{isCenter ? "Centre du graphe" : "Nœud sélectionné"}</p>
      <h2
        className={cn(
          "mt-1 break-words text-lg font-semibold leading-snug text-fg",
          node.type === "hla" ? "allele" : "font-serif",
        )}
      >
        {node.label}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {node.type === "hla" ? (
          cls ? (
            <HlaClassBadge hlaClass={cls} />
          ) : (
            <Badge>Entité HLA</Badge>
          )
        ) : (
          <CategoryBadge category={node.category ?? ""} />
        )}
        {!isCenter && (
          <Badge tone="outline" size="xs">
            {node.distance} saut{node.distance > 1 ? "s" : ""} du centre
          </Badge>
        )}
      </div>
      <p className="tabular mt-2 text-xs text-fg-subtle">
        {node.nMentions} mention{node.nMentions > 1 ? "s" : ""} dans le corpus
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!isCenter && (
          <Link
            href={graphHref({ center: node.id, depth, organ })}
            scroll={false}
            className={buttonClasses("primary", "sm")}
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            Recentrer ici
          </Link>
        )}
        <Link href={entityHref(node.type, node.id, organ)} className={buttonClasses("secondary", "sm")}>
          Ouvrir la fiche
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="eyebrow">
          Co-mentions dans cette vue{" "}
          <span className="tabular normal-case tracking-normal">({rows.length})</span>
        </p>
        {rows.length === 0 ? (
          <p className="mt-2 text-xs text-fg-subtle">
            Aucun lien visible avec les filtres actuels.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {shown.map(({ node: other, edge }) => (
              <li key={edge.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 w-2.5 shrink-0",
                    other.type === "hla" ? "rounded-full" : "rounded-[3px]",
                  )}
                  style={{ background: nodeColor(other) }}
                />
                <button
                  type="button"
                  onClick={() => onSelect(other.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-fg hover:text-primary hover:underline",
                    other.type === "hla" && "allele",
                  )}
                  title={other.label}
                >
                  {other.label}
                </button>
                <span
                  className={cn("inline-flex shrink-0 items-center gap-1", SIGNAL_DISPLAY[edge.signalLevel].tone)}
                  title={SIGNAL_DISPLAY[edge.signalLevel].label}
                >
                  <SignalGlyph level={edge.signalLevel} />
                  <span className="sr-only">{SIGNAL_DISPLAY[edge.signalLevel].label}, </span>
                </span>
                <span className="tabular w-[4.5rem] shrink-0 text-right text-fg-subtle">
                  {articlesLabel(edge.nCooccurrence)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 10 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "Réduire" : `Afficher les ${rows.length} co-mentions`}
          </button>
        )}
      </div>

      <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-2xs leading-relaxed text-fg-subtle">
        Un lien signale des articles où les deux termes apparaissent ensemble.
        Ce n&apos;est pas une association clinique : relisez les phrases
        sources depuis la fiche.
      </p>
    </aside>
  );
}

function EdgeList({
  edges,
  total,
  nodeById,
  depth,
  centerId,
  onMore,
}: {
  edges: GraphEdge[];
  total: number;
  nodeById: Map<string, GraphNode>;
  depth: number;
  centerId: string;
  onMore: () => void;
}) {
  const organ = useOrganSelection();
  if (total === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface p-6 text-sm text-fg-muted">
        Aucun lien visible avec les filtres actuels.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">
            Co-mentions du voisinage, de la plus marquée à la plus faible
          </caption>
          <thead className="bg-surface-muted text-2xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Allèle</th>
              <th scope="col" className="px-3 py-2 font-medium">Complication</th>
              <th scope="col" className="px-3 py-2 font-medium">Signal</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Articles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {edges.map((e) => {
              const hla = nodeById.get(e.source);
              const out = nodeById.get(e.target);
              if (!hla || !out) return null;
              return (
                <tr key={e.id} className={cn(!e.isSignificant && "text-fg-muted")}>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Link href={entityHref("hla", hla.id, organ)} className="allele link">
                        {hla.label}
                      </Link>
                      {hla.id !== centerId && (
                        <Link
                          href={graphHref({ center: hla.id, depth, organ })}
                          scroll={false}
                          className="text-fg-faint hover:text-primary"
                          aria-label={`Recentrer le graphe sur ${hla.label}`}
                          title="Recentrer le graphe"
                        >
                          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ background: categoryColor(out.category).css }}
                      />
                      <Link href={entityHref("outcome", out.id, organ)} className="link">
                        {out.label}
                      </Link>
                      {out.id !== centerId && (
                        <Link
                          href={graphHref({ center: out.id, depth, organ })}
                          scroll={false}
                          className="text-fg-faint hover:text-primary"
                          aria-label={`Recentrer le graphe sur ${out.label}`}
                          title="Recentrer le graphe"
                        >
                          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <SignalIndicator level={e.signalLevel} variant="plain" />
                    {e.majorityNegative && (
                      <span className="ml-1.5 text-2xs text-warn-soft-fg">
                        majoritairement nié
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{e.nCooccurrence}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edges.length < total && (
        <div className="border-t border-line p-3 text-center">
          <button type="button" onClick={onMore} className={buttonClasses("secondary", "sm")}>
            Afficher plus ({edges.length} sur {total})
          </button>
        </div>
      )}
    </div>
  );
}

function GraphLegend() {
  return (
    <Legend className="sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr]">
      <LegendGroup title="Allèles HLA">
        <LegendItem swatch={<NodeSwatch shape="circle" color={HLA_CLASS_COLORS.I.css} />}>
          Classe I (A, B, C)
        </LegendItem>
        <LegendItem swatch={<NodeSwatch shape="circle" color={HLA_CLASS_COLORS.II.css} />}>
          Classe II (DR, DQ, DP)
        </LegendItem>
        <LegendItem swatch={<NodeSwatch shape="circle" color={CATEGORY_FALLBACK.css} />}>
          Autre entité HLA (locus, classe, eplet…)
        </LegendItem>
        <LegendItem
          swatch={<NodeSwatch shape="circle" color={HLA_CLASS_COLORS.I.css} ring size={10} />}
        >
          Centre du graphe
        </LegendItem>
        <LegendItem
          swatch={
            <span className="inline-flex items-center gap-0.5">
              <NodeSwatch shape="circle" color="rgb(var(--fg-faint))" size={6} />
              <NodeSwatch shape="circle" color="rgb(var(--fg-faint))" size={12} />
            </span>
          }
        >
          Taille = nombre de mentions dans le corpus
        </LegendItem>
      </LegendGroup>

      <LegendGroup title="Complications (carrés)">
        {CATEGORIES.map((c) => (
          <LegendItem
            key={c}
            swatch={<NodeSwatch shape="square" color={categoryColor(c).css} size={11} />}
          >
            {categoryDisplay(c)}
          </LegendItem>
        ))}
      </LegendGroup>

      <LegendGroup title="Liens : co-mentions dans les articles">
        {SIGNAL_READING_ORDER.map((level) => (
          <LegendItem key={level} swatch={<SignalSwatch level={level} />}>
            <span className={SIGNAL_DISPLAY[level].tone}>{SIGNAL_DISPLAY[level].label}</span>
            {level === "inverse" ? " — moins de co-mentions qu'attendu" : ""}
            {level === "weak" ? " — non distinguable du hasard, estompé" : ""}
          </LegendItem>
        ))}
        <LegendItem
          swatch={<EdgeSwatch color="rgb(var(--fg-muted))" width={2} dash={NEGATED_DASH} />}
        >
          Pointillé : paire majoritairement niée dans le texte
        </LegendItem>
        <li className="pt-1 text-2xs text-fg-subtle">
          Épaisseur et couleur traduisent un niveau qualitatif, pas une mesure
          clinique. Un nœud proche du centre porte un signal plus marqué.
        </li>
      </LegendGroup>
    </Legend>
  );
}
