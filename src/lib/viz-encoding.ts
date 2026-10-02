/**
 * Encodages visuels partages par les visualisations (graphe, matrice,
 * legendes). Une seule table : la legende dessine EXACTEMENT ce que le
 * graphe dessine.
 *
 * Tout est QUALITATIF. Aucune valeur de metrique (NPMI, OR, p) n'entre ici :
 * l'epaisseur et l'opacite d'un lien derivent du NIVEAU de signal, et la
 * taille d'une case de matrice d'un EFFECTIF d'articles (compte descriptif).
 */

import type { SignalLevel } from "./types";
import {
  CATEGORY_FALLBACK,
  HLA_CLASS_COLORS,
  hlaClassFromKey,
  type ThemeColor,
} from "./theme";

/** Echelle ordinale bleue, du plus faible au plus fort (legendes). */
export const SIGNAL_SCALE: readonly SignalLevel[] = [
  "weak",
  "moderate",
  "clear",
  "strong",
];

/** Ordre de lecture (le plus marque d'abord, l'inverse en tete). */
export const SIGNAL_READING_ORDER: readonly SignalLevel[] = [
  "inverse",
  "strong",
  "clear",
  "moderate",
  "weak",
];

/** Epaisseur de lien en pixels ecran, par niveau. */
export const EDGE_WIDTH: Record<SignalLevel, number> = {
  strong: 3.4,
  inverse: 2.8,
  clear: 2.4,
  moderate: 1.7,
  weak: 1,
};

/** Ordre de dessin : les signaux marques passent au-dessus. */
export const EDGE_ORDER: Record<SignalLevel, number> = {
  weak: 0,
  moderate: 1,
  clear: 2,
  inverse: 3,
  strong: 4,
};

/** Pointille des paires majoritairement niees dans le texte. */
export const NEGATED_DASH = "5 4";

/**
 * Opacite d'un lien. Le non significatif (`weak`) est ESTOMPE, jamais
 * masque — et d'autant plus que le graphe est dense, sinon ses centaines de
 * traits gris noieraient les quelques signaux marques.
 */
export function edgeOpacity(level: SignalLevel, edgeCount: number): number {
  if (level === "weak") {
    if (edgeCount > 600) return 0.06;
    if (edgeCount > 250) return 0.1;
    if (edgeCount > 80) return 0.2;
    return 0.45;
  }
  if (level === "moderate") return 0.75;
  return 0.92;
}

/**
 * Couleur d'un noeud HLA : classe I / II, ou neutre pour une entite hors
 * locus classique (« HLA-mismatch », « HLA-eplet », classe entiere…).
 */
export function hlaNodeColor(hla: string): ThemeColor {
  const cls = hlaClassFromKey(hla);
  return cls ? HLA_CLASS_COLORS[cls] : CATEGORY_FALLBACK;
}

/**
 * Taille relative d'une case de matrice (0.38 a 1) selon l'effectif
 * d'articles : racine carree, pour que l'AIRE suive l'effectif. Une case
 * presente n'est jamais minuscule au point de disparaitre.
 */
export function cellScale(nArticles: number, maxArticles: number): number {
  if (!(maxArticles > 0) || !(nArticles > 0)) return 0.38;
  const t = Math.sqrt(Math.min(nArticles, maxArticles) / maxArticles);
  return Math.round((0.38 + 0.62 * t) * 100) / 100;
}

/** « 1 article » / « 12 articles ». */
export function articlesLabel(n: number): string {
  return `${n} article${n > 1 ? "s" : ""}`;
}
