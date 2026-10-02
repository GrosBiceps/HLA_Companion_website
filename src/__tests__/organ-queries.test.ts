import { describe, it, expect } from "vitest";
import { getDb } from "../lib/db";
import {
  getAlleleArticleCount,
  getAlleleCatalog,
  getAlleleOrganCounts,
  getAlleleYearCounts,
  getArticle,
  getArticleCountsByHla,
  getArticleOrgans,
  getAssociationMatrix,
  getAssociationsForAllele,
  getAssociationsForOutcome,
  getAuthorOrganMix,
  getAuthorPublications,
  getCorpusStats,
  getDefaultGraphCenter,
  getLocusOverview,
  getNeighborhood,
  getOrgans,
  getOutcomeArticleCount,
  getOutcomeCatalog,
  getOutcomeCount,
  getOutcomeOrganCounts,
  getOutcomesByCategory,
  getPairMentions,
  getPublicationsByYear,
  getSignalHighlights,
  getTopArticlesForAllele,
  getTopAuthors,
  searchEntities,
} from "../lib/queries";
import {
  getSerotypeCatalog,
  getSerotypeMembers,
  getSerotypeOrganCounts,
  getSerotypeOutcomes,
} from "../lib/serotypes";
import { ALL_ORGANS, ORGAN_KEYS, type OrganKey } from "../lib/organ";
import { OUTCOME_ORGANS } from "../lib/labels";

/**
 * STRATIFICATION : les chiffres d'un organe sont recalcules sur SES articles,
 * avec SON denominateur. Ces tests recomptent a la main (SQL independant des
 * requetes de l'application) et comparent.
 */

const db = getDb();
const SHOWCASE = "HLA-DQB1*02:01";

function one<T>(sql: string, ...args: unknown[]): T {
  return db.prepare(sql).get(...args) as T;
}

/** Articles d'un organe, comptes directement dans article_organs. */
function organArticles(organ: OrganKey): number {
  return one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM article_organs WHERE organ = ?",
    organ,
  ).n;
}

describe("getOrgans", () => {
  const organs = getOrgans();

  it("liste les sept organes dans l'ordre d'affichage, avec leurs articles", () => {
    expect(organs.map((o) => o.key)).toEqual(ORGAN_KEYS);
    for (const o of organs) {
      expect(o.nArticles).toBe(organArticles(o.key));
      expect(o.label).toBeTruthy();
      expect(o.slug).toMatch(/^[a-z]+$/);
    }
  });

  it("le rein est la plus grosse strate, l'intestin la plus petite", () => {
    const sorted = [...organs].sort((a, b) => b.nArticles - a.nArticles);
    expect(sorted[0].key).toBe("kidney");
    expect(sorted[sorted.length - 1].key).toBe("intestine");
    // le rein pese ~40 % (articles dont il est l'organe), les GCSH ne sont pas une niche
    const total = getCorpusStats().nArticles;
    expect(organs.find((o) => o.key === "kidney")!.nArticles / total).toBeGreaterThan(0.3);
    expect(organs.find((o) => o.key === "hsct")!.nArticles).toBeGreaterThan(
      organs.find((o) => o.key === "pancreas")!.nArticles,
    );
  });

  it("la somme des organes depasse le total : des articles concernent plusieurs organes", () => {
    const total = getCorpusStats().nArticles;
    const sum = organs.reduce((n, o) => n + o.nArticles, 0);
    expect(sum).toBeGreaterThan(total);
    for (const o of organs) expect(o.nArticles).toBeLessThanOrEqual(total);
  });

  it("chaque article a au moins un organe (principal en tete)", () => {
    expect(
      one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM articles a WHERE NOT EXISTS (SELECT 1 FROM article_organs o WHERE o.pmid = a.pmid)",
      ).n,
    ).toBe(0);
    const { pmid } = one<{ pmid: string }>(
      "SELECT pmid FROM article_organs GROUP BY pmid HAVING COUNT(*) > 1 LIMIT 1",
    );
    const organs2 = getArticleOrgans(pmid);
    expect(organs2.length).toBeGreaterThan(1);
    expect(getArticle(pmid)!.organs).toEqual(organs2);
    const primary = one<{ organ: string }>(
      "SELECT organ FROM article_organs WHERE pmid = ? AND is_primary = 1",
      pmid,
    ).organ;
    expect(organs2[0]).toBe(primary);
  });
});

describe("statistiques d'une strate : denominateur et comptes recalcules a la main", () => {
  for (const organ of ORGAN_KEYS) {
    it(`${organ} : n_universe, co-occurrences, marges d'une association recomptees`, () => {
      const nUniverse = organArticles(organ);
      const rows = getAssociationsForAllele(SHOWCASE, organ);
      // le denominateur affiche est celui de la strate, jamais celui du corpus
      for (const r of rows) expect(r.nUniverse).toBe(nUniverse);

      for (const r of rows.slice(0, 6)) {
        const co = one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM pair_mentions pm
             JOIN article_organs ao ON ao.pmid = pm.pmid AND ao.organ = ?
            WHERE pm.hla = ? AND pm.outcome = ?`,
          organ,
          r.hla,
          r.outcome,
        ).n;
        expect(r.nCooccurrence, `${organ} ${r.outcome}`).toBe(co);
        expect(r.nPositive + r.nNegated).toBe(r.nCooccurrence);
      }
    });
  }

  it("NPMI, odds ratio de Haldane-Anscombe : recalcules depuis la table 2x2 de la strate", () => {
    // paire frequente du coeur : table 2x2 reconstruite par SQL independant
    const organ: OrganKey = "heart";
    const pair = one<{ hla: string; outcome: string }>(
      `SELECT hla, outcome FROM associations WHERE organ = ?
        ORDER BY n_cooccurrence DESC, hla, outcome LIMIT 1`,
      organ,
    );
    const N = organArticles(organ);
    const inOrgan = `JOIN article_organs ao ON ao.pmid = pm.pmid AND ao.organ = '${organ}'`;
    const nA = one<{ n: number }>(
      `SELECT COUNT(DISTINCT pm.pmid) AS n FROM pair_mentions pm ${inOrgan} WHERE pm.hla = ?`,
      pair.hla,
    ).n;
    const nB = one<{ n: number }>(
      `SELECT COUNT(DISTINCT pm.pmid) AS n FROM pair_mentions pm ${inOrgan} WHERE pm.outcome = ?`,
      pair.outcome,
    ).n;
    const nAB = one<{ n: number }>(
      `SELECT COUNT(DISTINCT pm.pmid) AS n FROM pair_mentions pm ${inOrgan}
        WHERE pm.hla = ? AND pm.outcome = ?`,
      pair.hla,
      pair.outcome,
    ).n;
    const a = Math.min(nAB, nA, nB);
    const b = nA - a;
    const c = nB - a;
    const d = N - a - b - c;
    expect(d).toBeGreaterThanOrEqual(0);

    const row = one<{
      npmi: number;
      odds_ratio: number;
      n_hla_total: number;
      n_outcome_total: number;
      n_universe: number;
    }>(
      "SELECT npmi, odds_ratio, n_hla_total, n_outcome_total, n_universe FROM associations WHERE organ = ? AND hla = ? AND outcome = ?",
      organ,
      pair.hla,
      pair.outcome,
    );
    expect(row.n_universe).toBe(N);
    expect(row.n_hla_total).toBe(nA);
    expect(row.n_outcome_total).toBe(nB);

    const pab = a / N;
    const pmi = Math.log(pab / ((nA / N) * (nB / N)));
    const npmi = Math.min(1, Math.max(-1, pmi / -Math.log(pab)));
    expect(row.npmi).toBeCloseTo(npmi, 5);
    const or = ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5));
    expect(row.odds_ratio).toBeCloseTo(or, 4);
  });

  it("la strate « tous les organes » n'est pas la somme des organes", () => {
    const all = getAssociationsForAllele(SHOWCASE, ALL_ORGANS);
    const dsa = all.find((r) => r.outcome === "DSA")!;
    const perOrgan = ORGAN_KEYS.map(
      (o) => getAssociationsForAllele(SHOWCASE, o).find((r) => r.outcome === "DSA")?.nCooccurrence ?? 0,
    );
    // un article multi-organe compte dans chaque organe : la somme >= all
    expect(perOrgan.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(dsa.nCooccurrence);
    expect(dsa.nUniverse).toBe(getCorpusStats().nArticles);
    // chaque organe a SON denominateur, tous differents de celui de « all »
    for (const o of ORGAN_KEYS) {
      const r = getAssociationsForAllele(SHOWCASE, o)[0];
      if (r) expect(r.nUniverse).not.toBe(dsa.nUniverse);
    }
  });

  it("le niveau de signal change d'une strate a l'autre pour une meme paire", () => {
    // DQB1*02:01 x DSA : marque dans « tous » et le rein
    const level = (o: OrganKey | "all") =>
      getAssociationsForAllele(SHOWCASE, o).find((r) => r.outcome === "DSA")?.signalLevel;
    expect(level("all")).toBe("strong");
    expect(level("kidney")).toBe("strong");
    const levels = new Set(ORGAN_KEYS.map((o) => level(o)));
    expect(levels.size).toBeGreaterThan(1);
  });
});

describe("l'organe par defaut est « tous » : aucune requete ne change sans argument", () => {
  it("les requetes sans organe valent les requetes en strate `all`", () => {
    expect(getAssociationsForAllele(SHOWCASE)).toEqual(getAssociationsForAllele(SHOWCASE, ALL_ORGANS));
    expect(getAssociationsForOutcome("ABMR")).toEqual(getAssociationsForOutcome("ABMR", ALL_ORGANS));
    expect(getCorpusStats()).toEqual(getCorpusStats(ALL_ORGANS));
    expect(getAssociationMatrix("2-digit")).toEqual(getAssociationMatrix("2-digit", undefined, ALL_ORGANS));
    expect(getNeighborhood(SHOWCASE, 1).nodes).toEqual(
      getNeighborhood(SHOWCASE, 1, undefined, ALL_ORGANS).nodes,
    );
    expect(getAlleleCatalog().length).toBe(getAlleleCatalog(ALL_ORGANS).length);
    expect(getOutcomeCount()).toBe(getOutcomeCount(ALL_ORGANS));
  });
});

describe("compteurs et catalogues par organe", () => {
  for (const organ of ORGAN_KEYS) {
    it(`${organ} : getCorpusStats recompte articles, phrases et associations`, () => {
      const stats = getCorpusStats(organ);
      expect(stats.nArticles).toBe(organArticles(organ));
      expect(stats.nPairMentions).toBe(
        one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM pair_mentions pm
             JOIN article_organs ao ON ao.pmid = pm.pmid AND ao.organ = ?`,
          organ,
        ).n,
      );
      expect(stats.nAssociations).toBe(
        one<{ n: number }>("SELECT COUNT(*) AS n FROM associations WHERE organ = ?", organ).n,
      );
      expect(stats.nOutcomes).toBe(
        one<{ n: number }>("SELECT COUNT(*) AS n FROM outcome_organs WHERE organ = ?", organ).n,
      );
      expect(
        Object.values(stats.associationsBySignal).reduce((a, b) => a + b, 0),
      ).toBe(stats.nAssociations);
      expect(stats.nAuthors).toBe(
        one<{ n: number }>(
          `SELECT COUNT(DISTINCT aa.author_id) AS n FROM article_authors aa
             JOIN article_organs ao ON ao.pmid = aa.pmid AND ao.organ = ?`,
          organ,
        ).n,
      );
      expect(stats.yearMin).not.toBeNull();
    });
  }

  it("getPublicationsByYear : la somme des annees est l'effectif de la strate", () => {
    for (const organ of ORGAN_KEYS) {
      const total = getPublicationsByYear(organ).reduce((s, p) => s + p.nArticles, 0);
      expect(total).toBe(organArticles(organ));
    }
  });

  it("getAlleleArticleCount / getAlleleYearCounts / getArticleCountsByHla : meme strate", () => {
    for (const organ of ORGAN_KEYS) {
      const n = getAlleleArticleCount(SHOWCASE, organ);
      const direct = one<{ n: number }>(
        `SELECT COUNT(DISTINCT hm.pmid) AS n FROM hla_mentions hm
           JOIN article_organs ao ON ao.pmid = hm.pmid AND ao.organ = ?
          WHERE hm.hla = ?`,
        organ,
        SHOWCASE,
      ).n;
      expect(n, organ).toBe(direct);
      expect(getAlleleYearCounts(SHOWCASE, organ).reduce((s, p) => s + p.n, 0)).toBe(n);
      expect(getArticleCountsByHla(organ).get(SHOWCASE) ?? 0).toBe(n);
    }
  });

  it("la ventilation « Par organe » d'un allele et d'une complication = les comptes de strate", () => {
    const counts = getAlleleOrganCounts(SHOWCASE);
    expect(counts.map((c) => c.organ)).toEqual(ORGAN_KEYS);
    for (const c of counts) {
      expect(c.nArticles).toBe(getAlleleArticleCount(SHOWCASE, c.organ));
    }
    const oc = getOutcomeOrganCounts("DSA");
    for (const c of oc) expect(c.nArticles).toBe(getOutcomeArticleCount("DSA", c.organ));
    // une complication propre au GCSH : jamais comptee en rein
    const gvh = getOutcomeOrganCounts("chronic_gvhd");
    expect(gvh.find((c) => c.organ === "hsct")!.nArticles).toBeGreaterThan(50);
    expect(gvh.find((c) => c.organ === "kidney")!.nArticles).toBe(0);
  });

  it("getAlleleCatalog(organ) : articles et co-occurrences marquees de la strate", () => {
    const heart = getAlleleCatalog("heart");
    const all = getAlleleCatalog();
    expect(heart.length).toBe(all.length);
    const e = heart.find((x) => x.hla === SHOWCASE)!;
    expect(e.nArticles).toBe(getAlleleArticleCount(SHOWCASE, "heart"));
    expect(e.nMarked).toBe(
      one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM associations WHERE organ = 'heart' AND hla = ? AND signal_level <> 'weak'",
        SHOWCASE,
      ).n,
    );
    // un allele peut ne pas etre cite du tout dans un petit organe
    expect(heart.filter((x) => x.nArticles > 0).length).toBeLessThan(
      all.filter((x) => x.nArticles > 0).length,
    );
  });

  it("getOutcomeCatalog(organ) : `relevant` suit le vocabulaire, les effectifs la strate", () => {
    const lung = getOutcomeCatalog(3, "lung");
    const bos = lung.find((o) => o.outcome === "bronchiolitis_obliterans")!;
    expect(bos.relevant).toBe(true);
    expect(bos.nArticles).toBe(getOutcomeArticleCount("bronchiolitis_obliterans", "lung"));
    expect(bos.nArticles).toBeGreaterThan(0);
    const gvh = lung.find((o) => o.outcome === "chronic_gvhd")!;
    expect(gvh.relevant).toBe(false);
    for (const o of lung) {
      expect(o.relevant).toBe((OUTCOME_ORGANS[o.outcome] as readonly string[]).includes("lung"));
    }
    // tous les organes : tout est pertinent
    expect(getOutcomeCatalog(3).every((o) => o.relevant)).toBe(true);
    // les alleles cites sous une complication sont ceux de la strate
    for (const t of bos.topAlleles) {
      const row = one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM associations WHERE organ = 'lung' AND hla = ? AND outcome = ?",
        t.hla,
        "bronchiolitis_obliterans",
      );
      expect(row.n).toBe(1);
    }
  });

  it("getOutcomeCount(organ) = complications applicables", () => {
    expect(getOutcomeCount("kidney")).toBe(23);
    expect(getOutcomeCount("hsct")).toBe(15);
    expect(getOutcomeCount()).toBeGreaterThan(40);
  });

  it("getOutcomesByCategory(organ) ne liste que les complications de l'organe", () => {
    const cats = getOutcomesByCategory("heart");
    const keys = cats.flatMap((c) => c.outcomes.map((o) => o.outcome));
    expect(keys.length).toBe(getOutcomeCount("heart"));
    for (const k of keys) expect(OUTCOME_ORGANS[k]).toContain("heart");
  });

  it("getLocusOverview / getSignalHighlights / getTopAuthors suivent la strate", () => {
    const overview = getLocusOverview(3, "heart");
    expect(overview.length).toBeGreaterThan(3);
    for (const l of overview) {
      for (const a of l.topAlleles) {
        expect(getAlleleArticleCount(a.hla, "heart")).toBeGreaterThan(0);
      }
    }
    const hi = getSignalHighlights({ organ: "hsct", limit: 100 });
    expect(hi.length).toBeGreaterThan(0);
    for (const h of hi) {
      const row = one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM associations WHERE organ = 'hsct' AND hla = ? AND outcome = ?",
        h.hla,
        h.outcome,
      );
      expect(row.n).toBe(1);
    }
    const authors = getTopAuthors(5, "liver");
    expect(authors.length).toBe(5);
    expect(authors[0].nPublications).toBeLessThanOrEqual(
      getTopAuthors(1)[0].nPublications,
    );
  });
});

describe("matrice, graphe et pieces par organe", () => {
  it("getAssociationMatrix(organ) : colonnes = complications de l'organe, cases = la strate", () => {
    const m = getAssociationMatrix("2-digit", undefined, "heart");
    expect(m.organ).toBe("heart");
    const cols = new Set(m.outcomes.map((o) => o.outcome));
    for (const c of cols) expect(OUTCOME_ORGANS[c]).toContain("heart");
    expect(cols.size).toBe(getOutcomeCount("heart"));
    // lignes : alleles cites dans l'organe seulement
    for (const a of m.alleles) expect(getAlleleArticleCount(a.hla, "heart")).toBeGreaterThan(0);
    const all = getAssociationMatrix("2-digit");
    expect(m.alleles.length).toBeLessThan(all.alleles.length);
    // chaque case est la ligne `associations` de la strate
    for (const c of m.cells.slice(0, 40)) {
      const r = one<{ n_cooccurrence: number; signal_level: string }>(
        "SELECT n_cooccurrence, signal_level FROM associations WHERE organ = 'heart' AND hla = ? AND outcome = ?",
        c.hla,
        c.outcome,
      );
      expect(c.nCooccurrence).toBe(r.n_cooccurrence);
      expect(c.signalLevel).toBe(r.signal_level);
    }
    // les paires d'autres organes (articles multi-organes) sont comptees, pas perdues
    const inStratum = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM associations a JOIN hla_entities h ON h.hla = a.hla
        WHERE a.organ = 'heart' AND h.resolution = '2-digit'`,
    ).n;
    expect(m.cells.length + (m.nCellsOutsideOrgan ?? 0)).toBe(inStratum);
  });

  it("getAssociationMatrix 4-digit par locus, en strate", () => {
    const m = getAssociationMatrix("4-digit", "DRB1", "lung");
    expect(m.locus).toBe("DRB1");
    for (const a of m.alleles) expect(a.locus).toBe("DRB1");
    expect(m.loci!.length).toBeGreaterThan(2);
  });

  it("getNeighborhood(organ) : les aretes sont celles de la strate", () => {
    const g = getNeighborhood(SHOWCASE, 1, undefined, "liver");
    expect(g.center!.nMentions).toBeGreaterThan(0);
    const rows = getAssociationsForAllele(SHOWCASE, "liver");
    expect(g.edges.length).toBe(rows.length);
    for (const e of g.edges) {
      const r = rows.find((x) => x.outcome === e.target)!;
      expect(r.nCooccurrence).toBe(e.nCooccurrence);
      expect(e.signalLevel).toBe(r.signalLevel);
    }
    // un centre absent de la strate : le centre existe, aucune arete
    const empty = getNeighborhood("HLA-A*30:04", 1, undefined, "intestine");
    expect(empty.center).not.toBeNull();
  });

  it("getDefaultGraphCenter(organ) existe pour chaque strate", () => {
    for (const organ of ORGAN_KEYS) {
      const c = getDefaultGraphCenter(organ);
      expect(c, organ).toBeTruthy();
      expect(getAssociationsForAllele(c!, organ).length).toBeGreaterThan(0);
    }
  });

  it("getPairMentions(organ) : seulement les phrases des articles de l'organe", () => {
    const all = getPairMentions(SHOWCASE, "DSA");
    const heart = getPairMentions(SHOWCASE, "DSA", "heart");
    expect(heart.length).toBeLessThan(all.length);
    expect(heart.length).toBe(getAssociationsForAllele(SHOWCASE, "heart").find((r) => r.outcome === "DSA")!.nCooccurrence);
    for (const m of heart) expect(getArticleOrgans(m.pmid)).toContain("heart");
  });

  it("getTopArticlesForAllele(organ) ne rend que des articles de l'organe, avec leurs organes", () => {
    const top = getTopArticlesForAllele(SHOWCASE, 5, "liver");
    expect(top.length).toBeGreaterThan(0);
    for (const a of top) {
      expect(a.organs).toContain("liver");
      expect(a.organs).toEqual(getArticleOrgans(a.pmid));
    }
  });

  it("l'auteur : melange d'organes et publications filtrees", () => {
    const author = getTopAuthors(1)[0];
    const mix = getAuthorOrganMix(author.authorId);
    expect(mix.map((m) => m.organ)).toEqual(ORGAN_KEYS);
    // la somme du melange >= publications (articles multi-organes)
    expect(mix.reduce((n, m) => n + m.nArticles, 0)).toBeGreaterThanOrEqual(author.nPublications);
    for (const m of mix) {
      expect(getAuthorPublications(author.authorId, m.organ).length).toBe(m.nArticles);
    }
    // un laboratoire a un organe de predilection : le melange n'est pas uniforme
    const top = Math.max(...mix.map((m) => m.nArticles));
    expect(top / author.nPublications).toBeGreaterThan(0.4);
  });
});

describe("serotypes par organe", () => {
  it("getSerotypeCatalog(organ) : articles distincts de la strate", () => {
    const dr15 = getSerotypeCatalog("kidney").find((s) => s.serotypeId === "DR15")!;
    const direct = one<{ n: number }>(
      `SELECT COUNT(DISTINCT hm.pmid) AS n FROM serotype_alleles sa
         JOIN hla_mentions hm ON hm.hla = sa.hla
         JOIN article_organs ao ON ao.pmid = hm.pmid AND ao.organ = 'kidney'
        WHERE sa.serotype_id = 'DR15'`,
    ).n;
    expect(dr15.nArticles).toBe(direct);
    expect(getSerotypeCatalog().find((s) => s.serotypeId === "DR15")!.nArticles).toBeGreaterThan(
      direct,
    );
  });

  it("getSerotypeOrganCounts / membres / complications suivent la strate", () => {
    const counts = getSerotypeOrganCounts("DR15");
    expect(counts.map((c) => c.organ)).toEqual(ORGAN_KEYS);
    for (const c of counts) {
      const cat = getSerotypeCatalog(c.organ).find((s) => s.serotypeId === "DR15")!;
      expect(cat.nArticles).toBe(c.nArticles);
    }
    const members = getSerotypeMembers("DR15", "hsct");
    for (const m of members) expect(m.nArticles).toBe(getAlleleArticleCount(m.hla, "hsct"));
    const out = getSerotypeOutcomes("DR15", "hsct");
    for (const o of out) expect(o.nArticles).toBeGreaterThan(0);
  });
});

describe("recherche par organe", () => {
  it("les resultats « article » et « auteur » sont limites a l'organe", () => {
    const hits = searchEntities("transplantation", 25, "heart");
    const articles = hits.filter((h) => h.entityType === "article");
    expect(articles.length).toBeGreaterThan(0);
    for (const h of articles) expect(getArticleOrgans(h.entityId)).toContain("heart");
  });

  it("les effectifs affiches sont ceux de la strate, avec le nom de l'organe", () => {
    const hits = searchEntities("DR15", 25, "liver");
    const group = hits.find((h) => h.entityId === "HLA-DRB1*15")!;
    expect(group.nArticles).toBe(getAlleleArticleCount("HLA-DRB1*15", "liver"));
    expect(group.detail).toContain("Foie");
    const all = searchEntities("DR15").find((h) => h.entityId === "HLA-DRB1*15")!;
    expect(all.detail).not.toContain("Foie");
    expect(all.nArticles!).toBeGreaterThan(group.nArticles!);
  });

  it("une complication est annotee de son effectif dans la strate", () => {
    const hits = searchEntities("rejet", 25, "kidney").filter((h) => h.entityType === "outcome");
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.nArticles).toBe(getOutcomeArticleCount(h.entityId, "kidney"));
    }
  });

  it("sans organe, la recherche est inchangee", () => {
    expect(searchEntities("A*02")).toEqual(searchEntities("A*02", 25, ALL_ORGANS));
  });
});
