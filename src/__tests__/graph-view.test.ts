import { describe, it, expect } from "vitest";
import { getNeighborhood } from "../lib/queries";
import { countByLevel, filterGraph, neighboursOf, sortEdgesForList } from "../lib/graph-view";
import {
  compressRadially,
  layoutNeighborhood,
  mentionRadius,
  relaxPositions,
} from "../lib/network-layout";
import { wrapLabel } from "../components/charts/NetworkView";
import { CATEGORIES } from "../lib/labels";
import type { SignalLevel } from "../lib/types";

const ALL_LEVELS = new Set<SignalLevel>(["inverse", "strong", "clear", "moderate", "weak"]);
const ALL_CATS = new Set<string>(CATEGORIES);

describe("filterGraph — filtres du lecteur", () => {
  const g = getNeighborhood("HLA-DQB1*02:01", 2);

  it("sans filtre, ne retire rien", () => {
    const v = filterGraph(g, ALL_LEVELS, ALL_CATS);
    expect(v.nodes.length).toBe(g.nodes.length);
    expect(v.edges.length).toBe(g.edges.length);
    expect(v.hiddenEdges).toBe(0);
  });

  it("un filtre de niveau ne garde que ces niveaux, sans arete pendante", () => {
    const v = filterGraph(g, new Set<SignalLevel>(["strong", "inverse"]), ALL_CATS);
    expect(v.edges.length).toBeGreaterThan(0);
    for (const e of v.edges) expect(["strong", "inverse"]).toContain(e.signalLevel);
    const ids = new Set(v.nodes.map((n) => n.id));
    for (const e of v.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    // Le centre reste toujours visible.
    expect(ids.has("HLA-DQB1*02:01")).toBe(true);
    expect(v.hiddenEdges).toBe(g.edges.length - v.edges.length);
  });

  it("un filtre de categorie retire les complications decochees", () => {
    const v = filterGraph(g, ALL_LEVELS, new Set(["Rejet"]));
    const outcomes = v.nodes.filter((n) => n.type === "outcome");
    expect(outcomes.length).toBeGreaterThan(0);
    for (const n of outcomes) expect(n.category).toBe("Rejet");
  });

  it("le centre complication n'est jamais retire par son propre filtre", () => {
    const c = getNeighborhood("graft_loss", 1);
    const v = filterGraph(c, ALL_LEVELS, new Set(["Rejet"]));
    expect(v.nodes.some((n) => n.id === "graft_loss")).toBe(true);
  });

  it("neighboursOf et la liste suivent l'ordre de lecture (inverse, fort...)", () => {
    const rank = ["inverse", "strong", "clear", "moderate", "weak"];
    const rows = neighboursOf("HLA-DQB1*02:01", g);
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rank.indexOf(rows[i - 1].edge.signalLevel)).toBeLessThanOrEqual(
        rank.indexOf(rows[i].edge.signalLevel),
      );
    }
    const list = sortEdgesForList(g.edges);
    expect(list.length).toBe(g.edges.length);
    const counts = countByLevel(g.edges);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(g.edges.length);
  });
});

describe("layoutNeighborhood — disposition deterministe", () => {
  it("place chaque noeud, centre a l'origine, coordonnees finies", () => {
    for (const center of ["HLA-DQB1*02:01", "graft_loss"]) {
      for (const depth of [1, 2]) {
        const g = getNeighborhood(center, depth);
        const pos = layoutNeighborhood(g.nodes, g.edges);
        expect(pos.size).toBe(g.nodes.length);
        expect(pos.get(center)).toEqual({ x: 0, y: 0 });
        for (const p of pos.values()) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        }
      }
    }
  });

  it("produit la meme image a chaque calcul", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 2);
    const a = layoutNeighborhood(g.nodes, g.edges);
    const b = layoutNeighborhood(g.nodes, g.edges);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("les noeuds a signal fort vers le centre sont plus proches que les faibles", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    const pos = layoutNeighborhood(g.nodes, g.edges);
    const dist = (id: string) => Math.hypot(pos.get(id)!.x, pos.get(id)!.y);
    const strong = g.edges.filter((e) => e.signalLevel === "strong").map((e) => dist(e.target));
    const weak = g.edges.filter((e) => e.signalLevel === "weak").map((e) => dist(e.target));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(strong.length).toBeGreaterThan(0);
    expect(mean(strong)).toBeLessThan(mean(weak));
  });
});

describe("helpers de disposition", () => {
  it("mentionRadius est borne et monotone", () => {
    expect(mentionRadius(0, 100)).toBe(5);
    expect(mentionRadius(100, 100)).toBe(17);
    expect(mentionRadius(10, 100)).toBeLessThan(mentionRadius(50, 100));
  });

  it("compressRadially conserve les angles et rapproche les excentres", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: -100, y: 0 },
      { x: 0, y: 30 },
    ];
    const out = compressRadially(pts, 0.5);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    pts.forEach((p, i) => {
      const a0 = Math.atan2(p.y - cy, p.x - cx);
      const a1 = Math.atan2(out[i].y - cy, out[i].x - cx);
      expect(a1).toBeCloseTo(a0, 6);
    });
    // Le plus excentre garde sa distance ; les autres s'en rapprochent relativement.
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - cx, p.y - cy);
    expect(d(out[2])).toBeCloseTo(d(pts[2]), 6);
    expect(d(out[1]) / d(out[2])).toBeGreaterThan(d(pts[1]) / d(pts[2]));
  });

  it("relaxPositions supprime les chevauchements", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ id: String(i), x: i * 0.1, y: 0, r: 5 }));
    const out = relaxPositions(pts, { padding: 1 });
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < 10; j++) {
        const a = out.get(String(i))!;
        const b = out.get(String(j))!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(9);
      }
    }
  });

  it("wrapLabel coupe un libelle long en deux lignes, pas un allele", () => {
    expect(wrapLabel("Hyalinose segmentaire et focale (HSF)")).toEqual([
      "Hyalinose segmentaire",
      "et focale (HSF)",
    ]);
    expect(wrapLabel("HLA-DQB1*02:01")).toEqual(["HLA-DQB1*02:01"]);
  });
});
