import { describe, it, expect } from "vitest";
import {
  getAlleleArticleCount,
  getAlleleCatalog,
  getAlleleSiblings,
  getAlleleYearCounts,
  getArticleCountsByHla,
  getArticleEntities,
  getAuthorPublications,
  getAuthorshipRoles,
  getCorpusYearRange,
  getOutcomeArticleCount,
  getOutcomeCatalog,
  getOutcomeCount,
  getOutcomeYearCounts,
  getTopArticlesForAllele,
  getTopArticlesForOutcome,
} from "../lib/queries";
import { getDb } from "../lib/db";
import { CATEGORIES, OUTCOME_LABELS } from "../lib/labels";
import {
  activeYears,
  categoryAnchor,
  coAnchor,
  formatInt,
  plural,
  yearSpan,
} from "../lib/format";
import { segmentText } from "../lib/highlight";
import {
  buildAlleleTree,
  compareAlleles,
  matchesAlleleQuery,
} from "../lib/allele-tree";

/**
 * Helpers des fiches enrichies (bloc de fin de `queries.ts`) et modules purs
 * associes (format, surlignage, arbre de nomenclature).
 */

const ALLELE = "HLA-DQB1*02:01";

function distinctArticles(sql: string, key: string): number {
  return (getDb().prepare(sql).get(key) as { n: number }).n;
}

describe("series annuelles", () => {
  it("sont denses sur toutes les annees du corpus", () => {
    const range = getCorpusYearRange()!;
    const series = getAlleleYearCounts(ALLELE);
    expect(series.length).toBe(range.max - range.min + 1);
    expect(series[0].year).toBe(range.min);
    expect(series[series.length - 1].year).toBe(range.max);
  });

  it("comptent des ARTICLES distincts, pas des lignes de mention", () => {
    const total = getAlleleYearCounts(ALLELE).reduce((s, p) => s + p.n, 0);
    expect(total).toBe(getAlleleArticleCount(ALLELE));
    expect(total).toBe(
      distinctArticles(
        "SELECT COUNT(DISTINCT pmid) AS n FROM hla_mentions WHERE hla = ?",
        ALLELE,
      ),
    );
    const outcomeTotal = getOutcomeYearCounts("ABMR").reduce(
      (s, p) => s + p.n,
      0,
    );
    expect(outcomeTotal).toBe(getOutcomeArticleCount("ABMR"));
  });

  it("rendent une serie de zeros pour une cle inconnue, sans lever", () => {
    const series = getAlleleYearCounts("HLA-INEXISTANT*99");
    expect(series.every((p) => p.n === 0)).toBe(true);
  });
});

describe("comptes d'articles par entite", () => {
  it("concordent avec le compte unitaire", () => {
    const counts = getArticleCountsByHla();
    expect(counts.get(ALLELE)).toBe(getAlleleArticleCount(ALLELE));
  });

  it("le referentiel de complications est compte, pas ecrit en dur", () => {
    expect(getOutcomeCount()).toBe(
      (
        getDb().prepare("SELECT COUNT(*) AS n FROM outcomes").get() as {
          n: number;
        }
      ).n,
    );
  });
});

describe("getAlleleSiblings", () => {
  it("rend les freres (meme parent), sans l'allele lui-meme", () => {
    const sibs = getAlleleSiblings(ALLELE);
    expect(sibs.map((s) => s.hla)).not.toContain(ALLELE);
    for (const s of sibs) expect(s.parentHla).toBe("HLA-DQB1*02");
  });

  it("est vide pour une entite sans parent", () => {
    expect(getAlleleSiblings("HLA-mismatch")).toEqual([]);
  });
});

describe("articles les plus riches en co-mentions", () => {
  it("sont tries par phrases decroissantes et coherents avec pair_mentions", () => {
    const top = getTopArticlesForAllele(ALLELE, 5);
    expect(top.length).toBeGreaterThan(0);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].nSentences).toBeGreaterThanOrEqual(top[i].nSentences);
    }
    const first = top[0];
    const n = (
      getDb()
        .prepare(
          "SELECT COUNT(*) AS n FROM pair_mentions WHERE pmid = ? AND hla = ?",
        )
        .get(first.pmid, ALLELE) as { n: number }
    ).n;
    expect(first.nSentences).toBe(n);
    expect(first.nNegated).toBeLessThanOrEqual(first.nSentences);
  });

  it("fonctionnent dans le sens complication", () => {
    const top = getTopArticlesForOutcome("DSA", 3);
    expect(top.length).toBe(3);
    expect(top[0].firstAuthor).toBeTruthy();
  });
});

describe("catalogues", () => {
  it("le catalogue des alleles couvre toutes les entites", () => {
    const catalog = getAlleleCatalog();
    const n = (
      getDb().prepare("SELECT COUNT(*) AS n FROM hla_entities").get() as {
        n: number;
      }
    ).n;
    expect(catalog.length).toBe(n);
    const entry = catalog.find((e) => e.hla === ALLELE)!;
    expect(entry.nArticles).toBe(getAlleleArticleCount(ALLELE));
    expect(entry.nMarked).toBeLessThanOrEqual(entry.nOutcomes);
  });

  it("le catalogue des complications suit l'ordre clinique et porte les libelles", () => {
    const catalog = getOutcomeCatalog(3);
    expect(catalog.length).toBe(getOutcomeCount());
    const order = catalog.map((c) => CATEGORIES.indexOf(c.category as never));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const c of catalog) {
      expect(c.label).toBe(OUTCOME_LABELS[c.outcome].label);
      expect(c.topAlleles.length).toBeLessThanOrEqual(3);
      // « Plus marques » : jamais un allele sous le seuil.
      for (const t of c.topAlleles) expect(t.signalLevel).not.toBe("weak");
    }
  });
});

describe("getArticleEntities", () => {
  it("rend les entites et leurs segments, libelle clinique joint", () => {
    const { pmid } = getDb()
      .prepare(
        "SELECT pmid FROM pair_mentions GROUP BY pmid ORDER BY COUNT(*) DESC LIMIT 1",
      )
      .get() as { pmid: string };
    const e = getArticleEntities(pmid);
    expect(e.hla.length).toBeGreaterThan(0);
    expect(e.outcomes.length).toBeGreaterThan(0);
    for (const o of e.outcomes) {
      expect(o.label).toBe(OUTCOME_LABELS[o.outcome].label);
      expect(o.nNegated).toBeLessThanOrEqual(o.nMentions);
    }
  });
});

describe("getAuthorshipRoles", () => {
  it("partitionne les publications de l'auteur", () => {
    const { id } = getDb()
      .prepare(
        "SELECT author_id AS id FROM authors ORDER BY n_publications DESC LIMIT 1",
      )
      .get() as { id: string };
    const r = getAuthorshipRoles(id);
    expect(r.first + r.middle + r.last).toBe(getAuthorPublications(id).length);
  });
});

describe("format", () => {
  it("accorde le pluriel a la francaise (0 et 1 au singulier)", () => {
    expect(plural(0, "article")).toBe("0 article");
    expect(plural(1, "article")).toBe("1 article");
    expect(plural(2, "article")).toBe("2 articles");
    expect(plural(3, "entité HLA", "entités HLA")).toBe("3 entités HLA");
  });

  it("separe les milliers par une espace fine insecable", () => {
    expect(formatInt(2365)).toBe("2 365");
    expect(formatInt(999)).toBe("999");
  });

  it("formate les periodes et les ancres", () => {
    expect(yearSpan(1998, 2026)).toBe("1998–2026");
    expect(yearSpan(2001, 2001)).toBe("2001");
    expect(yearSpan(null, 2001)).toBeNull();
    expect(
      activeYears([
        { year: 1, n: 0 },
        { year: 2, n: 3 },
        { year: 3, n: 0 },
      ]),
    ).toEqual({
      first: 2,
      last: 2,
    });
    expect(coAnchor("HLA-DQB1*02:01")).toBe("co-HLA-DQB1_02_01");
    expect(categoryAnchor("Fonction du greffon")).toBe(
      "cat-fonction-du-greffon",
    );
    expect(categoryAnchor("Neoplasie")).toBe("cat-neoplasie");
  });
});

describe("segmentText (surlignage du titre et du resume)", () => {
  it("preserve exactement le texte d'origine", () => {
    const text = "HLA-DQB1*02:01 typing and DSA: a DQB1 study of dsa";
    const segs = segmentText(text, [
      { text: "HLA-DQB1*02:01", kind: "hla" },
      { text: "DQB1", kind: "hla" },
      { text: "DSA", kind: "outcome" },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });

  it("donne la priorite au segment le plus long, sans chevauchement", () => {
    const segs = segmentText("HLA-DQB1*02:01 and DQB1", [
      { text: "DQB1", kind: "hla" },
      { text: "HLA-DQB1*02:01", kind: "hla" },
    ]);
    const marked = segs.filter((s) => s.kind !== "plain").map((s) => s.text);
    expect(marked).toEqual(["HLA-DQB1*02:01", "DQB1"]);
  });

  it("respecte les bornes de mot et ignore la casse", () => {
    const segs = segmentText("DSAx and dsa", [
      { text: "DSA", kind: "outcome" },
    ]);
    expect(segs.filter((s) => s.kind === "outcome").map((s) => s.text)).toEqual(
      ["dsa"],
    );
  });

  it("ne leve pas sur un segment vide ou des metacaracteres", () => {
    expect(() =>
      segmentText("a*b (c)", [
        { text: "", kind: "hla" },
        { text: "*b (", kind: "hla" },
      ]),
    ).not.toThrow();
  });
});

describe("arbre de nomenclature", () => {
  it("range classe -> locus -> 2-digit -> 4-digit", () => {
    const tree = buildAlleleTree(getAlleleCatalog());
    expect(tree.classes.map((c) => c.hlaClass)).toEqual(["I", "II"]);
    expect(tree.classes[0].loci.map((l) => l.locus)).toEqual(["A", "B", "C"]);
    const dqb1 = tree.classes[1].loci.find((l) => l.locus === "DQB1")!;
    const two = dqb1.alleles.find((a) => a.hla === "HLA-DQB1*02")!;
    expect(two.children.map((c) => c.hla)).toContain(ALLELE);
    expect(tree.others.map((o) => o.hla).sort()).toEqual([
      "HLA-eplet",
      "HLA-mismatch",
    ]);
  });

  it("n'oublie ni ne duplique aucune entite allelique", () => {
    const catalog = getAlleleCatalog();
    const tree = buildAlleleTree(catalog);
    const seen: string[] = [...tree.others.map((o) => o.hla)];
    for (const c of tree.classes)
      for (const l of c.loci) {
        seen.push(...l.orphans.map((o) => o.hla));
        for (const a of l.alleles)
          seen.push(a.hla, ...a.children.map((x) => x.hla));
      }
    const expected = catalog
      .filter((e) => e.resolution !== "class")
      .map((e) => e.hla);
    expect(seen.sort()).toEqual(expected.sort());
  });

  it("trie naturellement et filtre avec tolerance", () => {
    expect(compareAlleles("HLA-A*2", "HLA-A*10")).toBeLessThan(0);
    expect(matchesAlleleQuery("HLA-DQB1*02:01", "dqb1*02")).toBe(true);
    expect(matchesAlleleQuery("HLA-DQB1*02:01", "HLA-DQB1 02:01")).toBe(true);
    expect(matchesAlleleQuery("HLA-A*02", "B*")).toBe(false);
    expect(matchesAlleleQuery("HLA-A*02", "  ")).toBe(true);
  });
});
