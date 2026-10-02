import { describe, expect, it } from "vitest";
import {
  getAlleleCatalog,
  getAssociationMatrix,
  getCorpusStats,
  getNeighborhood,
  getSignalHighlights,
  searchEntities,
} from "../lib/queries";
import {
  getSerotypeCatalog,
  getSerotypeIdsByAllele,
  getSerotypeMembers,
  getSerotypeOutcomes,
  getSerotypesForAllele,
} from "../lib/serotypes";
import { getAlleleChildSummaries } from "../lib/allele-nav";

/**
 * Budget de latence sur le corpus elargi (~900 alleles 4-digit, ~6 000
 * paires) : chaque requete d'une page doit rester sous ~100 ms. On mesure le
 * MEILLEUR de trois essais (le premier amorce les caches) avec une marge : le
 * test echoue sur une regression d'ordre de grandeur (index manquant, requete
 * en N+1), pas sur le bruit d'un runner charge.
 */
const BUDGET_MS = 100;

function best(fn: () => unknown, runs = 3): number {
  let min = Infinity;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    min = Math.min(min, performance.now() - t);
  }
  return min;
}

describe("latence des requetes sur le corpus elargi", () => {
  const cases: [string, () => unknown][] = [
    ["catalogue des alleles", () => getAlleleCatalog()],
    ["catalogue des serotypes", () => getSerotypeCatalog()],
    ["serotypes par allele", () => getSerotypeIdsByAllele()],
    ["membres de DR5 (famille large)", () => getSerotypeMembers("DR5")],
    ["membres de B15 (famille large)", () => getSerotypeMembers("B15")],
    ["complications de A2", () => getSerotypeOutcomes("A2")],
    ["serotypes d'un 2-digit", () => getSerotypesForAllele("HLA-DRB1*03")],
    ["enfants de A*02", () => getAlleleChildSummaries("HLA-A*02")],
    ["matrice 2-digit", () => getAssociationMatrix("2-digit")],
    ["matrice 4-digit, locus B", () => getAssociationMatrix("4-digit", "B")],
    ["matrice 4-digit complete", () => getAssociationMatrix("4-digit")],
    ["voisinage du graphe, profondeur 3", () => getNeighborhood("HLA-DQB1*02:01", 3)],
    ["stats du corpus", () => getCorpusStats()],
    ["signaux marquants", () => getSignalHighlights({ limit: 20 })],
  ];

  it.each(cases)("%s < 100 ms", (_name, fn) => {
    expect(best(fn)).toBeLessThan(BUDGET_MS);
  });

  it("la recherche reste sous 100 ms, index froid compris apres amorcage", () => {
    searchEntities("A*02");
    for (const q of ["DR15", "a02", "DQB1*02:01", "B27", "dq", "rejet", "kidney"]) {
      expect(best(() => searchEntities(q)), q).toBeLessThan(BUDGET_MS);
    }
  });
});
