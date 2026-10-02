/**
 * Mise en forme du voisinage pour l'affichage : filtres du lecteur, tri des
 * voisins. Module PUR (teste dans `src/__tests__/graph-view.test.ts`).
 *
 * Les filtres de l'explorateur sont CLIENT : ils retirent des elements de la
 * VUE, jamais du corpus, et l'interface dit toujours ce qui est retire. La
 * disposition est calculee sur le voisinage COMPLET, pour qu'un filtre ne
 * fasse pas sauter les noeuds restants d'un endroit a l'autre.
 */

import type { GraphEdge, GraphNode } from "./queries";
import type { SignalLevel } from "./types";
import { CATEGORIES } from "./labels";
import { SIGNAL_READING_ORDER } from "./viz-encoding";

export interface GraphLike {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FilteredGraph extends GraphLike {
  hiddenNodes: number;
  hiddenEdges: number;
}

/**
 * Applique les filtres de niveau de signal et de categorie clinique.
 *
 *  - une arete est visible si son niveau est coche ET si son extremite
 *    complication appartient a une categorie cochee (une categorie inconnue
 *    du referentiel n'est jamais filtree : on ne masque pas ce qu'on ne sait
 *    pas nommer) ;
 *  - un noeud est visible s'il porte au moins une arete visible ; le centre
 *    l'est toujours.
 */
export function filterGraph(
  graph: GraphLike,
  levels: ReadonlySet<SignalLevel>,
  categories: ReadonlySet<string>,
): FilteredGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const known = new Set<string>(CATEGORIES);

  const categoryOk = (node: GraphNode | undefined): boolean => {
    if (!node || node.type !== "outcome") return true;
    if (node.distance === 0) return true;
    const cat = node.category ?? "";
    return !known.has(cat) || categories.has(cat);
  };

  const edges = graph.edges.filter(
    (e) =>
      levels.has(e.signalLevel) &&
      categoryOk(byId.get(e.source)) &&
      categoryOk(byId.get(e.target)),
  );

  const kept = new Set<string>();
  for (const e of edges) {
    kept.add(e.source);
    kept.add(e.target);
  }
  const nodes = graph.nodes.filter((n) => n.distance === 0 || kept.has(n.id));

  return {
    nodes,
    edges,
    hiddenNodes: graph.nodes.length - nodes.length,
    hiddenEdges: graph.edges.length - edges.length,
  };
}

/** Nombre d'aretes par niveau de signal. */
export function countByLevel(edges: GraphEdge[]): Record<SignalLevel, number> {
  const out: Record<SignalLevel, number> = {
    inverse: 0,
    strong: 0,
    clear: 0,
    moderate: 0,
    weak: 0,
  };
  for (const e of edges) out[e.signalLevel] += 1;
  return out;
}

export interface NeighbourRow {
  node: GraphNode;
  edge: GraphEdge;
}

/**
 * Voisins d'un noeud dans la vue, dans l'ordre de lecture du projet : signal
 * le plus marque d'abord (inverse en tete), puis effectif d'articles
 * decroissant, puis libelle.
 */
export function neighboursOf(
  id: string,
  graph: GraphLike,
): NeighbourRow[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const rows: NeighbourRow[] = [];
  for (const edge of graph.edges) {
    const otherId =
      edge.source === id ? edge.target : edge.target === id ? edge.source : null;
    if (otherId === null) continue;
    const node = byId.get(otherId);
    if (node) rows.push({ node, edge });
  }
  return rows.sort(
    (a, b) =>
      SIGNAL_READING_ORDER.indexOf(a.edge.signalLevel) -
        SIGNAL_READING_ORDER.indexOf(b.edge.signalLevel) ||
      b.edge.nCooccurrence - a.edge.nCooccurrence ||
      a.node.label.localeCompare(b.node.label, "fr", { numeric: true }),
  );
}

/** Aretes triees pour la vue en liste (meme ordre de lecture). */
export function sortEdgesForList(edges: GraphEdge[]): GraphEdge[] {
  return [...edges].sort(
    (a, b) =>
      SIGNAL_READING_ORDER.indexOf(a.signalLevel) -
        SIGNAL_READING_ORDER.indexOf(b.signalLevel) ||
      b.nCooccurrence - a.nCooccurrence ||
      a.id.localeCompare(b.id),
  );
}
