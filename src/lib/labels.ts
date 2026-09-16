/**
 * Table de libelles cliniques — miroir TypeScript de `scripts/labels.py`.
 *
 * ⚠ LES DEUX FICHIERS DOIVENT RESTER SYNCHRONISES. Toute entree ajoutee,
 * retiree ou renommee dans `scripts/labels.py` doit l'etre ici a l'identique
 * (et reciproquement) : le builder Python ecrit les cles, l'interface les
 * traduit. Une divergence se manifeste par un libelle manquant a l'ecran.
 *
 * Les cles techniques (graft_loss, recurrent_GN...) ne doivent JAMAIS etre
 * affichees a l'utilisateur : l'interface passe toujours par OUTCOME_LABELS.
 */

import type { SignalLevel } from "./types";

/** Ordre d'affichage des categories sur la fiche allele. */
export const CATEGORIES = [
  "Rejet",
  "Immunisation",
  "Fonction du greffon",
  "Infection",
  "Neoplasie",
  "Metabolique",
  "Recidive",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface OutcomeLabel {
  label: string;
  category: Category;
}

/** {cle_pipeline: {libelle affiche, categorie}} — 21 entrees. */
export const OUTCOME_LABELS: Record<string, OutcomeLabel> = {
  ABMR: { label: "Rejet humoral (ABMR)", category: "Rejet" },
  TCMR: { label: "Rejet cellulaire (TCMR)", category: "Rejet" },
  acute_rejection: { label: "Rejet aigu", category: "Rejet" },
  chronic_rejection: { label: "Rejet chronique / IFTA", category: "Rejet" },
  mixed_rejection: { label: "Rejet mixte", category: "Rejet" },
  DSA: {
    label: "Anticorps anti-HLA du donneur (DSA)",
    category: "Immunisation",
  },
  sensitization: {
    label: "Immunisation / sensibilisation",
    category: "Immunisation",
  },
  complement_activation: {
    label: "Activation du complement",
    category: "Immunisation",
  },
  HLA_mismatch_outcome: {
    label: "Incompatibilite HLA",
    category: "Immunisation",
  },
  DGF: {
    label: "Reprise retardee de fonction (DGF)",
    category: "Fonction du greffon",
  },
  graft_loss: { label: "Perte du greffon", category: "Fonction du greffon" },
  graft_survival: {
    label: "Survie du greffon",
    category: "Fonction du greffon",
  },
  eGFR: {
    label: "Fonction renale (DFG estime)",
    category: "Fonction du greffon",
  },
  BK_nephropathy: { label: "Nephropathie a BK virus", category: "Infection" },
  CMV: { label: "Infection a CMV", category: "Infection" },
  PTLD: {
    label: "Syndrome lymphoproliferatif (PTLD)",
    category: "Neoplasie",
  },
  skin_cancer: { label: "Cancer cutane", category: "Neoplasie" },
  NODAT: {
    label: "Diabete post-transplantation (NODAT)",
    category: "Metabolique",
  },
  recurrent_GN: {
    label: "Recidive de glomerulonephrite",
    category: "Recidive",
  },
  FSGS: {
    label: "Hyalinose segmentaire et focale (HSF)",
    category: "Recidive",
  },
  IgA_nephropathy: { label: "Nephropathie a IgA", category: "Recidive" },
};

/** Ordre de tri pour l'affichage : le plus fort en premier. */
export const SIGNAL_LEVELS: readonly SignalLevel[] = [
  "inverse",
  "strong",
  "clear",
  "moderate",
  "weak",
];

/** Libelles utilisateur des niveaux de signal, avec leur glose. */
export const SIGNAL_LABELS: Record<
  SignalLevel,
  { label: string; description: string }
> = {
  inverse: {
    label: "Signal inverse",
    description:
      "Co-occurrence moins frequente qu'attendue : piste de protection, a confirmer.",
  },
  strong: {
    label: "Signal fort",
    description:
      "Co-occurrence frequente et statistiquement marquee dans le corpus.",
  },
  clear: {
    label: "Signal net",
    description: "Co-occurrence statistiquement marquee sur un effectif modere.",
  },
  moderate: {
    label: "Signal modere",
    description:
      "Co-occurrence statistiquement marquee, mais sur tres peu d'articles.",
  },
  weak: {
    label: "Signal faible",
    description:
      "Co-occurrence non distinguable du hasard a l'echelle du corpus.",
  },
};

export const SIGNIFICANCE_THRESHOLD = 0.05;
export const STRONG_MIN_N = 10;
export const CLEAR_MIN_N = 3;

/**
 * Derive le niveau de signal qualitatif affiche a l'utilisateur.
 *
 * Miroir de `compute_signal_level` dans labels.py. Le test unilateral
 * 'greater' du pipeline est structurellement aveugle a la depletion : une
 * association protectrice authentique (OR<1) ne peut jamais etre
 * significative par ce test. On teste donc 'inverse' EN PREMIER, via le test
 * bilateral, pour ne pas la rendre invisible.
 */
export function computeSignalLevel(
  nCooccurrence: number,
  fdr: number | null,
  oddsRatio: number | null,
  fdrTwoSided: number | null,
): SignalLevel {
  if (
    oddsRatio !== null &&
    fdrTwoSided !== null &&
    oddsRatio < 1.0 &&
    fdrTwoSided < SIGNIFICANCE_THRESHOLD
  ) {
    return "inverse";
  }

  if (fdr === null || fdr >= SIGNIFICANCE_THRESHOLD) {
    return "weak";
  }

  if (nCooccurrence >= STRONG_MIN_N) return "strong";
  if (nCooccurrence >= CLEAR_MIN_N) return "clear";
  return "moderate";
}
