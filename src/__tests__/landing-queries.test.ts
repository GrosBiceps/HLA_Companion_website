import { describe, it, expect } from "vitest";
import {
  getLocusOverview,
  getOutcomesByCategory,
  getSignalHighlights,
  getTopAuthors,
} from "../lib/queries";
import { getDb } from "../lib/db";
import { CATEGORIES, OUTCOME_LABELS } from "../lib/labels";

/**
 * Requetes de l'accueil. Chaque assertion est confrontee a un comptage SQL
 * independant : la vitrine oriente la premiere lecture du corpus.
 */

function count(sql: string, ...params: unknown[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n;
}

describe("getSignalHighlights", () => {
  it("ne rend que des alleles, aux niveaux demandes, tries par niveau puis effectif", () => {
    const rows = getSignalHighlights({ limit: 50 });
    expect(rows.length).toBe(50);
    for (const r of rows) {
      expect(["2-digit", "4-digit"]).toContain(r.resolution);
      expect(["strong", "clear"]).toContain(r.signalLevel);
      expect(r.hla).toMatch(/^HLA-[A-Z0-9]+\*\d{2}(:\d{2})?$/);
      expect(r.label).toBe(OUTCOME_LABELS[r.outcome].label);
      expect(r.nNegated).toBeLessThanOrEqual(r.nCooccurrence);
    }
    const rank = (l: string) => (l === "strong" ? 0 : 1);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      expect(
        rank(a.signalLevel) < rank(b.signalLevel) ||
          (rank(a.signalLevel) === rank(b.signalLevel) &&
            a.nCooccurrence >= b.nCooccurrence),
      ).toBe(true);
    }
  });

  it("couvre exactement les paires fortes et nettes des alleles", () => {
    const expected = count(
      `SELECT COUNT(*) AS n FROM associations a JOIN hla_entities h ON h.hla = a.hla
        WHERE a.organ = 'all' AND a.signal_level IN ('strong','clear')
          AND h.resolution IN ('2-digit','4-digit')`,
    );
    expect(getSignalHighlights({ limit: 10_000 }).length).toBe(expected);
  });

  it("exclut les entites agregees (incompatibilite, eplets)", () => {
    const rows = getSignalHighlights({ limit: 10_000 });
    expect(rows.some((r) => r.hla === "HLA-mismatch" || r.hla === "HLA-eplet")).toBe(false);
  });

  it("respecte le filtre de niveau et de resolution", () => {
    const inv = getSignalHighlights({ levels: ["inverse"], resolutions: ["2-digit"], limit: 100 });
    expect(inv.length).toBe(
      count(
        `SELECT COUNT(*) AS n FROM associations a JOIN hla_entities h ON h.hla = a.hla
          WHERE a.organ = 'all' AND a.signal_level = 'inverse'
            AND h.resolution = '2-digit'`,
      ),
    );
    expect(inv.every((r) => r.signalLevel === "inverse" && r.resolution === "2-digit")).toBe(true);
    expect(getSignalHighlights({ levels: [] })).toEqual([]);
  });
});

describe("getLocusOverview", () => {
  const loci = getLocusOverview(3);

  it("rend les loci classe I puis classe II, dans l'ordre de la matrice", () => {
    expect(loci.map((l) => l.locus)).toEqual(["A", "B", "C", "DRB1", "DQB1", "DPB1"]);
    expect(loci.map((l) => l.hlaClass)).toEqual(["I", "I", "I", "II", "II", "II"]);
  });

  it("compte les alleles par resolution depuis la base", () => {
    for (const l of loci) {
      expect(l.nAlleles2Digit).toBe(
        count(
          "SELECT COUNT(*) AS n FROM hla_entities WHERE locus = ? AND resolution = '2-digit'",
          l.locus,
        ),
      );
      expect(l.nAlleles4Digit).toBe(
        count(
          "SELECT COUNT(*) AS n FROM hla_entities WHERE locus = ? AND resolution = '4-digit'",
          l.locus,
        ),
      );
      expect(l.topAlleles.length).toBeLessThanOrEqual(3);
      expect(l.topAlleles.length).toBeGreaterThan(0);
      const m = l.topAlleles.map((a) => a.nMentions);
      expect(m).toEqual([...m].sort((a, b) => b - a));
      for (const a of l.topAlleles) expect(a.hla.startsWith(`HLA-${l.locus}*`)).toBe(true);
    }
  });
});

describe("getOutcomesByCategory", () => {
  const cats = getOutcomesByCategory();

  it("rend les 7 categories dans l'ordre clinique, toutes complications comprises", () => {
    expect(cats.map((c) => c.category)).toEqual([...CATEGORIES]);
    const total = cats.reduce((acc, c) => acc + c.outcomes.length, 0);
    expect(total).toBe(count("SELECT COUNT(*) AS n FROM outcomes"));
  });

  it("joint les libelles cliniques et somme les mentions", () => {
    for (const c of cats) {
      let sum = 0;
      for (const o of c.outcomes) {
        expect(o.label).toBe(OUTCOME_LABELS[o.outcome].label);
        expect(OUTCOME_LABELS[o.outcome].category).toBe(c.category);
        sum += o.nMentions;
      }
      expect(c.nMentions).toBe(sum);
    }
  });
});

describe("getTopAuthors", () => {
  it("rend les auteurs les plus publies, par effectif decroissant", () => {
    const authors = getTopAuthors(5);
    expect(authors.length).toBe(5);
    const max = count("SELECT MAX(n_publications) AS n FROM authors");
    expect(authors[0].nPublications).toBe(max);
    const n = authors.map((a) => a.nPublications);
    expect(n).toEqual([...n].sort((a, b) => b - a));
  });
});
