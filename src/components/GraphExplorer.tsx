"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_LABELS, SIGNAL_LEVELS } from "@/lib/labels";
import {
  SIGNAL_COLORS,
  CATEGORIES,
  categoryClasses,
  categoryColor,
  categoryDisplay,
  hlaClassColor,
  hlaClassFromKey,
} from "@/lib/theme";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Callout } from "@/components/ui/Feedback";
import { SignalGlyph } from "@/components/SignalIndicator";
import { cn } from "@/lib/cn";
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

/**
 * Teintes : echelle categorielle (noeuds complication), famille indigo par
 * classe (noeuds HLA), echelle ordinale du signal (liens) — toutes issues de
 * `src/lib/theme.ts`, sous forme `rgb(var(--token))` : elles suivent donc le
 * mode sombre sans JS.
 */
/** Epaisseur de trait par force de signal. Qualitatif, pas metrique. */
const EDGE_WIDTH: Record<SignalLevel, number> = {
  inverse: 3,
  strong: 3.5,
  clear: 2.5,
  moderate: 1.8,
  weak: 1,
};

const EDGE_STROKE: Record<SignalLevel, string> = {
  inverse: SIGNAL_COLORS.inverse.css,
  strong: SIGNAL_COLORS.strong.css,
  clear: SIGNAL_COLORS.clear.css,
  moderate: SIGNAL_COLORS.moderate.css,
  weak: SIGNAL_COLORS.weak.css,
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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Profondeur</span>
          <SegmentedControl
            ariaLabel="Profondeur d'exploration"
            options={[1, 2, 3].map((d) => ({ value: d, label: String(d) }))}
            value={depth}
            onChange={(d) => navigate({ depth: d })}
          />
        </div>

        <label className="flex items-center gap-2.5">
          <span className="eyebrow">Signal minimal</span>
          <select
            value={minSignal ?? ""}
            onChange={(e) => navigate({ minSignal: e.target.value })}
            className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm text-fg shadow-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
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
          <p className="tabular ml-auto text-xs text-fg-subtle">
            {graph.nodes.length} nœuds · {drawableEdges.length} liens
          </p>
        )}
      </div>

      {/*
        Le filtre de signal RETIRE des liens : on le dit, parce qu'un graphe
        allege pourrait autrement se lire comme un corpus pauvre.
      */}
      {minSignal && (
        <Callout tone="warn">
          Filtre actif : les co-occurrences plus faibles que «{" "}
          {SIGNAL_LABELS[minSignal].label} » sont retirées de cette vue. Elles
          restent présentes dans le corpus.
        </Callout>
      )}

      {graph?.truncated && (
        <Callout tone="warn">
          Voisinage tronqué à 150 nœuds pour rester lisible : les
          co-occurrences au signal le plus marqué ont été conservées. Réduisez
          la profondeur pour une vue complète.
        </Callout>
      )}

      {/* -------- Graphe -------- */}
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-card [background-image:radial-gradient(rgb(var(--fg)/0.07)_1px,transparent_1px)] [background-size:18px_18px]">
        {pending && (
          <p className="p-10 text-center text-sm text-fg-subtle">
            Lecture du voisinage…
          </p>
        )}

        {failed && (
          <p role="alert" className="m-4 rounded-lg bg-danger-soft p-6 text-center text-sm text-danger-soft-fg">
            Le corpus n&apos;a pas pu être consulté. Ce n&apos;est pas un
            résultat : réessayez.
          </p>
        )}

        {!pending && !failed && graph && (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="mx-auto h-auto max-h-[75vh] w-full"
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
                  ? categoryColor(node.category).css
                  : hlaClassColor(hlaClassFromKey(node.id)).css;
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
                      stroke={isCenter ? "rgb(var(--fg))" : "rgb(var(--surface))"}
                      strokeWidth={isCenter ? 3.5 : 1.75}
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
                      stroke={isCenter ? "rgb(var(--fg))" : "rgb(var(--surface))"}
                      strokeWidth={isCenter ? 3.5 : 1.75}
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
                    fill="rgb(var(--fg))"
                    stroke="rgb(var(--surface))"
                    strokeWidth={3}
                    paintOrder="stroke"
                    fontFamily={node.type === "hla" ? "var(--font-mono)" : undefined}
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
          <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-lg border border-line bg-surface/95 p-3 text-xs shadow-raised backdrop-blur">
            <p className={cn("font-semibold text-fg", hoveredNode.type === "hla" && "allele")}>{hoveredNode.label}</p>
            <p className="text-fg-subtle">
              {hoveredNode.type === "hla"
                ? "Allèle HLA"
                : `Complication · ${hoveredNode.category ? categoryDisplay(hoveredNode.category) : "—"}`}
            </p>
            <ul className="mt-2 space-y-1">
              {drawableEdges
                .filter(
                  (e: GraphEdge) =>
                    e.source === hoveredNode.id || e.target === hoveredNode.id,
                )
                .slice(0, 5)
                .map((e) => (
                  <li
                    key={e.id}
                    className={cn(
                      "flex items-center gap-1.5",
                      SIGNAL_DISPLAY[e.signalLevel].tone,
                    )}
                  >
                    <SignalGlyph level={e.signalLevel} />
                    {SIGNAL_DISPLAY[e.signalLevel].label}
                    {e.majorityNegative ? " · majoritairement nié" : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {/* -------- Legende -------- */}
      <div className="grid gap-4 rounded-xl border border-line bg-surface-muted/60 p-4 text-xs text-fg-muted sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="eyebrow">Nœuds</p>
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-full bg-hla-class-1" />
            <span aria-hidden="true" className="-ml-1 h-3 w-3 rounded-full bg-hla-class-2" />
            Allèle HLA (classe I foncé, classe II clair)
          </p>
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-cat-rejet" />
            Complication (couleur = catégorie clinique)
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
            {CATEGORIES.map((category) => (
              <span key={category} className="inline-flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 rounded-[2px]", categoryClasses(category).bg)}
                />
                {categoryDisplay(category)}
              </span>
            ))}
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="eyebrow">Liens</p>
          <p>— Co-occurrence majoritairement affirmée</p>
          <p>--- Co-occurrence majoritairement niée</p>
          <p>Trait pâle = non significatif (atténué, jamais masqué)</p>
          <p>Épaisseur = force qualitative du signal</p>
        </div>
      </div>
    </div>
  );
}
