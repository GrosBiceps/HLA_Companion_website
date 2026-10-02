/**
 * Calcul de disposition des reseaux (explorateur de graphe, carte v1).
 *
 * Module PUR (aucun DOM) : il tourne sous Vitest comme dans le navigateur,
 * et le meme voisinage produit toujours la meme image — d3-force tire son
 * « hasard » d'un generateur congruentiel a graine fixe, et les positions de
 * depart sont calculees de facon deterministe.
 *
 * ── DISPOSITION DU VOISINAGE : « RADIALE ORDONNEE + FORCES » ─────────────
 * Le graphe est biparti (allele ↔ complication) et centre sur un noeud. On
 * combine deux idees :
 *
 *  1. une ossature radiale : la distance au centre (nombre de sauts) reste
 *     lisible d'un coup d'oeil, ce qui est la question d'une navigation « de
 *     proche en proche » ;
 *  2. un ordre angulaire SIGNIFIANT plutot qu'arbitraire : les complications
 *     sont regroupees en secteurs par categorie clinique, les alleles par
 *     classe puis locus (au premier saut), et les noeuds plus lointains se
 *     placent pres des noeuds auxquels les relient les signaux les plus
 *     marques (moyenne circulaire ponderee).
 *
 * Une simulation de forces (d3-force) affine ensuite : collisions resolues,
 * et les noeuds portant un signal marque vers le centre sont TIRES VERS
 * L'INTERIEUR de leur anneau. La proximite au centre encode donc la force du
 * signal — en plus de l'epaisseur et de la couleur du lien —, ce qui fait
 * ressortir d'emblee les quelques co-mentions marquees parmi les dizaines de
 * co-mentions faibles.
 */

import { LOCUS_ORDER as LOCI_ORDER } from "./loci";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { CATEGORIES } from "./labels";
import type { SignalLevel } from "./types";

export interface Point {
  x: number;
  y: number;
}

/** Ce dont la disposition a besoin d'un noeud (sous-ensemble de GraphNode). */
export interface LayoutNode {
  id: string;
  type: "hla" | "outcome";
  label: string;
  category: string | null;
  distance: number;
}

/** Ce dont la disposition a besoin d'une arete (sous-ensemble de GraphEdge). */
export interface LayoutEdge {
  source: string;
  target: string;
  signalLevel: SignalLevel;
}

/**
 * Attraction par niveau de signal (0 = aucune). Qualitatif : sert a placer,
 * jamais a afficher.
 */
export const SIGNAL_PULL: Record<SignalLevel, number> = {
  strong: 1,
  inverse: 0.75,
  clear: 0.75,
  moderate: 0.45,
  weak: 0,
};

/** Poids d'un voisin dans le calcul de l'angle d'ancrage. */
const ANCHOR_WEIGHT: Record<SignalLevel, number> = {
  strong: 6,
  inverse: 4,
  clear: 4,
  moderate: 2,
  weak: 0.25,
};

const LOCUS_ORDER: readonly string[] = LOCI_ORDER;

/**
 * Rayon d'un noeud selon son effectif de mentions : aire ~ effectif
 * (racine carree), bornee pour que les petits restent cliquables et les
 * gros ne masquent pas leurs voisins.
 */
export function mentionRadius(
  nMentions: number,
  maxMentions: number,
  min = 5,
  max = 17,
): number {
  if (!(maxMentions > 0) || !(nMentions > 0)) return min;
  const t = Math.sqrt(Math.min(nMentions, maxMentions) / maxMentions);
  return min + (max - min) * t;
}

/** Locus d'une cle HLA (« HLA-DQB1*02:01 » → « DQB1 »). */
export function locusOf(hla: string): string {
  return hla.replace(/^HLA-/, "").split(/[*\s]/)[0] ?? "";
}

/** Rang d'ordre d'un noeud au premier anneau : groupe puis libelle. */
function groupKey(node: LayoutNode): number {
  if (node.type === "outcome") {
    const i = (CATEGORIES as readonly string[]).indexOf(node.category ?? "");
    return i === -1 ? CATEGORIES.length : i;
  }
  const i = LOCUS_ORDER.indexOf(locusOf(node.id));
  return i === -1 ? LOCUS_ORDER.length : i;
}

function compareLabel(a: LayoutNode, b: LayoutNode): number {
  return a.label.localeCompare(b.label, "fr", { numeric: true });
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  targetR: number;
}

/**
 * Positions du voisinage, centre en (0, 0). `radiusOf` donne le rayon visuel
 * de chaque noeud (pour les collisions).
 */
export function layoutNeighborhood(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  radiusOf: (node: LayoutNode) => number = () => 8,
): Map<string, Point> {
  const out = new Map<string, Point>();
  if (nodes.length === 0) return out;

  const center = nodes.find((n) => n.distance === 0) ?? nodes[0];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Adjacence + meilleur niveau vers le centre.
  const adjacency = new Map<string, { other: string; level: SignalLevel }[]>();
  for (const e of edges) {
    for (const [a, b] of [
      [e.source, e.target],
      [e.target, e.source],
    ]) {
      const list = adjacency.get(a);
      const item = { other: b, level: e.signalLevel };
      if (list) list.push(item);
      else adjacency.set(a, [item]);
    }
  }

  const rings = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    if (n === center) continue;
    const d = Math.max(1, n.distance);
    const list = rings.get(d);
    if (list) list.push(n);
    else rings.set(d, [n]);
  }

  const seeds = new Map<string, { x: number; y: number; targetR: number }>();
  seeds.set(center.id, { x: 0, y: 0, targetR: 0 });
  const angleOf = new Map<string, number>();

  const SPACING = 24;
  let previousR = 0;

  for (const d of [...rings.keys()].sort((a, b) => a - b)) {
    const ring = rings.get(d)!;

    // ── Ordre angulaire ──
    let ordered: (LayoutNode | null)[];
    if (d === 1) {
      const sorted = [...ring].sort(
        (a, b) => groupKey(a) - groupKey(b) || compareLabel(a, b),
      );
      // Une case vide entre deux groupes : les secteurs se lisent.
      ordered = [];
      sorted.forEach((n, i) => {
        if (i > 0 && groupKey(sorted[i - 1]) !== groupKey(n)) ordered.push(null);
        ordered.push(n);
      });
      if (ordered.length > sorted.length) ordered.push(null);
    } else {
      // Angle d'ancrage : moyenne circulaire des voisins deja places,
      // ponderee par le signal. Les signaux marques decident seuls ; les
      // liens faibles (omnipresents) ne servent qu'a departager un noeud qui
      // n'en porte aucun — sinon ils tireraient tout vers le meme point.
      const anchor = new Map<string, number>();
      for (const n of ring) {
        let raw = Math.PI;
        for (const marked of [true, false]) {
          let sx = 0;
          let sy = 0;
          for (const { other, level } of adjacency.get(n.id) ?? []) {
            if (marked === (level === "weak")) continue;
            const a = angleOf.get(other);
            if (a === undefined) continue;
            sx += Math.cos(a) * ANCHOR_WEIGHT[level];
            sy += Math.sin(a) * ANCHOR_WEIGHT[level];
          }
          if (sx !== 0 || sy !== 0) {
            // Angle mesure depuis le haut, comme le placement.
            raw = Math.atan2(sy, sx) + Math.PI / 2;
            break;
          }
        }
        anchor.set(n.id, ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      }
      ordered = [...ring].sort(
        (a, b) =>
          anchor.get(a.id)! - anchor.get(b.id)! ||
          groupKey(a) - groupKey(b) ||
          compareLabel(a, b),
      );
    }

    const slots = Math.max(ordered.length, 1);
    const minR = d === 1 ? (rings.size > 1 ? 210 : 170) : previousR + 170;
    const R = Math.max(minR, (slots * SPACING) / (2 * Math.PI));
    previousR = R;

    ordered.forEach((n, i) => {
      if (!n) return;
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / slots;
      angleOf.set(n.id, angle);

      // Attraction vers l'interieur selon le meilleur signal vers un noeud
      // plus proche du centre.
      let pull = 0;
      for (const { other, level } of adjacency.get(n.id) ?? []) {
        const o = byId.get(other);
        if (o && o.distance < n.distance) pull = Math.max(pull, SIGNAL_PULL[level]);
      }
      const targetR = R * (1 - (d === 1 ? 0.34 : 0.14) * pull);
      seeds.set(n.id, {
        x: Math.cos(angle) * targetR,
        y: Math.sin(angle) * targetR,
        targetR,
      });
    });
  }

  const simNodes: SimNode[] = nodes.map((n) => {
    const s = seeds.get(n.id)!;
    const node: SimNode = {
      id: n.id,
      x: s.x,
      y: s.y,
      r: radiusOf(n),
      targetR: s.targetR,
    };
    if (n === center) {
      node.fx = 0;
      node.fy = 0;
    }
    return node;
  });

  type PullLink = SimulationLinkDatum<SimNode> & { pull: number };
  const links: PullLink[] = edges
    .filter(
      (e) =>
        SIGNAL_PULL[e.signalLevel] > 0 && byId.has(e.source) && byId.has(e.target),
    )
    .map((e) => ({
      source: e.source,
      target: e.target,
      pull: SIGNAL_PULL[e.signalLevel],
    }));

  const sim = forceSimulation<SimNode>(simNodes)
    .force(
      "radial",
      forceRadial<SimNode>((n) => n.targetR, 0, 0).strength(0.85),
    )
    .force(
      "collide",
      forceCollide<SimNode>((n) => n.r + 5)
        .strength(1)
        .iterations(2),
    )
    .force(
      "link",
      forceLink<SimNode, PullLink>(links)
        .id((n) => n.id)
        .strength((l) => 0.03 * l.pull),
    )
    .force("charge", forceManyBody<SimNode>().strength(-12).distanceMax(120))
    .stop();

  for (let i = 0; i < 240; i++) sim.tick();

  for (const n of simNodes) {
    out.set(n.id, { x: round(n.x ?? 0), y: round(n.y ?? 0) });
  }
  return out;
}

/**
 * Desserre une disposition existante (positions Gephi de la carte v1) : les
 * noeuds restent ancres pres de leur position d'origine, mais ne se
 * chevauchent plus. La topologie de la carte d'origine est conservee.
 */
export function relaxPositions(
  points: { id: string; x: number; y: number; r: number }[],
  { padding = 4, iterations = 160 } = {},
): Map<string, Point> {
  interface RelaxNode extends SimulationNodeDatum {
    id: string;
    r: number;
    ox: number;
    oy: number;
  }
  const simNodes: RelaxNode[] = points.map((p) => ({
    id: p.id,
    r: p.r,
    x: p.x,
    y: p.y,
    ox: p.x,
    oy: p.y,
  }));
  const sim = forceSimulation<RelaxNode>(simNodes)
    .force("x", forceX<RelaxNode>((n) => n.ox).strength(0.25))
    .force("y", forceY<RelaxNode>((n) => n.oy).strength(0.25))
    .force(
      "collide",
      forceCollide<RelaxNode>((n) => n.r + padding)
        .strength(0.9)
        .iterations(3),
    )
    .stop();
  for (let i = 0; i < iterations; i++) sim.tick();
  return new Map(
    simNodes.map((n) => [n.id, { x: round(n.x ?? 0), y: round(n.y ?? 0) }]),
  );
}

/**
 * Compression radiale autour du barycentre : la distance au centre devient
 * `D * (d / D) ** gamma` (gamma < 1). Les angles — donc la topologie lue
 * dans Gephi — sont conserves, mais quelques noeuds excentres (« sepsis »,
 * « EBV » dans la carte v1) n'ecrasent plus le coeur du reseau quand la vue
 * se cadre sur l'ensemble.
 */
export function compressRadially<T extends { x: number; y: number }>(
  points: T[],
  gamma = 0.6,
): T[] {
  if (points.length === 0) return points;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const D = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy)), 1e-9);
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d === 0) return { ...p };
    const k = (D * (d / D) ** gamma) / d;
    return { ...p, x: cx + dx * k, y: cy + dy * k };
  });
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
