"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Vue de reseau generique — SVG + d3-zoom. Client Component.
 *
 * Partagee par l'explorateur de graphe (`/graph`) et la carte v1
 * (`/carte-v1`). Elle ne sait rien du domaine : elle recoit des noeuds deja
 * places (x, y), deja colores (valeurs `rgb(var(--token))` issues de
 * `src/lib/theme.ts`, qui suivent le mode sombre sans JS) et des liens deja
 * styles. Elle apporte l'interaction :
 *
 *  - zoom / deplacement (molette, pincement, glisser) + boutons ;
 *  - survol : le noeud et ses voisins restent nets, le reste s'estompe ;
 *  - selection (clic) et activation (double-clic, Entree, ou clic sur le
 *    noeud deja selectionne) — c'est l'appelant qui decide de ce qu'elles
 *    font (panneau de detail, recentrage) ;
 *  - etiquettes sans chevauchement : placement glouton par priorite, en
 *    coordonnees ECRAN (la densite suit le zoom) ;
 *  - clavier : chaque noeud est un bouton focalisable.
 *
 * PERFORMANCE. Le zoom applique la transformation directement au DOM
 * (`setAttribute`) : aucun rendu React par image. Seule une valeur
 * d'echelle quantifiee declenche un recalcul des etiquettes. Les liens de
 * base sont memoises ; la mise en evidence redessine seulement les liens du
 * noeud survole, dans un calque au-dessus.
 */

export interface NetNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Rayon en unites de disposition. */
  r: number;
  /** Couleur CSS (idealement `ThemeColor.css`). */
  fill: string;
  shape: "circle" | "square";
  /** Etiquette en chasse fixe (alleles). */
  mono?: boolean;
  /** Noeud central : anneau marque, etiquette en gras sous le noeud. */
  emphasis?: boolean;
  /** Contour pointille (ex. notation serologique non normalisee). */
  dashedOutline?: boolean;
  /** Priorite d'etiquetage : plus haut = etiquete en premier. */
  priority: number;
  /** Nom accessible du bouton. */
  ariaLabel: string;
}

export interface NetEdge {
  id: string;
  source: string;
  target: string;
  stroke: string;
  /** Epaisseur en pixels ecran (trait non mis a l'echelle). */
  width: number;
  opacity: number;
  dash?: string;
  /** Ordre de dessin : plus haut = au-dessus. */
  order: number;
}

export interface NetworkViewProps {
  nodes: NetNode[];
  edges: NetEdge[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onActivate?: (id: string) => void;
  /** Mise en evidence externe (recherche) : les autres noeuds s'estompent. */
  matchedIds?: ReadonlySet<string> | null;
  renderTooltip?: (node: NetNode) => ReactNode;
  ariaLabel: string;
  /** Change => recadrage automatique. */
  fitKey?: string;
  className?: string;
  /** Courbure des liens vers le centre (0 = droits). */
  curvature?: number;
  /** Indication affichee en bas a gauche. */
  hint?: ReactNode;
}

const LABEL_FONT = 11;
const LABEL_FONT_EMPHASIS = 13;
const CHAR_W = 0.6;

interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  anchor: "start" | "end" | "middle";
  font: number;
  bold: boolean;
  lines: string[];
  /** Interligne en unites de disposition. */
  lh: number;
}

/**
 * Coupe un libelle long en deux lignes, a l'espace le plus proche du
 * milieu : « Hyalinose segmentaire / et focale (HSF) » prend deux fois moins
 * de largeur, ce qui laisse plus de place au graphe lui-meme.
 */
export function wrapLabel(label: string, max = 20): string[] {
  if (label.length <= max) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) {
      best = i;
    }
  }
  if (best === -1) return [label];
  return [label.slice(0, best), label.slice(best + 1)];
}

export function NetworkView({
  nodes,
  edges,
  selectedId = null,
  onSelect,
  onActivate,
  matchedIds = null,
  renderTooltip,
  ariaLabel,
  fitKey = "",
  className,
  curvature = 0.22,
  hint,
}: NetworkViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const touchRef = useRef(false);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [k, setK] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  const incident = useMemo(() => {
    const map = new Map<string, NetEdge[]>();
    for (const e of edges) {
      for (const end of [e.source, e.target]) {
        const list = map.get(end);
        if (list) list.push(e);
        else map.set(end, [e]);
      }
    }
    return map;
  }, [edges]);

  /** Centre de gravite des noeuds : origine des courbures. */
  const bbox = useMemo(() => {
    if (nodes.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    return { minX, maxX, minY, maxY };
  }, [nodes]);
  const origin = useMemo(
    () => ({
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
    }),
    [bbox],
  );

  // ── Taille du conteneur ──
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setSize((prev) => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Zoom ──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 8])
      .on("start", () => setTip(null))
      .on("zoom", (event: { transform: ZoomTransform }) => {
        transformRef.current = event.transform;
        gRef.current?.setAttribute("transform", event.transform.toString());
        const q = Math.round(event.transform.k * 10) / 10;
        setK((prev) => (prev === q ? prev : q));
      });
    const selection = select(svg);
    selection.call(behaviour).on("dblclick.zoom", null);
    zoomRef.current = behaviour;
    return () => {
      selection.on(".zoom", null);
    };
  }, []);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const behaviour = zoomRef.current;
    if (!svg || !behaviour || size.w === 0 || size.h === 0) return;
    // Echelle la plus grande qui fait tenir noeuds ET etiquettes (dont la
    // largeur, en pixels, ne depend pas du zoom) : recherche dichotomique.
    // Sur petit ecran on accepte de couper les etiquettes du bord plutot que
    // de reduire le graphe a un timbre-poste.
    const labelRoom = size.w < 640 ? 0.12 : 1;
    const extents = (s: number) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const n of nodes) {
        const longest = Math.max(...wrapLabel(n.label).map((l) => l.length));
        const w = (longest * LABEL_FONT * CHAR_W + 10) * labelRoom;
        const sx = n.x * s;
        const sr = n.r * s;
        const right = n.x >= origin.x;
        x0 = Math.min(x0, sx - sr - (right ? 0 : w));
        x1 = Math.max(x1, sx + sr + (right ? w : 0));
        y0 = Math.min(y0, n.y * s - sr - 8);
        y1 = Math.max(y1, n.y * s + sr + (n.emphasis ? 22 : 8));
      }
      return { x0, x1, y0, y1 };
    };
    const availW = size.w - 24;
    const availH = size.h - 32;
    let lo = 0.1;
    let hi = 1.8;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const e = extents(mid);
      if (e.x1 - e.x0 <= availW && e.y1 - e.y0 <= availH) lo = mid;
      else hi = mid;
    }
    const s = lo;
    const e = extents(s);
    const t = zoomIdentity
      .translate(size.w / 2 - (e.x0 + e.x1) / 2, size.h / 2 - (e.y0 + e.y1) / 2)
      .scale(s);
    select(svg).call(behaviour.transform, t);
  }, [nodes, origin, size.w, size.h]);

  // Recadrage a chaque nouveau jeu de donnees et a chaque redimensionnement.
  useEffect(() => {
    fit();
  }, [fit, fitKey]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    const behaviour = zoomRef.current;
    if (svg && behaviour) select(svg).call(behaviour.scaleBy, factor);
  };

  // ── Mise en evidence ──
  const focus = hovered ?? selectedId;
  const focusSet = useMemo(() => {
    if (!focus || !byId.has(focus)) return null;
    const set = new Set<string>([focus]);
    for (const id of neighbours.get(focus) ?? []) set.add(id);
    return set;
  }, [focus, neighbours, byId]);

  const litSet: ReadonlySet<string> | null = focusSet ?? matchedIds;

  // ── Etiquettes sans chevauchement (coordonnees ecran) ──
  const labels = useMemo(() => {
    const forced = new Set<string>();
    if (focusSet) for (const id of focusSet) forced.add(id);
    if (matchedIds) for (const id of matchedIds) forced.add(id);
    if (selectedId) forced.add(selectedId);

    const ordered = [...nodes].sort((a, b) => {
      const fa = forced.has(a.id) || a.emphasis ? 1 : 0;
      const fb = forced.has(b.id) || b.emphasis ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.priority - a.priority;
    });

    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const out: PlacedLabel[] = [];
    const overlaps = (r: (typeof placed)[number]) =>
      placed.some(
        (p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0,
      );

    for (const n of ordered) {
      // Prioritaires (voisins, recherche) : places en premier, mais toujours
      // sans chevauchement ; seuls le noeud survole, la selection et le
      // centre s'imposent.
      const isForced = n.id === focus || n.id === selectedId || n.emphasis;
      // Hors mise en evidence, un noeud estompe ne prend pas d'etiquette.
      if (litSet && !litSet.has(n.id)) continue;
      const font = n.emphasis ? LABEL_FONT_EMPHASIS : LABEL_FONT;
      const lines = wrapLabel(n.label);
      const lh = font + 2;
      const w = Math.max(...lines.map((l) => l.length)) * font * CHAR_W + 6;
      const h = lines.length * lh + 2;
      const sx = n.x * k;
      const sy = n.y * k;
      const sr = n.r * k;
      let rect;
      let label: PlacedLabel;
      if (n.emphasis) {
        rect = { x0: sx - w / 2, x1: sx + w / 2, y0: sy + sr + 2, y1: sy + sr + 2 + h };
        label = {
          id: n.id,
          x: n.x,
          y: n.y + (sr + 3 + font * 0.85) / k,
          anchor: "middle",
          font,
          bold: true,
          lines,
          lh: lh / k,
        };
      } else {
        const right = n.x >= origin.x;
        const gap = sr + 4;
        rect = right
          ? { x0: sx + gap, x1: sx + gap + w, y0: sy - h / 2, y1: sy + h / 2 }
          : { x0: sx - gap - w, x1: sx - gap, y0: sy - h / 2, y1: sy + h / 2 };
        label = {
          id: n.id,
          x: n.x + (right ? gap : -gap) / k,
          y: n.y + (font * 0.35 - ((lines.length - 1) * lh) / 2) / k,
          anchor: right ? "start" : "end",
          font,
          bold: n.id === selectedId,
          lines,
          lh: lh / k,
        };
      }
      if (!isForced && overlaps(rect)) continue;
      placed.push(rect);
      out.push(label);
    }
    return out;
  }, [nodes, k, focus, focusSet, matchedIds, selectedId, litSet, origin]);

  // ── Liens ──
  const pathFor = useCallback(
    (e: NetEdge) => {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) return null;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const cx = mx + (origin.x - mx) * curvature;
      const cy = my + (origin.y - my) * curvature;
      return `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
    },
    [byId, origin, curvature],
  );

  const sortedEdges = useMemo(
    () => [...edges].sort((a, b) => a.order - b.order),
    [edges],
  );

  const baseEdges = useMemo(
    () =>
      sortedEdges.map((e) => {
        const d = pathFor(e);
        if (!d) return null;
        return (
          <path
            key={e.id}
            d={d}
            fill="none"
            stroke={e.stroke}
            strokeWidth={e.width}
            strokeOpacity={e.opacity}
            strokeDasharray={e.dash}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      }),
    [sortedEdges, pathFor],
  );

  const litEdges = useMemo(() => {
    if (!litSet) return null;
    const seen = new Set<string>();
    const list: NetEdge[] = [];
    const sources = focusSet && focus ? [focus] : [...litSet];
    for (const id of sources) {
      for (const e of incident.get(id) ?? []) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        list.push(e);
      }
    }
    return list.sort((a, b) => a.order - b.order);
  }, [litSet, focusSet, focus, incident]);

  // ── Infobulle ──
  const showTip = (id: string) => {
    const n = byId.get(id);
    if (!n) return;
    const [x, y] = transformRef.current.apply([n.x, n.y]);
    setTip({ id, x, y: y });
  };

  const tipNode = tip ? byId.get(tip.id) : undefined;
  const tipOnLeft = tip ? tip.x > size.w * 0.6 : false;

  const handleClick = (id: string) => {
    if (selectedId === id && onActivate) onActivate(id);
    else onSelect?.(id);
  };

  // Ordre DOM = ordre de tabulation : centre puis priorite decroissante.
  const nodesInTabOrder = useMemo(
    () =>
      [...nodes].sort(
        (a, b) =>
          Number(Boolean(b.emphasis)) - Number(Boolean(a.emphasis)) ||
          b.priority - a.priority,
      ),
    [nodes],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate overflow-hidden rounded-xl border border-line bg-surface shadow-card",
        "[background-image:radial-gradient(rgb(var(--fg)/0.06)_1px,transparent_1px)] [background-size:20px_20px]",
        className,
      )}
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        role="group"
        aria-label={ariaLabel}
        onClick={(e) => {
          if (e.target === svgRef.current) onSelect?.(null);
        }}
      >
        <g ref={gRef}>
          <g
            className="transition-opacity duration-200"
            opacity={litSet ? 0.14 : 1}
            aria-hidden="true"
          >
            {baseEdges}
          </g>
          {litEdges && (
            <g aria-hidden="true">
              {litEdges.map((e) => {
                const d = pathFor(e);
                if (!d) return null;
                return (
                  <path
                    key={e.id}
                    d={d}
                    fill="none"
                    stroke={e.stroke}
                    strokeWidth={e.width + 0.6}
                    strokeOpacity={Math.max(e.opacity, e.width <= 1 ? 0.5 : 0.9)}
                    strokeDasharray={e.dash}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          )}

          {nodesInTabOrder.map((n) => {
            const dimmed = litSet ? !litSet.has(n.id) : false;
            const selected = n.id === selectedId;
            const s = n.shape === "square" ? n.r * 0.88 : n.r;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                role="button"
                tabIndex={0}
                aria-label={n.ariaLabel}
                aria-pressed={selected}
                className="net-node cursor-pointer outline-none transition-opacity duration-200 [&:focus-visible_.net-focus]:opacity-100"
                opacity={dimmed ? 0.2 : 1}
                onPointerEnter={(ev) => {
                  // Au doigt, pas de survol : la selection (panneau) suffit,
                  // et une infobulle masquerait le graphe sur petit ecran.
                  touchRef.current = ev.pointerType === "touch";
                  if (touchRef.current) return;
                  setHovered(n.id);
                  showTip(n.id);
                }}
                onPointerLeave={() => {
                  setHovered((h) => (h === n.id ? null : h));
                  setTip((t) => (t?.id === n.id ? null : t));
                }}
                onFocus={() => {
                  if (touchRef.current) return;
                  setHovered(n.id);
                  showTip(n.id);
                }}
                onBlur={() => {
                  setHovered((h) => (h === n.id ? null : h));
                  setTip(null);
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleClick(n.id);
                }}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  onActivate?.(n.id);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    if (onActivate) onActivate(n.id);
                    else onSelect?.(n.id);
                  } else if (ev.key === " ") {
                    ev.preventDefault();
                    onSelect?.(n.id);
                  } else if (ev.key === "Escape") {
                    onSelect?.(null);
                  }
                }}
              >
                {/* Anneau de focus clavier. */}
                <circle
                  className="net-focus opacity-0"
                  r={n.r + 5}
                  fill="none"
                  stroke="rgb(var(--primary))"
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
                {(n.emphasis || selected) && (
                  <circle
                    r={n.r + (n.emphasis ? 7 : 5)}
                    fill={n.emphasis ? "rgb(var(--primary) / 0.10)" : "none"}
                    stroke={selected ? "rgb(var(--fg))" : "rgb(var(--primary) / 0.55)"}
                    strokeWidth={selected ? 2 : 1.5}
                    strokeDasharray={selected && !n.emphasis ? "3 2" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {n.shape === "circle" ? (
                  <circle
                    r={s}
                    fill={n.fill}
                    stroke={n.emphasis ? "rgb(var(--fg))" : "rgb(var(--surface))"}
                    strokeWidth={n.emphasis ? 2.5 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <rect
                    x={-s}
                    y={-s}
                    width={s * 2}
                    height={s * 2}
                    rx={s * 0.32}
                    fill={n.fill}
                    stroke={n.emphasis ? "rgb(var(--fg))" : "rgb(var(--surface))"}
                    strokeWidth={n.emphasis ? 2.5 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {n.dashedOutline && n.shape === "circle" && (
                  <circle
                    r={s + 2.5}
                    fill="none"
                    stroke={n.fill}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}

          <g className="pointer-events-none" aria-hidden="true">
            {labels.map((l) => {
              const n = byId.get(l.id)!;
              return (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor}
                  fontSize={l.font / k}
                  fontWeight={l.bold ? 650 : 450}
                  fontFamily={n.mono ? "var(--font-mono), ui-monospace, monospace" : undefined}
                  fill="rgb(var(--fg))"
                  stroke="rgb(var(--surface))"
                  strokeWidth={3.2 / k}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {l.lines.map((line, i) => (
                    <tspan key={i} x={l.x} dy={i === 0 ? 0 : l.lh}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Commandes de zoom. */}
      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg bg-surface/90 shadow-raised ring-1 ring-line backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(1.4)}
          className="flex h-8 w-8 items-center justify-center text-fg-muted hover:bg-fg/[0.06] hover:text-fg"
          aria-label="Zoomer"
          title="Zoomer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.4)}
          className="flex h-8 w-8 items-center justify-center border-t border-line text-fg-muted hover:bg-fg/[0.06] hover:text-fg"
          aria-label="Dézoomer"
          title="Dézoomer"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={fit}
          className="flex h-8 w-8 items-center justify-center border-t border-line text-fg-muted hover:bg-fg/[0.06] hover:text-fg"
          aria-label="Recadrer la vue"
          title="Recadrer la vue"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {hint ? (
        <p className="pointer-events-none absolute bottom-2 left-3 hidden text-2xs text-fg-subtle sm:block">
          {hint}
        </p>
      ) : null}

      {tip && tipNode && renderTooltip ? (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[17rem] animate-fade-in rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-raised backdrop-blur"
          style={{
            left: tipOnLeft ? undefined : Math.min(tip.x + 16, size.w - 8),
            right: tipOnLeft ? Math.max(size.w - tip.x + 16, 8) : undefined,
            top: Math.min(Math.max(tip.y - 20, 8), Math.max(size.h - 120, 8)),
          }}
        >
          {renderTooltip(tipNode)}
        </div>
      ) : null}
    </div>
  );
}
