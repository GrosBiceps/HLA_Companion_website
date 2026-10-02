import { describe, it, expect } from "vitest";
import {
  getLegacyMap,
  isSerological,
  legacyHlaClass,
  legacyStats,
  normalizeLegacyMap,
  topLegacyPairs,
} from "../lib/legacy-map";

describe("carte v1 — chargement des donnees reelles", () => {
  const map = getLegacyMap();
  const stats = legacyStats(map);

  it("contient les 80 noeuds (53 HLA, 27 complications) et 125 liens", () => {
    expect(stats.nNodes).toBe(80);
    expect(stats.nHla).toBe(53);
    expect(stats.nComplications).toBe(27);
    expect(stats.nEdges).toBe(125);
    expect(map.sourceUrl).toContain("GrosBiceps/Renal-HLA-Bibliometric");
  });

  it("est biparti : chaque lien relie un HLA a une complication", () => {
    const kind = new Map(map.nodes.map((n) => [n.id, n.kind]));
    for (const e of map.edges) {
      expect(kind.get(e.hla)).toBe("hla");
      expect(kind.get(e.complication)).toBe("complication");
      expect(e.weight).toBeGreaterThanOrEqual(1);
    }
  });

  it("garde les libelles d'origine, sans normalisation", () => {
    const labels = map.nodes.map((n) => n.label);
    expect(labels).toContain("HLA-*A23");
    expect(labels).toContain("TMA");
    expect(labels).toContain("thrombotic microangiopathy");
  });

  it("donne a chaque complication une traduction indicative", () => {
    for (const n of map.nodes.filter((n) => n.kind === "complication")) {
      expect(n.gloss, n.label).toBeTruthy();
    }
  });

  it("deduit une classe pour chaque libelle HLA", () => {
    for (const n of map.nodes.filter((n) => n.kind === "hla")) {
      expect(n.hlaClass, n.label).not.toBeNull();
    }
    expect(stats.nSerological).toBe(30);
  });

  it("degres et poids sont coherents avec les liens", () => {
    const totalDegree = map.nodes.reduce((s, n) => s + n.degree, 0);
    expect(totalDegree).toBe(2 * map.edges.length);
    const totalWeight = map.edges.reduce((s, e) => s + e.weight, 0);
    expect(map.nodes.reduce((s, n) => s + n.strength, 0)).toBe(2 * totalWeight);
  });

  it("classe les paires par poids decroissant", () => {
    const pairs = topLegacyPairs(map);
    expect(pairs).toHaveLength(125);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].weight).toBeGreaterThanOrEqual(pairs[i].weight);
    }
    expect(pairs[0].weight).toBe(stats.maxWeight);
    expect(topLegacyPairs(map, 2).length).toBe(125 - stats.nSinglePmid);
  });
});

describe("carte v1 — helpers", () => {
  it("legacyHlaClass lit les notations serologique et allelique", () => {
    expect(legacyHlaClass("HLA-*DQ2")).toBe("II");
    expect(legacyHlaClass("HLA-*DR15")).toBe("II");
    expect(legacyHlaClass("HLA-DRB1*15")).toBe("II");
    expect(legacyHlaClass("HLA-*A23")).toBe("I");
    expect(legacyHlaClass("HLA-B*55:01")).toBe("I");
    expect(legacyHlaClass("HLA-mismatch")).toBeNull();
  });

  it("isSerological repere la forme « HLA-* »", () => {
    expect(isSerological("HLA-*A23")).toBe(true);
    expect(isSerological("HLA-A*02")).toBe(false);
  });

  it("normalizeLegacyMap ignore les aretes non bipartites ou orphelines", () => {
    const m = normalizeLegacyMap({
      source: "x",
      nodes: [
        { id: "1", label: "HLA-A*02", size: 5, type: "HLA", x: 0, y: 0 },
        { id: "2", label: "HLA-*B27", size: 5, type: "HLA", x: 1, y: 0 },
        { id: "3", label: "CMV", size: 5, type: "Complication", x: 0, y: 1 },
      ],
      edges: [
        { source: "3", target: "1", weight: 2 },
        { source: "1", target: "2", weight: 1 },
        { source: "1", target: "99", weight: 1 },
      ],
    });
    expect(m.edges).toEqual([{ id: "1--3", hla: "1", complication: "3", weight: 2 }]);
  });
});
