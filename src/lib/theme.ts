/**
 * Correspondances de couleurs partagees — LA source unique pour les
 * graphiques, cartes et matrices.
 *
 * DEUX FACONS DE CONSOMMER UNE COULEUR :
 *
 *  1. En SVG/HTML rendu par le navigateur : utiliser `.css` (ex.
 *     `fill={SIGNAL_COLORS.strong.css}`), qui vaut `rgb(var(--signal-strong))`.
 *     La couleur suit alors automatiquement le mode sombre, sans JS.
 *  2. Pour un moteur qui ne lit pas le CSS (canvas, WebGL, export PNG) :
 *     utiliser `.light` / `.dark` (hexadecimal), et choisir selon
 *     `matchMedia("(prefers-color-scheme: dark)")`.
 *
 * Les valeurs hexadecimales DOIVENT rester identiques aux variables de
 * `src/app/globals.css` : `src/__tests__/theme.test.ts` compare les deux.
 *
 * Ce module ne contient que des donnees : importable cote serveur comme cote
 * client, sans dependance.
 */

import type { SignalLevel } from "./types";
import { CATEGORIES, type Category } from "./labels";

export interface ThemeColor {
  /** Nom de la variable CSS, sans `--`. */
  token: string;
  /** Valeur CSS qui suit le theme : `rgb(var(--token))`. */
  css: string;
  /** Hexadecimal du theme clair. */
  light: string;
  /** Hexadecimal du theme sombre. */
  dark: string;
}

function color(token: string, light: string, dark: string): ThemeColor {
  return { token, css: `rgb(var(--${token}))`, light, dark };
}

/** `rgb(var(--token) / alpha)` — pour un remplissage translucide. */
export function cssAlpha(c: ThemeColor, alpha: number): string {
  return `rgb(var(--${c.token}) / ${alpha})`;
}

// ── Signal ─────────────────────────────────────────────────────────────────

/**
 * Echelle ORDINALE des cinq niveaux de signal.
 *
 * `strong → clear → moderate → weak` : sequentiel bleu, luminance monotone
 * (le plus fort est le plus contraste dans les deux themes). `inverse` est
 * hors echelle, en orange : c'est un signal d'une AUTRE NATURE (moins de
 * co-mentions qu'attendu), pas un echelon sous `weak`. La paire bleu/orange
 * reste distinguable en deuteranopie, protanopie et tritanopie.
 *
 * Une couleur de signal n'est JAMAIS employee seule : elle accompagne le
 * libelle (`SIGNAL_DISPLAY.label`) ou une legende.
 */
export const SIGNAL_COLORS: Record<SignalLevel, ThemeColor> = {
  inverse: color("signal-inverse", "#C0561A", "#F29A5C"),
  strong: color("signal-strong", "#1D3F8F", "#A9C1FF"),
  clear: color("signal-clear", "#3A72CF", "#6E97EE"),
  moderate: color("signal-moderate", "#8AAAD8", "#4A6CA8"),
  weak: color("signal-weak", "#B7BDC9", "#485063"),
};

/**
 * Rang ordinal pour encoder une intensite (epaisseur, taille) : 4 = fort,
 * 1 = faible. `inverse` vaut 3 : il est marque statistiquement, mais
 * l'encodage doit le distinguer par la COULEUR, pas par le rang.
 */
export const SIGNAL_RANK: Record<SignalLevel, number> = {
  strong: 4,
  inverse: 3,
  clear: 3,
  moderate: 2,
  weak: 1,
};

/** Classes Tailwind statiques (le JIT doit les voir ecrites en entier). */
export const SIGNAL_CLASSES: Record<
  SignalLevel,
  { bg: string; text: string; border: string; soft: string }
> = {
  inverse: {
    bg: "bg-signal-inverse",
    text: "text-signal-inverse",
    border: "border-signal-inverse",
    soft: "bg-signal-inverse/10",
  },
  strong: {
    bg: "bg-signal-strong",
    text: "text-signal-strong",
    border: "border-signal-strong",
    soft: "bg-signal-strong/10",
  },
  clear: {
    bg: "bg-signal-clear",
    text: "text-signal-clear",
    border: "border-signal-clear",
    soft: "bg-signal-clear/10",
  },
  moderate: {
    bg: "bg-signal-moderate",
    text: "text-signal-moderate",
    border: "border-signal-moderate",
    soft: "bg-signal-moderate/15",
  },
  weak: {
    bg: "bg-signal-weak",
    text: "text-signal-weak",
    border: "border-signal-weak",
    soft: "bg-signal-weak/20",
  },
};

// ── Categories cliniques ───────────────────────────────────────────────────

/**
 * Echelle CATEGORIELLE des 7 categories cliniques (`CATEGORIES`), dans
 * l'ordre clinique. Aucune n'est bleue ni orange : elles cohabitent avec
 * l'echelle de signal dans le graphe (noeuds = categorie, liens = signal).
 */
export const CATEGORY_COLORS: Record<Category, ThemeColor> = {
  Rejet: color("cat-rejet", "#D1495B", "#F0707F"),
  Immunisation: color("cat-immunisation", "#7B5CC4", "#A88BEB"),
  "Fonction du greffon": color("cat-greffon", "#1C93A8", "#4CC0D4"),
  Infection: color("cat-infection", "#3D9A50", "#6CC47E"),
  Neoplasie: color("cat-neoplasie", "#C0508F", "#E27DB6"),
  Metabolique: color("cat-metabolique", "#C29318", "#E2B73F"),
  Recidive: color("cat-recidive", "#8C6A4E", "#C09A7A"),
};

/** Repli pour une categorie inconnue de `CATEGORIES` (referentiel elargi). */
export const CATEGORY_FALLBACK: ThemeColor = color(
  "cat-other",
  "#7A8194",
  "#9AA1B3",
);

/** Couleur d'une categorie quelconque, avec repli neutre. */
export function categoryColor(category: string | null | undefined): ThemeColor {
  return (
    (CATEGORY_COLORS as Record<string, ThemeColor>)[category ?? ""] ??
    CATEGORY_FALLBACK
  );
}

/** Classes Tailwind statiques par categorie (pastille, texte). */
export const CATEGORY_CLASSES: Record<Category, { bg: string; text: string }> =
  {
    Rejet: { bg: "bg-cat-rejet", text: "text-cat-rejet" },
    Immunisation: { bg: "bg-cat-immunisation", text: "text-cat-immunisation" },
    "Fonction du greffon": { bg: "bg-cat-greffon", text: "text-cat-greffon" },
    Infection: { bg: "bg-cat-infection", text: "text-cat-infection" },
    Neoplasie: { bg: "bg-cat-neoplasie", text: "text-cat-neoplasie" },
    Metabolique: { bg: "bg-cat-metabolique", text: "text-cat-metabolique" },
    Recidive: { bg: "bg-cat-recidive", text: "text-cat-recidive" },
  };

export function categoryClasses(category: string | null | undefined): {
  bg: string;
  text: string;
} {
  return (
    (CATEGORY_CLASSES as Record<string, { bg: string; text: string }>)[
      category ?? ""
    ] ?? { bg: "bg-cat-other", text: "text-cat-other" }
  );
}

/**
 * Libelles ACCENTUES des categories, pour l'affichage. Les cles de
 * `CATEGORIES` sont sans accents (miroir du pipeline Python) ; l'ecran, lui,
 * doit ecrire « Néoplasie ». Ne jamais s'en servir comme cle de donnees.
 */
export const CATEGORY_DISPLAY: Record<Category, string> = {
  Rejet: "Rejet",
  Immunisation: "Immunisation",
  "Fonction du greffon": "Fonction du greffon",
  Infection: "Infection",
  Neoplasie: "Néoplasie",
  Metabolique: "Métabolique",
  Recidive: "Récidive",
};

export function categoryDisplay(category: string): string {
  return (CATEGORY_DISPLAY as Record<string, string>)[category] ?? category;
}

export { CATEGORIES };

// ── Classes HLA ────────────────────────────────────────────────────────────

/** Classe I et II : meme famille indigo, separees par la luminance. */
export const HLA_CLASS_COLORS: Record<"I" | "II", ThemeColor> = {
  I: color("hla-class-1", "#3A439F", "#8E99F0"),
  II: color("hla-class-2", "#7C88DD", "#C3CAF8"),
};

/**
 * Classe HLA deduite de la cle IPD-IMGT, quand la donnee ne la porte pas
 * (ex. noeuds du graphe) : loci D* (DR, DQ, DP) = classe II ; A, B, C (et
 * les loci non classiques E, F, G) = classe I. `null` si non reconnu.
 */
export function hlaClassFromKey(hla: string): "I" | "II" | null {
  const locus = hla.replace(/^HLA-/, "").split(/[*\s]/)[0] ?? "";
  if (/^D[RQPMO]/i.test(locus)) return "II";
  if (/^[ABCEFG]$/i.test(locus) || /^[ABCEFG]\d/i.test(locus)) return "I";
  return null;
}

/** Couleur d'une classe HLA telle que stockee (`"I"`, `"II"`, autre). */
export function hlaClassColor(hlaClass: string | null | undefined): ThemeColor {
  return hlaClass === "II" ? HLA_CLASS_COLORS.II : HLA_CLASS_COLORS.I;
}

// ── Neutres utiles aux graphiques ─────────────────────────────────────────

export const CHART_NEUTRALS = {
  fg: color("fg", "#161A2E", "#E7E9F0"),
  fgMuted: color("fg-muted", "#454B60", "#B0B5C4"),
  fgSubtle: color("fg-subtle", "#64697C", "#8B91A3"),
  line: color("line", "#E3E0D8", "#272D3A"),
  lineStrong: color("line-strong", "#CBC6BA", "#3A4252"),
  surface: color("surface", "#FFFFFF", "#151922"),
  canvas: color("canvas", "#F7F6F2", "#0D1017"),
  primary: color("primary", "#2F3681", "#9AA6F5"),
  accent: color("accent", "#0F766E", "#3CC8B4"),
} as const;
