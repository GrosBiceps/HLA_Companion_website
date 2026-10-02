import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_COLORS,
  CATEGORY_FALLBACK,
  CHART_NEUTRALS,
  HLA_CLASS_COLORS,
  SIGNAL_COLORS,
  hlaClassFromKey,
  type ThemeColor,
} from "../lib/theme";
import { CATEGORIES, SIGNAL_LEVELS } from "../lib/labels";

/**
 * `theme.ts` (hexadecimal, pour les moteurs qui ne lisent pas le CSS) et
 * `globals.css` (variables RGB, pour le navigateur) decrivent les MEMES
 * couleurs. Ce test empeche qu'elles divergent en silence : un graphique
 * exporte en PNG aurait sinon d'autres teintes que la page.
 */

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf-8");

function block(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open, i);
  }
  throw new Error("bloc non ferme");
}

const lightBlock = block(css, ":root {");
const darkBlock = block(css, "@media (prefers-color-scheme: dark)");

function varValue(scope: string, token: string): string | null {
  const m = scope.match(new RegExp(`--${token}:\\s*([0-9]+ [0-9]+ [0-9]+);`));
  return m ? m[1] : null;
}

function hexToTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const ALL: ThemeColor[] = [
  ...Object.values(SIGNAL_COLORS),
  ...Object.values(CATEGORY_COLORS),
  CATEGORY_FALLBACK,
  ...Object.values(HLA_CLASS_COLORS),
  ...Object.values(CHART_NEUTRALS),
];

describe("jetons de couleur", () => {
  it.each(ALL.map((c) => [c.token, c]))(
    "%s : theme.ts et globals.css concordent (clair et sombre)",
    (_token, c) => {
      expect(varValue(lightBlock, c.token)).toBe(hexToTriplet(c.light));
      expect(varValue(darkBlock, c.token)).toBe(hexToTriplet(c.dark));
      expect(c.css).toBe(`rgb(var(--${c.token}))`);
    },
  );

  it("couvre les cinq niveaux de signal et les sept categories", () => {
    for (const level of SIGNAL_LEVELS) expect(SIGNAL_COLORS[level]).toBeDefined();
    for (const cat of CATEGORIES) expect(CATEGORY_COLORS[cat]).toBeDefined();
  });

  it("l'echelle de signal est monotone en luminance dans les deux themes", () => {
    const lum = (hex: string) => {
      const [r, g, b] = hexToTriplet(hex).split(" ").map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const order = ["strong", "clear", "moderate", "weak"] as const;
    const light = order.map((l) => lum(SIGNAL_COLORS[l].light));
    const dark = order.map((l) => lum(SIGNAL_COLORS[l].dark));
    // Clair : du plus fonce au plus pale. Sombre : du plus clair au plus eteint.
    for (let i = 1; i < order.length; i++) {
      expect(light[i]).toBeGreaterThan(light[i - 1]);
      expect(dark[i]).toBeLessThan(dark[i - 1]);
    }
  });
});

describe("hlaClassFromKey", () => {
  it.each([
    ["HLA-DQB1*02:01", "II"],
    ["HLA-DRB1*15", "II"],
    ["HLA-DPB1", "II"],
    ["HLA-A*02:01", "I"],
    ["HLA-B*57", "I"],
    ["HLA-C", "I"],
    ["HLA-ZZZ", null],
  ])("%s → %s", (key, expected) => {
    expect(hlaClassFromKey(key)).toBe(expected);
  });
});
