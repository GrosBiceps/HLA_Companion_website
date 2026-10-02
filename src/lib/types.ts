/**
 * Types du domaine — miroir TypeScript du schema SQLite (scripts/schema.sql).
 *
 * Convention : les colonnes SQL en snake_case sont exposees en camelCase par
 * la couche de requetes. Aucune valeur brute du pipeline (cle d'outcome,
 * niveau de signal) n'est affichee telle quelle : elle passe par labels.ts.
 */

export type SignalLevel =
  | "inverse"
  | "strong"
  | "clear"
  | "moderate"
  | "weak";

export type Polarity = "positive" | "negated";

export type EntityType = "allele" | "outcome" | "article" | "author";

export interface CorpusVersion {
  version: string;
  universe: string;
  builtAt: string;
  nArticles: number;
  isSynthetic: boolean;
  notes: string | null;
}

export interface HlaEntity {
  hla: string;
  locus: string;
  hlaClass: string;
  resolution: string;
  parentHla: string | null;
  nMentions: number;
}

export interface Outcome {
  outcome: string;
  label: string;
  category: string;
  nMentions: number;
}

export interface Article {
  pmid: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  year: number;
  journal: string | null;
  journalAbbrev: string | null;
  country: string | null;
  language: string | null;
  citedBy: number | null;
  source: string | null;
  graftAssignment: string | null;
}

export interface Author {
  authorId: string;
  displayName: string;
  nPublications: number;
}

export interface AssociationRow {
  hla: string;
  outcome: string;
  label: string;
  category: string;
  nCooccurrence: number;
  nPositive: number;
  nNegated: number;
  signalLevel: SignalLevel;
  isSignificant: boolean;
  firstYear: number | null;
  /** Metriques masquees par defaut - depliant "Detail statistique" only. */
  npmi: number | null;
  oddsRatio: number | null;
  orCiLow: number | null;
  orCiHigh: number | null;
  fdr: number | null;
  fdrTwoSided: number | null;
}

/** Alias historique : `Association` est le nom du type dans le plan. */
export type Association = AssociationRow;

export interface PairMention {
  pairMentionId: number;
  pmid: string;
  hla: string;
  outcome: string;
  sentence: string;
  hlaSpan: string;
  outcomeSpan: string;
  polarity: Polarity;
  negationTrigger: string | null;
  title: string;
  year: number;
  journal: string | null;
  citedBy: number | null;
}

export interface SearchHit {
  entityType: EntityType;
  entityId: string;
  label: string;
}

// --------------------------------------------------------------------------
// Vues d'ensemble du corpus (matrice, chronologie) — pour les visualisations.
// --------------------------------------------------------------------------

/** Ligne de la matrice : un allele au niveau de resolution demande. */
export interface MatrixAllele {
  hla: string;
  locus: string;
  hlaClass: string;
  nMentions: number;
}

/** Colonne de la matrice : une complication, libelle clinique joint. */
export interface MatrixOutcome {
  outcome: string;
  /** Libelle AFFICHABLE (table `outcomes`), jamais la cle technique. */
  label: string;
  category: string;
  nMentions: number;
}

/** Case non vide de la matrice : une ligne de `associations`. */
export interface AssociationMatrixCell {
  hla: string;
  outcome: string;
  signalLevel: SignalLevel;
  isSignificant: boolean;
  nCooccurrence: number;
  nNegated: number;
  /**
   * Metrique brute, pour l'encodage (couleur, tri) uniquement : la regle
   * epistemique du site interdit de l'AFFICHER par defaut.
   */
  npmi: number | null;
}

/**
 * Matrice HLA x complication, CREUSE : `cells` ne contient que les paires
 * effectivement co-citees. Une case absente signifie « jamais co-cite dans
 * le corpus », pas « signal nul ».
 */
export interface AssociationMatrix {
  resolution: "2-digit" | "4-digit";
  /** Classe I puis II, loci dans l'ordre A, B, C, DRB1, DQB1, DPB1. */
  alleles: MatrixAllele[];
  /** Ordre des categories cliniques (`CATEGORIES`), puis libelle. */
  outcomes: MatrixOutcome[];
  cells: AssociationMatrixCell[];
}

/** Nombre d'articles du corpus pour une annee de publication. */
export interface PublicationsPerYear {
  year: number;
  nArticles: number;
}
