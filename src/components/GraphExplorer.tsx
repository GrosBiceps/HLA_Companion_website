"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_LABELS, SIGNAL_LEVELS } from "@/lib/labels";
import type { SignalLevel } from "@/lib/types";
import type { GraphEdge, GraphNode, Neighborhood } from "@/lib/queries";

/**
 * Explorateur de graphe — Client Component.
 *
 * ⚠ N'importe NI `db.ts` NI l'execution de `queries.ts` : seuls les TYPES
 * viennent de `queries.ts` (efface a la compilation, aucun module natif ne
 * suit). Les donnees arrivent par `/api/graph`.
 *
 * ── CHOIX DE RENDU : SVG, PAS SIGMA.JS ────────────────────────────────────
 * Le brief prevoyait Sigma.js. Ni `sigma` ni `graphology` ne sont installes
 * (cf. package.json : 5 dependances runtime au total). Pour un graphe dont le
 * plafond est 150 noeuds — et qui en compte ~7 a profondeur 1, ~35 a
 * profondeur 2 sur le corpus A — WebGL n'apporte rien qu'un SVG ne fasse :
 * on ajouterait ~400 ko de dependance et une surface de build pour un rendu
 * de quelques dizaines de cercles.
 *
 * Disposition retenue : DEUX ANNEAUX CONCENTRIQUES, le centre au milieu, les
 * voisins a distance 1 sur l'anneau interne, distance >= 2 sur l'externe.
 * Un layout force-directed serait plus « organique » mais non deterministe
 * (et sans bibliotheque, couteux a ecrire correctement) ; l'anneau a
 * l'avantage de rendre la DISTANCE AU CENTRE lisible d'un coup d'oeil, ce
 * qui est exactement la question posee par une navigation « de proche en
 * proche ».
 *
 * TRADEOFF ASSUME : au-dela d'une centaine de noeuds l'anneau externe devient
 * dense et les etiquettes se chevauchent. C'est acceptable ici parce que le
 * plafond de 150 est deja une garantie anti-hairball, et parce que la lecture
 * attendue est locale (on clique, on se recentre), pas panoramique. Si le
 * corpus reel imposait des voisinages denses, c'est le moment ou Sigma.js
 * deviendrait justifie.
 *
 * Le chargement reste `dynamic(..., { ssr: false })` cote page : le rendu
 * depend de dimensions et d'evenements de pointeur, et une passe serveur
 * produirait un graphe fige a re-hydrater pour rien.
 *
 * ── CONVENTIONS VISUELLES ─────────────────────────────────────────────────
 *  - noeud HLA        : CERCLE, ardoise ;
 *  - noeud complication : CARRE (losange par rotation), teinte par CATEGORIE ;
 *  - centre           : anneau d'accent, jamais coupe par le plafond ;
 *  - arete pointillee : paire MAJORITAIREMENT NEGATIVE (plus de mentions
 *                       niees que d'affirmees) — signalee, jamais masquee ;
 *  - arete pale + fine : non significatif — DE-EMPHASE, jamais masque ;
 *  - epaisseur        : force qualitative du signal, pas une metrique.
 *
 * Aucune metrique (NPMI, FDR, odds ratio) n'entre ici : les infobulles
 * parlent en vocabulaire de signal (`SIGNAL_DISPLAY`), comme partout ailleurs.
 */

const SIZE = 720;
const CENTER = SIZE / 2;
const RING_1 = 150;
const RING_2 = 268;

/** Teintes par categorie clinique — memes familles que les fiches. */
const CATEGORY_FILL: Record<string, string> = {
  Rejet: "#dc2626",
  Immunisation: "#ea580c",
  "Fonction du greffon": "#0891b2",
  Infection: "#16a34a",
  Neoplasie: "#9333ea",
  Metabolique: "#ca8a04",
  Recidive: "#db2777",
};
const CATEGORY_FALLBACK = "#64748b";

/** Epaisseur de trait par force de signal. Qualitatif, pas metrique. */
const EDGE_WIDTH: Record<SignalLevel, number> = {
  inverse: 3,
  strong: 3.5,
  clear: 2.5,
  moderate: 1.8,
  weak: 1,
};

const EDGE_STROKE: Record<SignalLevel, string> = {
  inverse: "#7c3aed",
  strong: "#075985",
  clear: "#0369a1",
  moderate: "#475569",
  weak: "#cbd5e1",
};

interface Positioned extends GraphNode {
  x: number;
  y: number;
}

/**
 * Place les noeuds en anneaux. Deterministe : le meme voisinage produit
 * toujours la meme image, ce qui permet de comparer deux captures.
 */
function layout(nodes: GraphNode[]): Map<string, Positioned> {
  const placed = new Map<string, Positioned>();
  const inner = nodes.filter((n) => n.distance === 1);
  const outer = nodes.filter((n) => n.distance >= 2);
  const center = nodes.find((n) => n.distance === 0);

  if (center) placed.set(center.id, { ...center, x: CENTER, y: CENTER });

  const ring = (list: GraphNode[], radius: number, offset: number) => {
    list.forEach((node, i) => {
      const angle = offset + (2 * Math.PI * i) / Math.max(list.length, 1);
      placed.set(node.id, {
        ...node,
        x: CENTER + radius * Math.cos(angle),
        y: CENTER + radius * Math.sin(angle),
      });
    });
  };

  ring(inner, RING_1, -Math.PI / 2);
  // Decalage d'un demi-pas sur l'anneau externe : evite d'aligner les noeuds
  // des deux anneaux sur le meme rayon, ce qui masquerait les aretes.
  ring(outer, RING_2, -Math.PI / 2 + Math.PI / Math.max(outer.length, 1));

  return placed;
}

/** Rayon du noeud : effectif de mentions, compresse pour rester lisible. */
function radiusFor(node: GraphNode): number {
  if (node.distance === 0) return 18;
  return 7 + Math.min(Math.sqrt(node.nMentions || 1), 7);
}

export interface GraphExplorerProps {
  center: string;
  depth: number;
  minSignal?: SignalLevel;
}

export default function GraphExplorer({
  center,
  depth,
  minSignal,
}: GraphExplorerProps) {
  const router = useRouter();
  const [graph, setGraph] = useState<Neighborhood | null>(null);
  const [pending, setPending] = useState(true);
  /**
   * Etat d'erreur DISTINCT du graphe vide, comme dans `SearchBar`. Confondre
   * les deux ferait dire au site « ce centre n'a aucun voisin » alors qu'il
   * vient d'echouer a consulter le corpus et n'en sait rien.
   */
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setFailed(false);

    const params = new URLSearchParams({
      center,
      depth: String(depth),
    });
    if (minSignal) params.set("minSignal", minSignal);

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
  }, [center, depth, minSignal]);

  /**
   * Recentrage. `URLSearchParams` percent-encode `*` et `:` correctement,
   * donc "HLA-DQB1*02:01" fait l'aller-retour sans perte — c'est le point
   * ou une concatenation manuelle casserait.
   */
  const navigate = useCallback(
    (next: { center?: string; depth?: number; minSignal?: string }) => {
      const params = new URLSearchParams();
      params.set("center", next.center ?? center);
      params.set("depth", String(next.depth ?? depth));
      const sig = next.minSignal !== undefined ? next.minSignal : minSignal;
      if (sig) params.set("minSignal", sig);
      router.push(`/graph?${params.toString()}`);
    },
    [router, center, depth, minSignal],
  );

  const positions = useMemo(
    () => (graph ? layout(graph.nodes) : new Map<string, Positioned>()),
    [graph],
  );

  const drawableEdges = useMemo(
    () =>
      (graph?.edges ?? []).filter(
        (e) => positions.has(e.source) && positions.has(e.target),
      ),
    [graph, positions],
  );

  const hoveredNode = hovered ? positions.get(hovered) : undefined;

  return (
    <div className="space-y-4">
      {/* -------- Controles -------- */}
      <div className="flex flex-wrap items-center gap-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Profondeur d&apos;exploration</legend>
          <span className="font-medium text-slate-700">Profondeur</span>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === depth}
              onClick={() => navigate({ depth: d })}
              className={`rounded border px-2.5 py-1 ${
                d === depth
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {d}
            </button>
          ))}
        </fieldset>

        <label className="flex items-center gap-2">
          <span className="font-medium text-slate-700">Signal minimal</span>
          <select
            value={minSignal ?? ""}
            onChange={(e) => navigate({ minSignal: e.target.value })}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="">Tout afficher (par défaut)</option>
            {SIGNAL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {SIGNAL_LABELS[level].label} et au-dessus
              </option>
            ))}
          </select>
        </label>

        {graph && (
          <p className="text-slate-600">
            {graph.nodes.length} nœuds · {drawableEdges.length} liens
          </p>
        )}
      </div>

      {/*
        Le filtre de signal RETIRE des liens : on le dit, parce qu'un graphe
        allege pourrait autrement se lire comme un corpus pauvre.
      */}
      {minSignal && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Filtre actif : les co-occurrences plus faibles que «{" "}
          {SIGNAL_LABELS[minSignal].label} » sont retirées de cette vue. Elles
          restent présentes dans le corpus.
        </p>
      )}

      {graph?.truncated && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Voisinage tronqué à 150 nœuds pour rester lisible : les
          co-occurrences au signal le plus marqué ont été conservées. Réduisez
          la profondeur pour une vue complète.
        </p>
      )}

      {/* -------- Graphe -------- */}
      <div className="relative rounded border border-slate-200 bg-white">
        {pending && (
          <p className="p-8 text-center text-slate-500">
            Lecture du voisinage…
          </p>
        )}

        {failed && (
          <p className="p-8 text-center text-red-700">
            Le corpus n&apos;a pas pu être consulté. Ce n&apos;est pas un
            résultat : réessayez.
          </p>
        )}

        {!pending && !failed && graph && (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Voisinage de ${graph.center?.label ?? center} à la profondeur ${depth}`}
          >
            {drawableEdges.map((edge) => {
              const a = positions.get(edge.source)!;
              const b = positions.get(edge.target)!;
              return (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={EDGE_STROKE[edge.signalLevel]}
                  strokeWidth={EDGE_WIDTH[edge.signalLevel]}
                  // Pointille = paire majoritairement niee dans le texte.
                  strokeDasharray={edge.majorityNegative ? "6 4" : undefined}
                  // De-emphase du non significatif : opacite, jamais masquage.
                  strokeOpacity={edge.isSignificant ? 0.85 : 0.35}
                />
              );
            })}

            {[...positions.values()].map((node) => {
              const r = radiusFor(node);
              const isCenter = node.distance === 0;
              const fill =
                node.type === "outcome"
                  ? (CATEGORY_FILL[node.category ?? ""] ?? CATEGORY_FALLBACK)
                  : "#334155";
              return (
                <g
                  key={`${node.type}:${node.id}`}
                  onClick={() => !isCenter && navigate({ center: node.id })}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={isCenter ? "" : "cursor-pointer"}
                  tabIndex={isCenter ? -1 : 0}
                  role={isCenter ? undefined : "button"}
                  aria-label={
                    isCenter ? undefined : `Recentrer sur ${node.label}`
                  }
                  onKeyDown={(e) => {
                    if (!isCenter && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      navigate({ center: node.id });
                    }
                  }}
                >
                  {node.type === "hla" ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={fill}
                      stroke={isCenter ? "#0c4a6e" : "#ffffff"}
                      strokeWidth={isCenter ? 4 : 1.5}
                      opacity={node.distance >= 2 ? 0.7 : 1}
                    />
                  ) : (
                    <rect
                      x={node.x - r}
                      y={node.y - r}
                      width={r * 2}
                      height={r * 2}
                      rx={3}
                      fill={fill}
                      stroke={isCenter ? "#0c4a6e" : "#ffffff"}
                      strokeWidth={isCenter ? 4 : 1.5}
                      opacity={node.distance >= 2 ? 0.7 : 1}
                    />
                  )}
                  {/* LIBELLE CLINIQUE, jamais la cle technique. */}
                  <text
                    x={node.x}
                    y={node.y + r + 12}
                    textAnchor="middle"
                    fontSize={isCenter ? 13 : 10}
                    fontWeight={isCenter ? 700 : 400}
                    fill="#1e293b"
                    className="pointer-events-none select-none"
                  >
                    {node.label.length > 26
                      ? `${node.label.slice(0, 25)}…`
                      : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Infobulle : vocabulaire de signal, aucune metrique. */}
        {hoveredNode && graph && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded border border-slate-300 bg-white/95 p-2 text-xs shadow">
            <p className="font-semibold text-slate-800">{hoveredNode.label}</p>
            <p className="text-slate-600">
              {hoveredNode.type === "hla"
                ? "Allèle HLA"
                : `Complication · ${hoveredNode.category ?? "—"}`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {drawableEdges
                .filter(
                  (e: GraphEdge) =>
                    e.source === hoveredNode.id || e.target === hoveredNode.id,
                )
                .slice(0, 5)
                .map((e) => (
                  <li key={e.id} className={SIGNAL_DISPLAY[e.signalLevel].tone}>
                    {SIGNAL_DISPLAY[e.signalLevel].dots}{" "}
                    {SIGNAL_DISPLAY[e.signalLevel].label}
                    {e.majorityNegative ? " · majoritairement nié" : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {/* -------- Legende -------- */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <span>● Allèle HLA</span>
        <span>■ Complication (couleur = catégorie clinique)</span>
        <span>— Co-occurrence majoritairement affirmée</span>
        <span>--- Co-occurrence majoritairement niée</span>
        <span>Trait pâle = non significatif (atténué, jamais masqué)</span>
        <span>Épaisseur = force qualitative du signal</span>
      </div>
    </div>
  );
}
