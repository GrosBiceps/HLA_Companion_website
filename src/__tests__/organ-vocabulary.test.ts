import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  CATEGORIES,
  OUTCOME_LABELS,
  OUTCOME_ORGANS,
  outcomeAppliesToOrgan,
  outcomesForOrgan,
} from "../lib/labels";
import { ALL_ORGANS, ORGANS } from "../lib/organ";
import { CATEGORY_COLORS, ORGAN_COLORS, ORGAN_SHAPES, SIGNAL_COLORS } from "../lib/theme";
import { getDb } from "../lib/db";

/**
 * SYNCHRONISATION Python <-> TypeScript du vocabulaire.
 *
 * `scripts/labels.py` ecrit les cles (organes, complications) dans la base ;
 * `src/lib/labels.ts` et `src/lib/organ.ts` les traduisent a l'ecran. Une
 * divergence se manifesterait par un libelle manquant (ou pire, une cle brute
 * affichee). On charge donc le module Python LUI-MEME (pas une copie) et on le
 * compare entree par entree.
 */

interface PyVocabulary {
  categories: string[];
  outcomes: Record<string, [string, string]>;
  outcomeOrgans: Record<string, string[]>;
  organs: [string, string, string, string][];
  allOrgans: string;
}

function loadPython(): PyVocabulary {
  const code = [
    "import sys, json",
    "sys.path.insert(0, 'scripts')",
    "import labels as L",
    "print(json.dumps({",
    "  'categories': L.CATEGORIES,",
    "  'outcomes': {k: list(v) for k, v in L.OUTCOME_LABELS.items()},",
    "  'outcomeOrgans': {k: list(v) for k, v in L.OUTCOME_ORGANS.items()},",
    "  'organs': [list(o) for o in L.ORGANS],",
    "  'allOrgans': L.ALL_ORGANS,",
    "}, ensure_ascii=False))",
  ].join("\n");
  for (const python of ["python3", "python"]) {
    try {
      const out = execFileSync(python, ["-c", code], {
        cwd: path.resolve(__dirname, "..", ".."),
        encoding: "utf-8",
      });
      return JSON.parse(out) as PyVocabulary;
    } catch {
      /* essai suivant */
    }
  }
  throw new Error("Python introuvable : impossible de comparer les vocabulaires");
}

const py = loadPython();

describe("vocabulaire des organes : labels.py et organ.ts", () => {
  it("memes organes, memes libelles, memes slugs, meme ordre", () => {
    expect(ORGANS.map((o) => [o.key, o.label, o.shortLabel, o.slug])).toEqual(py.organs);
  });

  it("meme sentinelle de strate", () => {
    expect(ALL_ORGANS).toBe(py.allOrgans);
  });
});

describe("vocabulaire des complications : labels.py et labels.ts", () => {
  it("memes categories, dans le meme ordre", () => {
    expect([...CATEGORIES]).toEqual(py.categories);
  });

  it("memes cles, memes libelles accentues, memes categories", () => {
    expect(Object.keys(OUTCOME_LABELS)).toEqual(Object.keys(py.outcomes));
    for (const [key, [label, category]] of Object.entries(py.outcomes)) {
      expect(OUTCOME_LABELS[key], key).toEqual({ label, category });
    }
  });

  it("memes organes d'application pour chaque complication", () => {
    expect(Object.keys(OUTCOME_ORGANS)).toEqual(Object.keys(py.outcomeOrgans));
    for (const [key, organs] of Object.entries(py.outcomeOrgans)) {
      expect([...OUTCOME_ORGANS[key]], key).toEqual(organs);
    }
  });

  it("chaque complication a un libelle, une categorie connue et au moins un organe", () => {
    for (const [key, entry] of Object.entries(OUTCOME_LABELS)) {
      expect(entry.label, key).toBeTruthy();
      expect(CATEGORIES as readonly string[], key).toContain(entry.category);
      expect(OUTCOME_ORGANS[key].length, key).toBeGreaterThan(0);
      // un libelle n'est jamais la cle brute, ni ne contient de soulignement
      expect(entry.label).not.toBe(key);
      expect(entry.label).not.toContain("_");
    }
  });

  it("outcomesForOrgan / outcomeAppliesToOrgan sont coherents", () => {
    for (const organ of ["kidney", "liver", "heart", "lung", "hsct", "pancreas", "intestine"] as const) {
      const list = outcomesForOrgan(organ);
      expect(list.length).toBeGreaterThanOrEqual(12);
      for (const key of list) expect(outcomeAppliesToOrgan(key, organ)).toBe(true);
    }
    expect(outcomesForOrgan("kidney").length).toBe(23);
    expect(outcomeAppliesToOrgan("bronchiolitis_obliterans", "kidney")).toBe(false);
    expect(outcomeAppliesToOrgan("bronchiolitis_obliterans", "lung")).toBe(true);
    expect(outcomeAppliesToOrgan("inconnue", "lung")).toBe(false);
  });

  it("les complications specifiques de chaque organe existent bien", () => {
    expect(outcomesForOrgan("heart")).toContain("cardiac_allograft_vasculopathy");
    expect(outcomesForOrgan("heart")).toContain("primary_graft_dysfunction");
    expect(outcomesForOrgan("lung")).toContain("chronic_lung_allograft_dysfunction");
    expect(outcomesForOrgan("lung")).toContain("bronchiolitis_obliterans");
    expect(outcomesForOrgan("liver")).toContain("liver_chronic_rejection");
    expect(outcomesForOrgan("liver")).toContain("hepatitis_recurrence");
    expect(outcomesForOrgan("hsct")).toEqual(
      expect.arrayContaining(["acute_gvhd", "chronic_gvhd", "disease_relapse", "engraftment_failure", "hsct_graft_rejection"]),
    );
    expect(outcomesForOrgan("pancreas")).toContain("pancreas_graft_thrombosis");
    expect(outcomesForOrgan("kidney")).not.toContain("acute_gvhd");
  });
});

describe("la base construite suit le vocabulaire", () => {
  it("la table organs porte les memes libelles que organ.ts", () => {
    const rows = getDb()
      .prepare("SELECT organ, label, short_label, slug FROM organs ORDER BY sort_order")
      .all() as { organ: string; label: string; short_label: string; slug: string }[];
    expect(rows.map((r) => [r.organ, r.label, r.short_label, r.slug])).toEqual(py.organs);
  });

  it("outcomes porte les libelles et categories de labels.ts", () => {
    const rows = getDb()
      .prepare("SELECT outcome, label, category FROM outcomes")
      .all() as { outcome: string; label: string; category: string }[];
    expect(rows.length).toBeGreaterThan(40);
    for (const r of rows) {
      expect(OUTCOME_LABELS[r.outcome], r.outcome).toEqual({
        label: r.label,
        category: r.category,
      });
    }
  });

  it("outcome_organs reprend OUTCOME_ORGANS", () => {
    const rows = getDb()
      .prepare("SELECT outcome, organ FROM outcome_organs")
      .all() as { outcome: string; organ: string }[];
    expect(rows.length).toBeGreaterThan(100);
    for (const r of rows) expect(OUTCOME_ORGANS[r.outcome]).toContain(r.organ);
    const by = new Map<string, string[]>();
    for (const r of rows) by.set(r.outcome, [...(by.get(r.outcome) ?? []), r.organ]);
    for (const [outcome, organs] of by) {
      expect(organs.sort(), outcome).toEqual([...OUTCOME_ORGANS[outcome]].sort());
    }
  });
});

describe("couleurs d'organes (theme.ts)", () => {
  const hex = (c: { light: string }) => c.light.toLowerCase();

  it("sept teintes distinctes entre elles", () => {
    const lights = Object.values(ORGAN_COLORS).map(hex);
    expect(new Set(lights).size).toBe(7);
    const darks = Object.values(ORGAN_COLORS).map((c) => c.dark.toLowerCase());
    expect(new Set(darks).size).toBe(7);
  });

  it("aucune teinte d'organe ne reprend celle d'un niveau de signal ni d'une categorie", () => {
    const taken = new Set([
      ...Object.values(SIGNAL_COLORS).flatMap((c) => [hex(c), c.dark.toLowerCase()]),
      ...Object.values(CATEGORY_COLORS).flatMap((c) => [hex(c), c.dark.toLowerCase()]),
    ]);
    for (const [organ, c] of Object.entries(ORGAN_COLORS)) {
      expect(taken.has(hex(c)), `${organ} clair`).toBe(false);
      expect(taken.has(c.dark.toLowerCase()), `${organ} sombre`).toBe(false);
    }
  });

  it("la couleur n'est jamais seule : une forme propre a chaque organe", () => {
    const shapes = Object.entries(ORGAN_SHAPES).map(([, shape]) => shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(Object.keys(ORGAN_SHAPES).sort()).toEqual([ALL_ORGANS, ...ORGANS.map((o) => o.key)].sort());
  });
});
