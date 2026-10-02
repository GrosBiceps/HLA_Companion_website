/**
 * Types du domaine — miroir TypeScript du schema SQLite (scripts/schema.sql).
 *
 * Convention : les colonnes SQL en snake_case sont exposees en camelCase par
 * la couche de requetes. Aucune valeur brute du pipeline (cle d'outcome,
 * niveau de signal) n'est affichee telle quelle : elle passe par labels.ts.
 */

import type { OrganKey, OrganSelection } from "./organ";

export type SignalLevel =
  | "inverse"
  | "strong"
  | "clear"
  | "moderate"
  | "weak";

export type Polarity = "positive" | "negated";

export type EntityType =
  | "allele"
  | "serotype"
  | "outcome"
  | "article"
  | "author";

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

/** Un organe et le nombre d'articles de sa strate. */
export interface OrganInfo {
  key: OrganKey;
  label: string;
  shortLabel: string;
  slug: string;
  /** Articles de la strate (un article multi-organe compte dans chacune). */
  nArticles: number;
}

/** Effectif d'articles dans un organe (ventilation « Par organe »). */
export interface OrganCount {
  organ: OrganKey;
  nArticles: number;
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
  /** Organes de l'article, le principal en tete (au moins un). */
  organs: OrganKey[];
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
  /**
   * Denominateur de la strate de la ligne : articles de l'organe (ou du corpus
   * entier pour `all`). Les metriques ci-dessus sont calculees dessus.
   */
  nUniverse: number | null;
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
  /**
   * Badge de resolution : « Locus », « 2-digit », « 4-digit » pour un allele ;
   * « Sérotype », « Famille large », « Associé », « Cellulaire » pour un
   * serotype. Absent pour les autres types.
   */
  badge?: string;
  /** Ligne secondaire (effectifs, correspondance). */
  detail?: string;
  /** Articles distincts mentionnant l'entite (alleles, serotypes). */
  nArticles?: number;
  /**
   * Resultat « enfant » propose sous un resultat parent (alleles 4-digit d'un
   * groupe, alleles d'un serotype) : rendu en retrait.
   */
  childOf?: string;
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
  /** Strate de la matrice : `all` ou un organe. */
  organ?: OrganSelection;
  resolution: "2-digit" | "4-digit";
  /** Locus affiche, ou null quand tous les loci sont presents. */
  locus?: string | null;
  /** Loci disponibles a cette resolution, avec leur effectif. */
  loci?: { locus: string; n: number }[];
  /** Classe I puis II, loci dans l'ordre A, B, C, DRB1, DQB1, DPB1. */
  alleles: MatrixAllele[];
  /** Ordre des categories cliniques (`CATEGORIES`), puis libelle. */
  outcomes: MatrixOutcome[];
  cells: AssociationMatrixCell[];
  /**
   * Paires de la strate sur une complication d'un AUTRE organe (articles
   * concernant deux organes), non representees dans la grille d'un organe.
   * Toujours 0 pour « tous les organes ».
   */
  nCellsOutsideOrgan?: number;
}

/** Nombre d'articles du corpus pour une annee de publication. */
export interface PublicationsPerYear {
  year: number;
  nArticles: number;
}

// --------------------------------------------------------------------------
// Serotypes (referentiel de reference, cf. docs/SEROTYPES.md)
// --------------------------------------------------------------------------

export type SerotypeKind = "specific" | "broad" | "associated" | "cellular";

export interface Serotype {
  /** Cle de route : « DR15 », « Cw7 », « DPw4 ». */
  serotypeId: string;
  /** Locus serologique : A, B, C, DR, DQ, DP. */
  locus: string;
  label: string;
  /** Famille large dont il est une subdivision (« DR2 » pour DR15). */
  broadSerotype: string | null;
  kind: SerotypeKind;
  note: string | null;
}

/** Specificite et effectifs du corpus, pour l'index `/serotype`. */
export interface SerotypeCatalogEntry extends Serotype {
  /** Groupes 2-digit lies. */
  nGroups: number;
  /** Alleles 4-digit lies. */
  nAlleles: number;
  /** Articles distincts mentionnant au moins l'un de ses alleles. */
  nArticles: number;
}

/** Allele membre d'un serotype. */
export interface SerotypeMember {
  hla: string;
  resolution: string;
  parentHla: string | null;
  /** direct | group | narrow : cf. schema.sql. */
  via: "direct" | "group" | "narrow";
  nArticles: number;
  nOutcomes: number;
  /** Co-occurrences au-dessus du seuil (tout niveau sauf `weak`). */
  nMarked: number;
}

/** Serotype porte par un allele, pour les badges de la fiche. */
export interface AlleleSerotype {
  serotypeId: string;
  kind: SerotypeKind;
  broadSerotype: string | null;
  /** Vrai si seuls certains alleles du groupe portent ce serotype. */
  partial: boolean;
}

/** Complication co-mentionnee avec au moins un allele d'un serotype. */
export interface SerotypeOutcome {
  outcome: string;
  label: string;
  category: string;
  /** Articles distincts citant un allele du serotype ET la complication. */
  nArticles: number;
  /** Alleles du serotype co-mentionnes avec cette complication. */
  nAlleles: number;
  /** Niveau de signal le plus marque parmi ces alleles. */
  topLevel: SignalLevel;
}
