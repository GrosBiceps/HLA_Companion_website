/**
 * Carte v1 — donnees REELLES de l'etude anterieure
 * (github.com/GrosBiceps/Renal-HLA-Bibliometric), export Gephi de la carte
 * « greffe renale » : 80 noeuds (53 HLA, 27 complications), 125 liens
 * ponderes par le nombre de PMID uniques en co-occurrence.
 *
 * Le JSON est importe A LA CONSTRUCTION (import statique, cote serveur) : il
 * fait partie du depot, il ne change pas a l'execution, et il n'a rien a
 * faire dans la base SQLite du corpus A (autre etude, autre vocabulaire).
 *
 * CE QUE CE MODULE NE FAIT PAS : il ne normalise PAS les libelles vers le
 * vocabulaire actuel. « HLA-*A23 » (notation serologique) reste
 * « HLA-*A23 », « TMA » et « thrombotic microangiopathy » restent deux
 * noeuds. On AJOUTE seulement, pour la lecture :
 *  - une classe HLA deduite du libelle (I / II), pour la couleur ;
 *  - un regroupement INDICATIF des complications dans les categories
 *    cliniques du site (absent de l'etude d'origine, signale comme tel) ;
 *  - une traduction indicative en francais, affichee a cote du libelle
 *    d'origine, jamais a sa place.
 */

import raw from "../../data/legacy/carte_v1_renal.json";
import type { Category } from "./labels";

interface RawNode {
  id: string;
  label: string;
  size: number;
  type: string;
  x: number;
  y: number;
}

interface RawEdge {
  source: string;
  target: string;
  weight: number;
}

interface RawMap {
  source: string;
  nodes: RawNode[];
  edges: RawEdge[];
}

export type LegacyKind = "hla" | "complication";

export interface LegacyNode {
  id: string;
  /** Libelle D'ORIGINE, non normalise. */
  label: string;
  kind: LegacyKind;
  /** Taille Gephi d'origine (5 a 20). */
  size: number;
  /** Position Gephi d'origine (y vers le haut, comme dans Gephi). */
  x: number;
  y: number;
  /** HLA : classe deduite du libelle. */
  hlaClass: "I" | "II" | null;
  /** HLA : notation serologique (« HLA-*A23 »), non normalisee. */
  serological: boolean;
  /** Complication : categorie INDICATIVE (null = hors referentiel). */
  category: Category | null;
  /** Complication : traduction indicative. */
  gloss: string | null;
  /** Nombre de partenaires distincts. */
  degree: number;
  /** Somme des poids des liens (PMID, avec recouvrements possibles). */
  strength: number;
}

export interface LegacyEdge {
  id: string;
  /** Toujours le noeud HLA. */
  hla: string;
  /** Toujours le noeud complication. */
  complication: string;
  /** Nombre de PMID uniques en co-occurrence (compte brut). */
  weight: number;
}

export interface LegacyMap {
  sourceUrl: string;
  nodes: LegacyNode[];
  edges: LegacyEdge[];
}

/**
 * Regroupement indicatif des 27 complications de la carte v1. Choisi pour la
 * lecture (couleur), PAS pour l'analyse : l'etude d'origine ne classait pas
 * ses libelles.
 */
const LEGACY_CATEGORY: Record<string, Category | null> = {
  rejection: "Rejet",
  "acute rejection": "Rejet",
  "hyperacute rejection": "Rejet",
  "chronic rejection": "Rejet",
  "graft rejection": "Rejet",
  ABMR: "Rejet",
  "BK virus": "Infection",
  polyomavirus: "Infection",
  CMV: "Infection",
  EBV: "Infection",
  "COVID-19": "Infection",
  sepsis: "Infection",
  "viral infection": "Infection",
  PTLD: "Neoplasie",
  lymphoma: "Neoplasie",
  cancer: "Neoplasie",
  nephropathy: "Fonction du greffon",
  "allograft nephropathy": "Fonction du greffon",
  "chronic kidney disease": "Fonction du greffon",
  proteinuria: "Fonction du greffon",
  diabetes: "Metabolique",
  "recurrent disease": "Recidive",
  TMA: null,
  "thrombotic microangiopathy": null,
  "hemolytic uremic syndrome": null,
  hypertension: null,
  anemia: null,
};

const LEGACY_GLOSS: Record<string, string> = {
  rejection: "rejet (sans précision)",
  "acute rejection": "rejet aigu",
  "hyperacute rejection": "rejet hyperaigu",
  "chronic rejection": "rejet chronique",
  "graft rejection": "rejet du greffon",
  ABMR: "rejet humoral",
  "BK virus": "virus BK",
  polyomavirus: "polyomavirus",
  CMV: "cytomégalovirus",
  EBV: "virus d'Epstein-Barr",
  "COVID-19": "COVID-19",
  sepsis: "sepsis",
  "viral infection": "infection virale",
  PTLD: "syndrome lymphoprolifératif post-greffe",
  lymphoma: "lymphome",
  cancer: "cancer",
  nephropathy: "néphropathie",
  "allograft nephropathy": "néphropathie du greffon",
  "chronic kidney disease": "maladie rénale chronique",
  proteinuria: "protéinurie",
  diabetes: "diabète",
  "recurrent disease": "récidive de la maladie initiale",
  TMA: "microangiopathie thrombotique (sigle)",
  "thrombotic microangiopathy": "microangiopathie thrombotique",
  "hemolytic uremic syndrome": "syndrome hémolytique et urémique",
  hypertension: "hypertension artérielle",
  anemia: "anémie",
};

/** Classe HLA deduite d'un libelle v1 (« HLA-*DQ2 », « HLA-A*02 »). */
export function legacyHlaClass(label: string): "I" | "II" | null {
  const core = label.replace(/^HLA-/i, "").replace(/\*/g, "");
  if (/^D[RQP]/i.test(core)) return "II";
  if (/^[ABC]\d/i.test(core)) return "I";
  return null;
}

/** Notation serologique de la carte v1 : « HLA-* » suivi du locus. */
export function isSerological(label: string): boolean {
  return /^HLA-\*/.test(label);
}

/** Normalise l'export brut. Pur : testable sur un JSON fabrique. */
export function normalizeLegacyMap(data: RawMap): LegacyMap {
  const kindOf = new Map<string, LegacyKind>();
  for (const n of data.nodes) {
    kindOf.set(n.id, n.type === "HLA" ? "hla" : "complication");
  }

  const edges: LegacyEdge[] = [];
  const degree = new Map<string, number>();
  const strength = new Map<string, number>();
  for (const e of data.edges) {
    const ks = kindOf.get(e.source);
    const kt = kindOf.get(e.target);
    // Le graphe est biparti : une arete HLA–HLA ou orpheline est ignoree.
    if (!ks || !kt || ks === kt) continue;
    const hla = ks === "hla" ? e.source : e.target;
    const complication = ks === "hla" ? e.target : e.source;
    edges.push({ id: `${hla}--${complication}`, hla, complication, weight: e.weight });
    for (const id of [hla, complication]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      strength.set(id, (strength.get(id) ?? 0) + e.weight);
    }
  }

  const nodes: LegacyNode[] = data.nodes.map((n) => {
    const kind = kindOf.get(n.id)!;
    return {
      id: n.id,
      label: n.label,
      kind,
      size: n.size,
      x: n.x,
      y: n.y,
      hlaClass: kind === "hla" ? legacyHlaClass(n.label) : null,
      serological: kind === "hla" && isSerological(n.label),
      category: kind === "complication" ? (LEGACY_CATEGORY[n.label] ?? null) : null,
      gloss: kind === "complication" ? (LEGACY_GLOSS[n.label] ?? null) : null,
      degree: degree.get(n.id) ?? 0,
      strength: strength.get(n.id) ?? 0,
    };
  });

  return { sourceUrl: data.source, nodes, edges };
}

let cached: LegacyMap | null = null;

/** La carte v1, normalisee une fois. */
export function getLegacyMap(): LegacyMap {
  if (!cached) cached = normalizeLegacyMap(raw as RawMap);
  return cached;
}

export interface LegacyPair {
  hla: LegacyNode;
  complication: LegacyNode;
  weight: number;
}

/** Paires triees par poids decroissant, puis par libelles. */
export function topLegacyPairs(map: LegacyMap, minWeight = 1): LegacyPair[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  return map.edges
    .filter((e) => e.weight >= minWeight)
    .map((e) => ({
      hla: byId.get(e.hla)!,
      complication: byId.get(e.complication)!,
      weight: e.weight,
    }))
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.complication.label.localeCompare(b.complication.label) ||
        a.hla.label.localeCompare(b.hla.label),
    );
}

export interface LegacyStats {
  nNodes: number;
  nHla: number;
  nComplications: number;
  nSerological: number;
  nEdges: number;
  nSinglePmid: number;
  maxWeight: number;
}

export function legacyStats(map: LegacyMap): LegacyStats {
  return {
    nNodes: map.nodes.length,
    nHla: map.nodes.filter((n) => n.kind === "hla").length,
    nComplications: map.nodes.filter((n) => n.kind === "complication").length,
    nSerological: map.nodes.filter((n) => n.serological).length,
    nEdges: map.edges.length,
    nSinglePmid: map.edges.filter((e) => e.weight === 1).length,
    maxWeight: Math.max(0, ...map.edges.map((e) => e.weight)),
  };
}
