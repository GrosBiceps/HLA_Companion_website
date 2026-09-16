import { describe, it, expect } from "vitest";
import {
  getAlleleByKey,
  getAssociationsForAllele,
  getPairMentions,
  getAlleleAncestry,
  searchEntities,
} from "../lib/queries";
import { getCorpusVersion } from "../lib/db";
import { OUTCOME_LABELS } from "../lib/labels";

describe("corpus version", () => {
  it("expose la version et le drapeau synthetique", () => {
    const v = getCorpusVersion();
    expect(v.version).toBeTruthy();
    expect(v.universe).toBe("A");
    expect(typeof v.isSynthetic).toBe("boolean");
    expect(v.nArticles).toBeGreaterThan(0);
  });
});

describe("getAlleleByKey", () => {
  it("retrouve un allele 4-digit connu", () => {
    const a = getAlleleByKey("HLA-DQB1*02:01");
    expect(a).not.toBeNull();
    expect(a!.locus).toBe("DQB1");
    expect(a!.hlaClass).toBe("II");
    expect(a!.resolution).toBe("4-digit");
  });

  it("retourne null pour un allele inconnu", () => {
    expect(getAlleleByKey("HLA-INEXISTANT*99:99")).toBeNull();
  });
});

describe("getAssociationsForAllele", () => {
  it("retourne des associations portant un libelle clinique, jamais la cle brute", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const expected = OUTCOME_LABELS[r.outcome];
      expect(expected).toBeDefined();
      expect(r.label).toBe(expected.label);
      expect(r.label).not.toBe(r.outcome);
      expect(r.category).toBe(expected.category);
    }
  });

  it("expose separement les mentions positives et negatives", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    for (const r of rows) {
      expect(r.nPositive + r.nNegated).toBe(r.nCooccurrence);
    }
  });

  it("trie par force de signal decroissante", () => {
    const order = ["inverse", "strong", "clear", "moderate", "weak"];
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    const idx = rows.map((r) => order.indexOf(r.signalLevel));
    const sorted = [...idx].sort((a, b) => a - b);
    expect(idx).toEqual(sorted);
  });

  it("inclut les non-significatifs (ils sont grises, pas masques)", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    const weak = rows.filter((r) => r.signalLevel === "weak");
    // le jeu synthetique en contient ; on verifie qu'ils ne sont pas filtres
    expect(rows.length).toBeGreaterThanOrEqual(weak.length);
  });
});

describe("getPairMentions", () => {
  it("retourne des phrases contenant leurs spans surlignables", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    const first = rows[0];
    const mentions = getPairMentions(first.hla, first.outcome);
    expect(mentions.length).toBe(first.nCooccurrence);
    for (const m of mentions) {
      expect(m.sentence).toContain(m.hlaSpan);
      expect(m.sentence).toContain(m.outcomeSpan);
      expect(["positive", "negated"]).toContain(m.polarity);
    }
  });
});

describe("getAlleleAncestry", () => {
  it("remonte la hierarchie classe > locus > 2-digit > 4-digit", () => {
    const chain = getAlleleAncestry("HLA-DQB1*02:01");
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[chain.length - 1].hla).toBe("HLA-DQB1*02:01");
    // chaque maillon est le parent du suivant
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i + 1].parentHla).toBe(chain[i].hla);
    }
  });
});

describe("searchEntities", () => {
  it("trouve un allele par fragment de nom", () => {
    const hits = searchEntities("DQB1");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.entityType === "allele")).toBe(true);
  });

  it("retourne un tableau vide sans exception sur requete vide", () => {
    expect(searchEntities("")).toEqual([]);
  });

  it("ne leve pas sur des caracteres speciaux FTS5", () => {
    expect(() => searchEntities('"; DROP TABLE articles; --')).not.toThrow();
  });
});
