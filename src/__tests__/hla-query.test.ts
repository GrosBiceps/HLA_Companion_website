import { describe, expect, it } from "vitest";
import {
  canonicalAlleleKey,
  normalizeSerotypeKey,
  parseAlleleQuery,
  serotypeKeys,
} from "../lib/hla-query";

describe("parseAlleleQuery", () => {
  it.each([
    ["A*02", "A", "02", null],
    ["a02", "A", "02", null],
    ["HLA-A*02", "A", "02", null],
    ["b27", "B", "27", null],
    ["a*2", "A", "02", null],
    ["DQB1*02:01", "DQB1", "02", "01"],
    ["dqb1 02 01", "DQB1", "02", "01"],
    ["DQB1*0201", "DQB1", "02", "01"],
    ["dqb10201", "DQB1", "02", "01"],
    ["HLA-DRB1*15:01", "DRB1", "15", "01"],
    ["drb1-15-01", "DRB1", "15", "01"],
    ["DPB1 04 01", "DPB1", "04", "01"],
    ["A*02:01:01:01", "A", "02", "01"],
  ])("lit %s", (raw, locus, group, field) => {
    const q = parseAlleleQuery(raw);
    expect(q).not.toBeNull();
    expect(q!.locus).toBe(locus);
    expect(q!.group).toBe(group);
    expect(q!.field).toBe(field);
  });

  it("reconnait un locus seul", () => {
    expect(parseAlleleQuery("DRB1")).toMatchObject({ locus: "DRB1", group: null });
    expect(parseAlleleQuery("drb1*")).toMatchObject({ locus: "DRB1", group: null });
    expect(parseAlleleQuery("hla-dqb1")).toMatchObject({ locus: "DQB1", group: null });
  });

  it("signale un second champ incomplet", () => {
    expect(parseAlleleQuery("A*02:0")).toMatchObject({ field: "0", fieldPartial: true });
    expect(parseAlleleQuery("A*02:01")).toMatchObject({ fieldPartial: false });
  });

  it("distingue lecture allelique sure et graphie ambigue", () => {
    expect(parseAlleleQuery("A*02")!.explicit).toBe(true);
    expect(parseAlleleQuery("a02")!.explicit).toBe(true); // zero de tete
    expect(parseAlleleQuery("A2")!.explicit).toBe(false); // serotype A2 ?
    expect(parseAlleleQuery("b27")!.explicit).toBe(false);
    expect(parseAlleleQuery("DRB1 15")!.explicit).toBe(true); // jamais un serotype
  });

  it.each(["", "rejet", "abmr", "dr15", "dq2", "cw7", "12345678", "a*x1", "a*02:01x"])(
    "ne prend pas %j pour un allele",
    (raw) => {
      expect(parseAlleleQuery(raw)).toBeNull();
    },
  );
});

describe("canonicalAlleleKey", () => {
  it("rend la cle IPD-IMGT de toute graphie complete", () => {
    expect(canonicalAlleleKey("dqb1 02 01")).toBe("HLA-DQB1*02:01");
    expect(canonicalAlleleKey("a*2")).toBe("HLA-A*02");
    expect(canonicalAlleleKey("B*27:05")).toBe("HLA-B*27:05");
    expect(canonicalAlleleKey("A*02:")).toBe("HLA-A*02");
    expect(canonicalAlleleKey("DRB1")).toBeNull();
    expect(canonicalAlleleKey("A*02:0")).toBeNull();
  });
});

describe("serotypeKeys", () => {
  it.each([
    ["DR15", "DR15"],
    ["DR 15", "DR15"],
    ["dr-15", "DR15"],
    ["dr15", "DR15"],
    ["Cw7", "CW7"],
    ["B27", "B27"],
    ["HLA-DQ2", "DQ2"],
  ])("normalise %s", (raw, key) => {
    expect(normalizeSerotypeKey(raw)).toBe(key);
    expect(serotypeKeys(raw)).toContain(key);
  });

  it("ajoute les alias Cw et DPw", () => {
    expect(serotypeKeys("C7")).toEqual(["C7", "CW7"]);
    expect(serotypeKeys("dp4")).toEqual(["DP4", "DPW4"]);
  });

  it("refuse ce qui n'a pas la forme d'un serotype", () => {
    expect(serotypeKeys("A*02:01")).toEqual([]);
    expect(serotypeKeys("12345678")).toEqual([]);
    expect(serotypeKeys("")).toEqual([]);
  });
});
