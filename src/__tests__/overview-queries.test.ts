import { describe, it, expect } from "vitest";
import {
  getAssociationMatrix,
  getCorpusStats,
  getPublicationsByYear,
} from "../lib/queries";
import { getDb } from "../lib/db";
import { CATEGORIES, OUTCOME_LABELS, SIGNAL_LEVELS } from "../lib/labels";

/**
 * Vues d'ensemble (matrice, chronologie, compteurs) destinees aux
 * visualisations. Chaque assertion confronte la fonction a un comptage SQL
 * independant : une vue globale fausse est plus dangereuse qu'une fiche
 * fausse, parce qu'elle oriente toute la lecture du corpus.
 */

function count(sql: string, ...params: unknown[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n;
}

describe("getAssociationMatrix", () => {
  const m = getAssociationMatrix();

  it("porte par defaut sur les alleles 2-digit, tous presents", () => {
    expect(m.resolution).toBe("2-digit");
    expect(m.alleles.length).toBe(
      count("SELECT COUNT(*) AS n FROM hla_entities WHERE resolution = '2-digit'"),
    );
    expect(m.alleles.length).toBeGreaterThan(0);
    for (const a of m.alleles) {
      expect(a.hla).toMatch(/^HLA-[A-Z0-9]+\*\d{2}$/);
    }
  });

  it("ordonne les lignes classe I puis classe II", () => {
    const classes = m.alleles.map((a) => a.hlaClass);
    const firstII = classes.indexOf("II");
    expect(firstII).toBeGreaterThan(0);
    expect(classes.slice(firstII).every((c) => c === "II")).toBe(true);
  });

  it("ordonne les colonnes par categorie clinique, libelle jamais brut", () => {
    expect(m.outcomes.length).toBe(count("SELECT COUNT(*) AS n FROM outcomes"));
    const ranks = m.outcomes.map((o) =>
      CATEGORIES.indexOf(o.category as (typeof CATEGORIES)[number]),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const o of m.outcomes) {
      expect(o.label).toBe(OUTCOME_LABELS[o.outcome].label);
      expect(o.label).not.toBe(o.outcome);
    }
  });

  it("contient exactement les associations des alleles 2-digit, sans filtre", () => {
    const expected = count(
      `SELECT COUNT(*) AS n FROM associations a
         JOIN hla_entities h ON h.hla = a.hla
        WHERE a.organ = 'all' AND h.resolution = '2-digit'`,
    );
    expect(m.cells.length).toBe(expected);
    // Le non significatif n'est pas masque.
    expect(m.cells.some((c) => c.signalLevel === "weak")).toBe(true);
    expect(m.cells.some((c) => c.signalLevel !== "weak")).toBe(true);
  });

  it("chaque case reference une ligne et une colonne de la matrice", () => {
    const rows = new Set(m.alleles.map((a) => a.hla));
    const cols = new Set(m.outcomes.map((o) => o.outcome));
    const seen = new Set<string>();
    for (const c of m.cells) {
      expect(rows.has(c.hla)).toBe(true);
      expect(cols.has(c.outcome)).toBe(true);
      expect(SIGNAL_LEVELS).toContain(c.signalLevel);
      expect(c.isSignificant).toBe(c.signalLevel !== "weak");
      expect(c.nCooccurrence).toBeGreaterThan(0);
      expect(c.nNegated).toBeLessThanOrEqual(c.nCooccurrence);
      if (c.npmi !== null) {
        expect(c.npmi).toBeGreaterThanOrEqual(-1);
        expect(c.npmi).toBeLessThanOrEqual(1);
      }
      const key = `${c.hla}|${c.outcome}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("concorde case par case avec la table associations", () => {
    const cell = m.cells.find((c) => c.hla === "HLA-DQB1*02" && c.outcome === "DSA");
    expect(cell).toBeDefined();
    const row = getDb()
      .prepare(
        `SELECT n_cooccurrence, signal_level, npmi FROM associations
          WHERE organ = 'all' AND hla = 'HLA-DQB1*02' AND outcome = 'DSA'`,
      )
      .get() as { n_cooccurrence: number; signal_level: string; npmi: number };
    expect(cell!.nCooccurrence).toBe(row.n_cooccurrence);
    expect(cell!.signalLevel).toBe(row.signal_level);
    expect(cell!.npmi).toBe(row.npmi);
  });

  it("accepte la resolution 4-digit", () => {
    const m4 = getAssociationMatrix("4-digit");
    expect(m4.resolution).toBe("4-digit");
    expect(m4.alleles.some((a) => a.hla === "HLA-DQB1*02:01")).toBe(true);
    for (const a of m4.alleles) expect(a.hla).toMatch(/:\d{2}$/);
    expect(m4.cells.length).toBe(
      count(
        `SELECT COUNT(*) AS n FROM associations a
           JOIN hla_entities h ON h.hla = a.hla
          WHERE a.organ = 'all' AND h.resolution = '4-digit'`,
      ),
    );
  });
});

describe("getPublicationsByYear", () => {
  const series = getPublicationsByYear();

  it("couvre toutes les annees sans trou, en ordre croissant", () => {
    expect(series.length).toBeGreaterThan(1);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].year).toBe(series[i - 1].year + 1);
    }
    const bounds = getDb()
      .prepare("SELECT MIN(year) AS lo, MAX(year) AS hi FROM articles")
      .get() as { lo: number; hi: number };
    expect(series[0].year).toBe(bounds.lo);
    expect(series[series.length - 1].year).toBe(bounds.hi);
  });

  it("totalise exactement le nombre d'articles du corpus", () => {
    const total = series.reduce((acc, p) => acc + p.nArticles, 0);
    expect(total).toBe(count("SELECT COUNT(*) AS n FROM articles"));
    for (const p of series) expect(p.nArticles).toBeGreaterThanOrEqual(0);
  });
});

describe("getCorpusStats — compteurs etendus", () => {
  const stats = getCorpusStats();

  it("conserve les compteurs historiques de l'accueil", () => {
    expect(stats.nArticles).toBe(count("SELECT COUNT(*) AS n FROM articles"));
    expect(stats.nOutcomes).toBe(count("SELECT COUNT(*) AS n FROM outcomes"));
    expect(stats.nAlleles).toBe(count("SELECT COUNT(*) AS n FROM hla_entities"));
    expect(stats.yearMin).not.toBeNull();
    expect(stats.yearMax).toBeGreaterThanOrEqual(stats.yearMin as number);
  });

  it("repartit les entites HLA par resolution", () => {
    const sum = Object.values(stats.allelesByResolution).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.nAlleles);
    expect(stats.nAlleles2Digit).toBe(stats.allelesByResolution["2-digit"]);
    expect(stats.nAlleles4Digit).toBe(stats.allelesByResolution["4-digit"]);
    expect(stats.nAlleles2Digit).toBeGreaterThan(0);
    expect(stats.nAlleles4Digit).toBeGreaterThan(0);
  });

  it("compte auteurs, revues, pays et phrases depuis la base", () => {
    expect(stats.nAuthors).toBe(count("SELECT COUNT(*) AS n FROM authors"));
    expect(stats.nJournals).toBe(
      count("SELECT COUNT(DISTINCT journal) AS n FROM articles"),
    );
    expect(stats.nCountries).toBe(
      count("SELECT COUNT(DISTINCT country) AS n FROM articles"),
    );
    expect(stats.nPairMentions).toBe(count("SELECT COUNT(*) AS n FROM pair_mentions"));
  });

  it("ventile les associations sur les 5 niveaux de signal", () => {
    expect(Object.keys(stats.associationsBySignal).sort()).toEqual(
      [...SIGNAL_LEVELS].sort(),
    );
    const sum = Object.values(stats.associationsBySignal).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.nAssociations);
    expect(stats.nAssociations).toBe(
      count("SELECT COUNT(*) AS n FROM associations WHERE organ = 'all'"),
    );
    for (const level of SIGNAL_LEVELS) {
      expect(stats.associationsBySignal[level]).toBe(
        count(
          "SELECT COUNT(*) AS n FROM associations WHERE organ = 'all' AND signal_level = ?",
          level,
        ),
      );
    }
  });
});
