import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db";
import {
  getSerotype,
  getSerotypeCatalog,
  getSerotypeChildren,
  getSerotypeDirectAlleles,
  getSerotypeIdsByAllele,
  getSerotypeMembers,
  getSerotypeOutcomes,
  getSerotypesForAllele,
  resolveSerotypeKey,
} from "../lib/serotypes";
import { getAlleleChildSummaries } from "../lib/allele-nav";
import { getAssociationMatrix, getMatrixLoci } from "../lib/queries";
import { matchesAlleleOrSerotype } from "../lib/allele-tree";

function count(sql: string, ...params: unknown[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n;
}

// Etiquettes serologiques de la carte v1 reelle (data/legacy/carte_v1_renal.json).
const LEGACY = [
  "A23", "A24", "A25", "A28", "A30", "A66", "A68", "B13", "B18", "B27", "B35",
  "B44", "B46", "B51", "B59", "B65", "Cw14", "Cw17", "DQ2", "DQ5", "DQ6", "DQ7",
  "DQ8", "DR1", "DR11", "DR12", "DR15", "DR17", "DR51", "DR7",
];

describe("referentiel serologique", () => {
  const catalog = getSerotypeCatalog();

  it("est charge depuis la base, par locus", () => {
    expect(catalog.length).toBe(count("SELECT COUNT(*) AS n FROM serotypes"));
    expect(catalog.length).toBeGreaterThanOrEqual(100);
    expect(new Set(catalog.map((s) => s.locus))).toEqual(
      new Set(["A", "B", "C", "DR", "DQ", "DP"]),
    );
  });

  it("resout toutes les etiquettes serologiques de la carte v1", () => {
    const ids = new Set(catalog.map((s) => s.serotypeId));
    for (const label of LEGACY) expect(ids.has(label), label).toBe(true);
  });

  it("DR15 : groupe DRB1*15 et tous ses 4-digit, avec effectifs", () => {
    const members = getSerotypeMembers("DR15");
    const hlas = members.map((m) => m.hla);
    expect(hlas).toContain("HLA-DRB1*15");
    expect(hlas).toContain("HLA-DRB1*15:01");
    const children = count(
      "SELECT COUNT(*) AS n FROM hla_entities WHERE parent_hla = 'HLA-DRB1*15'",
    );
    expect(members.filter((m) => m.resolution === "4-digit").length).toBe(children);
    const group = members.find((m) => m.hla === "HLA-DRB1*15")!;
    expect(group.nArticles).toBe(
      count("SELECT COUNT(DISTINCT pmid) AS n FROM hla_mentions WHERE hla = 'HLA-DRB1*15'"),
    );
  });

  it("DR17 et DR18 se partagent DRB1*03, DR3 en est l'union", () => {
    const dr17 = getSerotypeMembers("DR17").map((m) => m.hla);
    const dr18 = getSerotypeMembers("DR18").map((m) => m.hla);
    expect(dr17).toContain("HLA-DRB1*03:01");
    expect(dr17).not.toContain("HLA-DRB1*03:02");
    expect(dr18).toContain("HLA-DRB1*03:02");
    const dr3 = new Set(getSerotypeMembers("DR3").map((m) => m.hla));
    for (const h of [...dr17, ...dr18]) expect(dr3.has(h)).toBe(true);
    expect(getSerotypeChildren("DR3").map((s) => s.serotypeId)).toEqual(["DR17", "DR18"]);
  });

  it("DQ8 ne porte que DQB1*03:02 ; B27 couvre tout le groupe B*27", () => {
    expect(getSerotypeMembers("DQ8").map((m) => m.hla)).toEqual(["HLA-DQB1*03:02"]);
    const b27 = getSerotypeMembers("B27").map((m) => m.hla);
    expect(b27).toContain("HLA-B*27");
    expect(b27).toContain("HLA-B*27:05");
  });

  it("une famille large (B5) est l'union de B51 et B52", () => {
    const b5 = new Set(getSerotypeMembers("B5").map((m) => m.hla));
    for (const id of ["B51", "B52"])
      for (const m of getSerotypeMembers(id)) expect(b5.has(m.hla)).toBe(true);
    expect(getSerotype("B51")!.broadSerotype).toBe("B5");
  });

  it("l'effectif d'articles d'un serotype compte chaque article une fois", () => {
    const dr15 = catalog.find((s) => s.serotypeId === "DR15")!;
    expect(dr15.nArticles).toBe(
      count(
        `SELECT COUNT(DISTINCT hm.pmid) AS n FROM hla_mentions hm
          WHERE hm.hla IN (SELECT hla FROM serotype_alleles WHERE serotype_id = 'DR15')`,
      ),
    );
    expect(dr15.nArticles).toBeGreaterThan(0);
  });

  it("aucun lien orphelin ; chaque serotype a au moins un allele", () => {
    expect(
      count(
        `SELECT COUNT(*) AS n FROM serotype_alleles sa
          LEFT JOIN hla_entities h ON h.hla = sa.hla WHERE h.hla IS NULL`,
      ),
    ).toBe(0);
    for (const s of catalog) expect(s.nGroups + s.nAlleles).toBeGreaterThan(0);
  });

  it("resout les graphies approchees de la route", () => {
    expect(resolveSerotypeKey("dr15")).toBe("DR15");
    expect(resolveSerotypeKey("DR 15")).toBe("DR15");
    expect(resolveSerotypeKey("c7")).toBe("Cw7");
    expect(resolveSerotypeKey("dp4")).toBe("DPw4");
    expect(resolveSerotypeKey("zz99")).toBeNull();
  });
});

describe("serotypes d'un allele", () => {
  it("un 4-digit : DQB1*02:01 -> DQ2", () => {
    expect(getSerotypesForAllele("HLA-DQB1*02:01").map((s) => s.serotypeId)).toEqual([
      "DQ2",
    ]);
  });

  it("un 4-digit herite des serotypes de son groupe, familles larges apres", () => {
    const ids = getSerotypesForAllele("HLA-DRB1*15:01").map((s) => s.serotypeId);
    expect(ids).toEqual(["DR15", "DR2"]);
  });

  it("un 2-digit reparti entre plusieurs serotypes les signale comme partiels", () => {
    const rows = getSerotypesForAllele("HLA-DRB1*03");
    const byId = new Map(rows.map((r) => [r.serotypeId, r]));
    expect(byId.get("DR17")?.partial).toBe(true);
    expect(byId.get("DR18")?.partial).toBe(true);
    expect(byId.get("DR3")?.partial).toBe(false);
  });

  it("DQ8 : DQB1*03:02 ; un locus ou une entite non allelique n'a pas de serotype", () => {
    expect(getSerotypesForAllele("HLA-DQB1*03:02").map((s) => s.serotypeId)).toContain("DQ8");
    expect(getSerotypesForAllele("DRB1")).toEqual([]);
    expect(getSerotypesForAllele("HLA-eplet")).toEqual([]);
    expect(getSerotypesForAllele("HLA-INCONNU*99")).toEqual([]);
  });

  it("l'index par allele ne donne a un groupe que ses liens propres", () => {
    const idx = getSerotypeIdsByAllele();
    expect(idx.get("HLA-DRB1*03")?.specific).toEqual([]);
    expect(idx.get("HLA-DRB1*03")?.broad).toEqual(["DR3"]);
    expect(idx.get("HLA-DRB1*03:01")?.specific).toEqual(["DR17"]);
    expect(idx.get("HLA-DRB1*15")?.specific).toEqual(["DR15"]);
  });

  it("les alleles listes explicitement alimentent l'apercu", () => {
    const direct = getSerotypeDirectAlleles();
    expect(direct.get("DQ8")).toEqual(["HLA-DQB1*03:02"]);
    expect(direct.get("DR15")).toEqual(["HLA-DRB1*15"]);
  });
});

describe("complications d'un serotype", () => {
  it("compte les articles distincts, du plus au moins cite", () => {
    const rows = getSerotypeOutcomes("DQ2");
    expect(rows.length).toBeGreaterThan(0);
    const n = rows.map((r) => r.nArticles);
    expect([...n].sort((a, b) => b - a)).toEqual(n);
    const first = rows[0];
    expect(first.nArticles).toBe(
      count(
        `SELECT COUNT(DISTINCT pmid) AS n FROM pair_mentions
          WHERE outcome = ? AND hla IN
                (SELECT hla FROM serotype_alleles WHERE serotype_id = 'DQ2')`,
        first.outcome,
      ),
    );
    // libelle clinique, jamais la cle technique
    expect(first.label).not.toBe(first.outcome);
  });
});

describe("navigation 2-digit -> 4-digit et matrice paginee", () => {
  it("les enfants d'un groupe sont tous listes, du plus au moins cite", () => {
    const kids = getAlleleChildSummaries("HLA-A*02");
    expect(kids.length).toBe(
      count("SELECT COUNT(*) AS n FROM hla_entities WHERE parent_hla = 'HLA-A*02'"),
    );
    expect(kids.length).toBeGreaterThan(10);
    const n = kids.map((k) => k.nArticles);
    expect([...n].sort((a, b) => b - a)).toEqual(n);
  });

  it("la matrice 4-digit se pagine par locus (jamais ~900 lignes d'un coup)", () => {
    const loci = getMatrixLoci("4-digit");
    expect(loci.length).toBeGreaterThanOrEqual(8);
    expect(loci[0].locus).toBe("A");
    const a = getAssociationMatrix("4-digit", "A");
    expect(a.alleles.length).toBe(loci[0].n);
    expect(a.alleles.every((x) => x.locus === "A")).toBe(true);
    expect(a.cells.every((c) => c.hla.startsWith("HLA-A*"))).toBe(true);
    const total = getAssociationMatrix("4-digit");
    expect(total.alleles.length).toBe(loci.reduce((s, l) => s + l.n, 0));
    expect(total.alleles.length).toBeGreaterThan(500);
  });
});

describe("filtre de l'index des alleles", () => {
  it("allele OU serotype ecrit en entier", () => {
    const e = { hla: "HLA-DRB1*15:01", serotypes: ["DR15"], broadSerotypes: ["DR2"] };
    expect(matchesAlleleOrSerotype(e, "DR15")).toBe(true);
    expect(matchesAlleleOrSerotype(e, "dr 15")).toBe(true);
    expect(matchesAlleleOrSerotype(e, "DR2")).toBe(true);
    expect(matchesAlleleOrSerotype(e, "DR1")).toBe(false); // « DR1 » n'est pas DR15
    expect(matchesAlleleOrSerotype(e, "drb1*15:01")).toBe(true);
    expect(matchesAlleleOrSerotype(e, "DR17")).toBe(false);
  });
});
