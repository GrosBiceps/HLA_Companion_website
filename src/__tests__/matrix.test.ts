import { describe, it, expect } from "vitest";
import { getAssociationMatrix } from "../lib/queries";
import { buildMatrixView, toClientMatrix, type ClientMatrix } from "../lib/matrix";
import { cellScale } from "../lib/viz-encoding";
import type { SignalLevel } from "../lib/types";

/** Petite matrice fabriquee : 3 alleles, 2 complications, 3 paires. */
function fixture(): ClientMatrix {
  return {
    resolution: "2-digit",
    alleles: [
      { hla: "HLA-A*01", locus: "A", hlaClass: "I", nMentions: 10 },
      { hla: "HLA-A*02", locus: "A", hlaClass: "I", nMentions: 50 },
      { hla: "HLA-DRB1*15", locus: "DRB1", hlaClass: "II", nMentions: 30 },
    ],
    outcomes: [
      { outcome: "ABMR", label: "Rejet humoral (ABMR)", category: "Rejet", nMentions: 9 },
      { outcome: "CMV", label: "Infection a CMV", category: "Infection", nMentions: 9 },
    ],
    cells: [
      { hla: "HLA-A*01", outcome: "CMV", signalLevel: "weak", isSignificant: false, nCooccurrence: 2, nNegated: 0 },
      { hla: "HLA-A*02", outcome: "ABMR", signalLevel: "strong", isSignificant: true, nCooccurrence: 12, nNegated: 1 },
      { hla: "HLA-DRB1*15", outcome: "ABMR", signalLevel: "inverse", isSignificant: true, nCooccurrence: 3, nNegated: 0 },
    ],
  };
}

describe("toClientMatrix — aucune metrique brute vers le navigateur", () => {
  it("retire npmi (et n'ajoute aucune autre metrique)", () => {
    const m = toClientMatrix(getAssociationMatrix("2-digit"));
    expect(m.cells.length).toBeGreaterThan(0);
    for (const c of m.cells) {
      expect(c).not.toHaveProperty("npmi");
      expect(Object.keys(c).sort()).toEqual(
        ["hla", "isSignificant", "nCooccurrence", "nNegated", "outcome", "signalLevel"],
      );
    }
    expect(JSON.stringify(m)).not.toMatch(/npmi|odds|fdr|pval/i);
  });
});

describe("buildMatrixView", () => {
  it("aligne chaque case sur sa colonne ; une paire absente vaut null", () => {
    const v = buildMatrixView(fixture());
    const rows = v.rowGroups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.allele.hla)).toEqual(["HLA-A*01", "HLA-A*02", "HLA-DRB1*15"]);
    expect(rows[0].slots[0]).toBeNull(); // A*01 x ABMR : jamais co-mentionnes
    expect(rows[0].slots[1]?.cell.outcome).toBe("CMV");
    expect(rows[1].slots[0]?.cell.signalLevel).toBe("strong");
    expect(rows[1].slots[1]).toBeNull();
    for (const r of rows) expect(r.slots.length).toBe(2);
  });

  it("groupe les lignes par classe et locus, dans l'ordre de la requete", () => {
    const v = buildMatrixView(fixture());
    expect(v.rowGroups.map((g) => g.label)).toEqual(["Classe I · HLA-A", "Classe II · HLA-DRB1"]);
    expect(v.columnGroups).toEqual([
      { category: "Rejet", label: "Rejet", span: 1 },
      { category: "Infection", label: "Infection", span: 1 },
    ]);
  });

  it("un filtre de niveau MASQUE la case sans la confondre avec une case vide", () => {
    const levels = new Set<SignalLevel>(["strong", "inverse"]);
    const v = buildMatrixView(fixture(), { levels });
    const a01 = v.rowGroups[0].rows[0];
    expect(a01.slots[1]).not.toBeNull();
    expect(a01.slots[1]?.visible).toBe(false);
    expect(a01.nVisible).toBe(0);
    expect(a01.nPresent).toBe(1);
    // Les compteurs par niveau portent sur le corpus, pas sur la vue.
    expect(v.levelCounts.weak).toBe(1);
  });

  it("masque les lignes sans case visible seulement sur demande", () => {
    const levels = new Set<SignalLevel>(["strong"]);
    expect(buildMatrixView(fixture(), { levels }).nRows).toBe(3);
    const v = buildMatrixView(fixture(), { levels, hideEmptyRows: true });
    expect(v.nRows).toBe(1);
    expect(v.nHiddenRows).toBe(2);
    expect(v.rowGroups.flatMap((g) => g.rows)[0].allele.hla).toBe("HLA-A*02");
  });

  it("trie par mentions puis par nombre de signaux marques", () => {
    const byMentions = buildMatrixView(fixture(), { sort: "mentions" });
    expect(byMentions.rowGroups).toHaveLength(1);
    expect(byMentions.rowGroups[0].rows.map((r) => r.allele.hla)).toEqual([
      "HLA-A*02",
      "HLA-DRB1*15",
      "HLA-A*01",
    ]);
    const bySignal = buildMatrixView(fixture(), { sort: "signal" });
    // A*02 et DRB1*15 portent chacun 1 signal marque ; A*02 a plus de mentions.
    expect(bySignal.rowGroups[0].rows.map((r) => r.allele.hla)).toEqual([
      "HLA-A*02",
      "HLA-DRB1*15",
      "HLA-A*01",
    ]);
  });

  it("sur le corpus : toutes les paires sont placees, en 2 et 4 chiffres", () => {
    for (const res of ["2-digit", "4-digit"] as const) {
      const m = toClientMatrix(getAssociationMatrix(res));
      const v = buildMatrixView(m);
      const placed = v.rowGroups
        .flatMap((g) => g.rows)
        .reduce((s, r) => s + r.slots.filter(Boolean).length, 0);
      expect(placed).toBe(m.cells.length);
      expect(v.maxCount).toBe(Math.max(...m.cells.map((c) => c.nCooccurrence)));
      // Les colonnes sont groupees par categorie, sans categorie repetee.
      const cats = v.columnGroups.map((g) => g.category);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });
});

describe("cellScale", () => {
  it("est monotone, bornee, et ne fait jamais disparaitre une case", () => {
    expect(cellScale(1, 72)).toBeGreaterThanOrEqual(0.38);
    expect(cellScale(72, 72)).toBe(1);
    expect(cellScale(500, 72)).toBe(1);
    expect(cellScale(10, 72)).toBeLessThan(cellScale(40, 72));
    expect(cellScale(0, 0)).toBe(0.38);
  });
});
