import { describe, expect, it } from "vitest";
import { searchEntities } from "../lib/queries";
import type { SearchHit } from "../lib/types";

const ids = (hits: SearchHit[], type: SearchHit["entityType"]) =>
  hits.filter((h) => h.entityType === type).map((h) => h.entityId);

describe("recherche : alleles 2-digit -> 4-digit", () => {
  it.each(["A*02", "a02", "HLA-A*02", "A 02"])(
    "« %s » rend le groupe A*02 et ses alleles 4-digit",
    (q) => {
      const hits = searchEntities(q);
      expect(hits[0]).toMatchObject({
        entityType: "allele",
        entityId: "HLA-A*02",
        badge: "2-digit",
      });
      const children = hits.filter((h) => h.childOf === "HLA-A*02");
      expect(children.length).toBeGreaterThanOrEqual(5);
      expect(children.every((h) => h.badge === "4-digit")).toBe(true);
      expect(children.every((h) => h.entityId.startsWith("HLA-A*02:"))).toBe(true);
      // du plus cite au moins cite
      const n = children.map((h) => h.nArticles ?? 0);
      expect([...n].sort((a, b) => b - a)).toEqual(n);
    },
  );

  it.each(["DQB1*02:01", "DQB1 02 01", "dqb1*0201", "dqb10201", "HLA-DQB1*02:01"])(
    "« %s » retrouve HLA-DQB1*02:01 en tete",
    (q) => {
      const hits = searchEntities(q);
      expect(hits[0]).toMatchObject({
        entityId: "HLA-DQB1*02:01",
        badge: "4-digit",
      });
      // le groupe parent et le serotype correspondant sont proposes
      expect(ids(hits, "allele")).toContain("HLA-DQB1*02");
      expect(ids(hits, "serotype")).toContain("DQ2");
    },
  );

  it("un second champ incomplet liste les 4-digit qui commencent ainsi", () => {
    const hits = searchEntities("A*02:0");
    const kids = hits.filter((h) => h.childOf).map((h) => h.entityId);
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.every((k) => k.startsWith("HLA-A*02:0"))).toBe(true);
  });

  it("un locus rend le locus puis ses groupes les plus cites", () => {
    const hits = searchEntities("DRB1");
    expect(hits[0]).toMatchObject({ entityId: "DRB1", badge: "Locus" });
    expect(hits.filter((h) => h.childOf === "DRB1").length).toBeGreaterThan(3);
  });

  it("un locus incomplet propose les loci voisins", () => {
    expect(ids(searchEntities("dq"), "allele")).toEqual(
      expect.arrayContaining(["DQA1", "DQB1"]),
    );
  });
});

describe("recherche : serotypes", () => {
  it.each(["DR15", "DR 15", "dr15", "dr-15", "Dr 15"])(
    "« %s » rend le serotype DR15 puis ses alleles",
    (q) => {
      const hits = searchEntities(q);
      expect(hits[0]).toMatchObject({ entityType: "serotype", entityId: "DR15" });
      expect(hits[0].badge).toBe("Sérotype");
      const members = hits.filter((h) => h.childOf === "DR15").map((h) => h.entityId);
      expect(members).toContain("HLA-DRB1*15");
      expect(members.some((m) => m.startsWith("HLA-DRB1*15:"))).toBe(true);
    },
  );

  it.each([
    ["A2", "A2"],
    ["B27", "B27"],
    ["DQ2", "DQ2"],
    ["Cw7", "Cw7"],
    ["c7", "Cw7"],
    ["DP4", "DPw4"],
    ["DR51", "DR51"],
  ])("« %s » rend le serotype %s en tete", (q, id) => {
    const hits = searchEntities(q);
    expect(hits[0]).toMatchObject({ entityType: "serotype", entityId: id });
  });

  it("« A2 » rend aussi le groupe allelique A*02 (deuxieme lecture)", () => {
    const hits = searchEntities("A2");
    expect(ids(hits, "serotype")[0]).toBe("A2");
    expect(ids(hits, "allele")).toContain("HLA-A*02");
  });

  it("une famille large rend ses specificites plus fines", () => {
    const hits = searchEntities("DR2");
    expect(hits[0]).toMatchObject({ entityId: "DR2", badge: "Famille large" });
    expect(hits.filter((h) => h.childOf === "DR2").map((h) => h.entityId)).toEqual(
      expect.arrayContaining(["DR15", "DR16"]),
    );
  });

  it("DQ8 se resout sur DQB1*03:02", () => {
    const hits = searchEntities("DQ8");
    expect(hits.filter((h) => h.childOf === "DQ8").map((h) => h.entityId)).toEqual([
      "HLA-DQB1*03:02",
    ]);
  });
});

describe("recherche : groupement et robustesse", () => {
  it("les resultats sont contigus par type", () => {
    for (const q of ["DQB1*02:01", "A2", "DR15", "rejet", "kidney"]) {
      const types = searchEntities(q).map((h) => h.entityType);
      const firstSeen: string[] = [];
      for (const t of types) if (!firstSeen.includes(t)) firstSeen.push(t);
      // un type, une fois quitte, ne reapparait pas
      const collapsed = types.filter((t, i) => i === 0 || t !== types[i - 1]);
      expect(collapsed).toEqual(firstSeen);
    }
  });

  it("une graphie allelique met les alleles avant les serotypes, et inversement", () => {
    expect(searchEntities("A*02")[0].entityType).toBe("allele");
    expect(searchEntities("A2")[0].entityType).toBe("serotype");
  });

  it("les complications et articles sont toujours trouves", () => {
    expect(ids(searchEntities("rejet"), "outcome").length).toBeGreaterThan(0);
    expect(searchEntities("kidney").some((h) => h.entityType === "article")).toBe(true);
  });

  it("ne leve jamais, quelle que soit la saisie", () => {
    for (const q of ["", "   ", "*", ":", "A*", "a*:", "\0", "\"; DROP TABLE x; --", "((", "A*02:01:01:01:99", "dr 15 15 15", "é", "x".repeat(500)]) {
      expect(() => searchEntities(q)).not.toThrow();
    }
    expect(searchEntities("")).toEqual([]);
  });

  it("reste rapide sur le corpus elargi", () => {
    searchEntities("A*02"); // amorce l'index en memoire
    const t = performance.now();
    for (const q of ["DR15", "A*02", "DQB1*02:01", "B27", "rejet", "dr"]) searchEntities(q);
    expect((performance.now() - t) / 6).toBeLessThan(25);
  });
});
