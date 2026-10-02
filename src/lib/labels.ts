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
 *
 * Les complications portent aussi la liste des ORGANES auxquels elles
 * s'appliquent (`OUTCOME_ORGANS`, miroir de labels.py) : un fait de
 * vocabulaire, pas un resultat du corpus.
 */

import type { OrganKey } from "./organ";
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
  "Greffon contre hote",
  "Survie",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface OutcomeLabel {
  label: string;
  category: Category;
}

/** {cle_pipeline: {libelle affiche, categorie}} — 46 entrees. */
export const OUTCOME_LABELS: Record<string, OutcomeLabel> = {
  ABMR: { label: "Rejet humoral (ABMR)", category: "Rejet" },
  TCMR: { label: "Rejet cellulaire (TCMR)", category: "Rejet" },
  acute_rejection: { label: "Rejet aigu", category: "Rejet" },
  chronic_rejection: { label: "Rejet chronique / IFTA", category: "Rejet" },
  mixed_rejection: { label: "Rejet mixte", category: "Rejet" },
  DSA: { label: "Anticorps anti-HLA du donneur (DSA)", category: "Immunisation" },
  sensitization: { label: "Immunisation / sensibilisation", category: "Immunisation" },
  complement_activation: { label: "Activation du complément", category: "Immunisation" },
  HLA_mismatch_outcome: { label: "Incompatibilité HLA", category: "Immunisation" },
  DGF: { label: "Reprise retardée de fonction (DGF)", category: "Fonction du greffon" },
  graft_loss: { label: "Perte du greffon", category: "Fonction du greffon" },
  graft_survival: { label: "Survie du greffon", category: "Fonction du greffon" },
  eGFR: { label: "Fonction rénale (DFG estimé)", category: "Fonction du greffon" },
  BK_nephropathy: { label: "Néphropathie à BK virus", category: "Infection" },
  CMV: { label: "Infection à CMV", category: "Infection" },
  PTLD: { label: "Syndrome lymphoprolifératif (PTLD)", category: "Neoplasie" },
  skin_cancer: { label: "Cancer cutané", category: "Neoplasie" },
  NODAT: { label: "Diabète post-transplantation (NODAT)", category: "Metabolique" },
  recurrent_GN: { label: "Récidive de glomérulonéphrite", category: "Recidive" },
  FSGS: { label: "Hyalinose segmentaire et focale (HSF)", category: "Recidive" },
  IgA_nephropathy: { label: "Néphropathie à IgA", category: "Recidive" },
  EBV: { label: "Infection à EBV", category: "Infection" },
  patient_mortality: { label: "Mortalité du receveur", category: "Survie" },
  cardiac_allograft_vasculopathy: { label: "Vasculopathie du greffon cardiaque (CAV)", category: "Rejet" },
  chronic_lung_allograft_dysfunction: { label: "Dysfonction chronique du greffon pulmonaire (CLAD)", category: "Rejet" },
  bronchiolitis_obliterans: { label: "Syndrome de bronchiolite oblitérante (BOS)", category: "Rejet" },
  invasive_aspergillosis: { label: "Aspergillose invasive", category: "Infection" },
  primary_graft_dysfunction: { label: "Dysfonction primaire du greffon (PGD)", category: "Fonction du greffon" },
  liver_chronic_rejection: { label: "Rejet chronique hépatique (ductopénique)", category: "Rejet" },
  early_allograft_dysfunction: { label: "Dysfonction précoce du greffon hépatique (EAD)", category: "Fonction du greffon" },
  biliary_complications: { label: "Complications biliaires", category: "Fonction du greffon" },
  hepatitis_recurrence: { label: "Récidive de l'hépatite virale (VHB/VHC)", category: "Recidive" },
  hcc_recurrence: { label: "Récidive du carcinome hépatocellulaire", category: "Recidive" },
  cholangitis_recurrence: { label: "Récidive de cholangite (CSP/CBP)", category: "Recidive" },
  pancreas_graft_thrombosis: { label: "Thrombose du greffon pancréatique", category: "Fonction du greffon" },
  insulin_independence: { label: "Insulino-indépendance", category: "Fonction du greffon" },
  autoimmune_diabetes_recurrence: { label: "Récidive du diabète auto-immun", category: "Recidive" },
  parenteral_nutrition_dependence: { label: "Dépendance à la nutrition parentérale", category: "Fonction du greffon" },
  acute_gvhd: { label: "Réaction du greffon contre l'hôte aiguë (GVH aiguë)", category: "Greffon contre hote" },
  chronic_gvhd: { label: "Réaction du greffon contre l'hôte chronique (GVH chronique)", category: "Greffon contre hote" },
  disease_relapse: { label: "Rechute de la maladie hématologique", category: "Recidive" },
  engraftment_failure: { label: "Échec de prise de greffe", category: "Fonction du greffon" },
  hsct_graft_rejection: { label: "Rejet de greffe de CSH", category: "Rejet" },
  HLA_loss_relapse: { label: "Perte d'HLA à la rechute", category: "Immunisation" },
  secondary_malignancy: { label: "Seconde néoplasie", category: "Neoplasie" },
  non_relapse_mortality: { label: "Mortalité hors rechute", category: "Survie" },
};

/**
 * Organes auxquels chaque complication s'applique — miroir de
 * `OUTCOME_ORGANS` (labels.py). Une complication « partagee » en liste
 * plusieurs (DSA, CMV, PTLD…) ; une complication specifique n'en liste qu'un
 * ou deux (le BOS n'existe qu'apres une greffe pulmonaire).
 */
export const OUTCOME_ORGANS: Record<string, readonly OrganKey[]> = {
  ABMR: ["kidney", "liver", "heart", "lung", "pancreas", "intestine"],
  TCMR: ["kidney", "liver", "heart", "lung", "pancreas", "intestine"],
  acute_rejection: ["kidney", "liver", "heart", "lung", "pancreas", "intestine"],
  chronic_rejection: ["kidney"],
  mixed_rejection: ["kidney", "heart"],
  DSA: ["kidney", "liver", "heart", "lung", "pancreas", "intestine", "hsct"],
  sensitization: ["kidney", "heart", "lung", "pancreas", "intestine"],
  complement_activation: ["kidney", "heart", "lung"],
  HLA_mismatch_outcome: ["kidney", "liver", "heart", "lung", "pancreas", "intestine", "hsct"],
  DGF: ["kidney"],
  graft_loss: ["kidney", "liver", "heart", "lung", "pancreas", "intestine"],
  graft_survival: ["kidney", "liver", "heart", "lung", "pancreas", "intestine"],
  eGFR: ["kidney"],
  BK_nephropathy: ["kidney"],
  CMV: ["kidney", "liver", "heart", "lung", "pancreas", "intestine", "hsct"],
  PTLD: ["kidney", "liver", "heart", "lung", "pancreas", "intestine", "hsct"],
  skin_cancer: ["kidney", "liver", "heart", "lung", "pancreas"],
  NODAT: ["kidney", "liver", "heart", "lung"],
  recurrent_GN: ["kidney"],
  FSGS: ["kidney"],
  IgA_nephropathy: ["kidney"],
  EBV: ["kidney", "liver", "heart", "lung", "pancreas", "intestine", "hsct"],
  patient_mortality: ["kidney", "liver", "heart", "lung", "pancreas", "intestine", "hsct"],
  cardiac_allograft_vasculopathy: ["heart"],
  chronic_lung_allograft_dysfunction: ["lung"],
  bronchiolitis_obliterans: ["lung"],
  invasive_aspergillosis: ["lung", "hsct"],
  primary_graft_dysfunction: ["heart", "lung"],
  liver_chronic_rejection: ["liver"],
  early_allograft_dysfunction: ["liver"],
  biliary_complications: ["liver"],
  hepatitis_recurrence: ["liver"],
  hcc_recurrence: ["liver"],
  cholangitis_recurrence: ["liver"],
  pancreas_graft_thrombosis: ["pancreas"],
  insulin_independence: ["pancreas"],
  autoimmune_diabetes_recurrence: ["pancreas"],
  parenteral_nutrition_dependence: ["intestine"],
  acute_gvhd: ["hsct", "intestine"],
  chronic_gvhd: ["hsct"],
  disease_relapse: ["hsct"],
  engraftment_failure: ["hsct"],
  hsct_graft_rejection: ["hsct"],
  HLA_loss_relapse: ["hsct"],
  secondary_malignancy: ["hsct"],
  non_relapse_mortality: ["hsct"],
};

/** Vrai si la complication s'applique a l'organe (vocabulaire, pas un resultat). */
export function outcomeAppliesToOrgan(outcome: string, organ: OrganKey): boolean {
  return OUTCOME_ORGANS[outcome]?.includes(organ) ?? false;
}

/** Cles de complications applicables a un organe (ordre de OUTCOME_LABELS). */
export function outcomesForOrgan(organ: OrganKey): string[] {
  return Object.keys(OUTCOME_LABELS).filter((k) => outcomeAppliesToOrgan(k, organ));
}


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
