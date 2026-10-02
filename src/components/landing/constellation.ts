/**
 * Calculs de mise en page de l'accueil — fonctions PURES (aucun acces base),
 * testees dans `src/__tests__/landing.test.tsx`.
 *
 * `buildConstellation` : entree = paires (allele, complication) deja triees
 * par force de signal (`getSignalHighlights`) ; sortie = deux colonnes de
 * noeuds ordonnees et les aretes qui les relient.
 *
 * Selection gloutonne ponderee (voir la boucle) : les paires les plus
 * marquees, en favorisant les noeuds partages, sans jamais depasser
 * `maxPerSide` lignes par colonne (lisibilite mobile).
 *
 * Ordre des colonnes : alleles par classe puis locus ; complications par
 * BARYCENTRE de leurs alleles (heuristique de Sugiyama), ce qui limite les
 * croisements de liens sans rien inventer.
 */

import type { SignalLevel } from "@/lib/types";

export interface ConstellationInput {
  hla: string;
  locus: string;
  hlaClass: string;
  outcome: string;
  label: string;
  category: string;
  signalLevel: SignalLevel;
  nCooccurrence: number;
}

export interface ConstellationAllele {
  hla: string;
  hlaClass: string;
}

export interface ConstellationOutcome {
  outcome: string;
  label: string;
  category: string;
}

export interface ConstellationEdge {
  hla: string;
  outcome: string;
  signalLevel: SignalLevel;
  nCooccurrence: number;
  /** Index de ligne dans la colonne des alleles. */
  from: number;
  /** Index de ligne dans la colonne des complications. */
  to: number;
}

export interface Constellation {
  alleles: ConstellationAllele[];
  outcomes: ConstellationOutcome[];
  edges: ConstellationEdge[];
}

const LOCUS_ORDER = ["A", "B", "C", "DRB1", "DQB1", "DPB1"];

export function buildConstellation(
  pairs: ConstellationInput[],
  {
    maxPerSide = 7,
    maxEdges = 14,
  }: { maxPerSide?: number; maxEdges?: number } = {},
): Constellation {
  const alleleMap = new Map<string, ConstellationInput>();
  const outcomeMap = new Map<string, ConstellationInput>();
  const kept: ConstellationInput[] = [];
  const keys = new Set<string>();

  // A chaque tour, on retient la paire de plus grand score parmi celles qui
  // tiennent dans les colonnes. Score = effectif x (1 + extremites deja
  // presentes) : une paire qui relie des noeuds deja affiches est favorisee,
  // ce qui fait apparaitre les noeuds partages (un allele cite avec plusieurs
  // complications) au lieu d'une suite de paires paralleles isolees.
  const remaining = pairs.filter((p) => {
    const key = `${p.hla}|${p.outcome}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  while (kept.length < maxEdges) {
    let best = -1;
    let bestScore = -1;
    remaining.forEach((p, i) => {
      const hasA = alleleMap.has(p.hla);
      const hasO = outcomeMap.has(p.outcome);
      if (!hasA && alleleMap.size >= maxPerSide) return;
      if (!hasO && outcomeMap.size >= maxPerSide) return;
      const score = p.nCooccurrence * (1 + Number(hasA) + Number(hasO));
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best === -1) break;
    const [p] = remaining.splice(best, 1);
    if (!alleleMap.has(p.hla)) alleleMap.set(p.hla, p);
    if (!outcomeMap.has(p.outcome)) outcomeMap.set(p.outcome, p);
    kept.push(p);
  }

  const locusRank = (l: string) => {
    const i = LOCUS_ORDER.indexOf(l);
    return i === -1 ? LOCUS_ORDER.length : i;
  };
  const alleles = [...alleleMap.values()]
    .sort(
      (a, b) =>
        a.hlaClass.localeCompare(b.hlaClass) ||
        locusRank(a.locus) - locusRank(b.locus) ||
        a.hla.localeCompare(b.hla),
    )
    .map((a) => ({ hla: a.hla, hlaClass: a.hlaClass }));
  const alleleIndex = new Map(alleles.map((a, i) => [a.hla, i]));

  const barycenter = (outcome: string) => {
    const idx = kept
      .filter((k) => k.outcome === outcome)
      .map((k) => alleleIndex.get(k.hla) ?? 0);
    return idx.reduce((s, i) => s + i, 0) / idx.length;
  };
  const outcomes = [...outcomeMap.values()]
    .map((o) => ({ o, b: barycenter(o.outcome) }))
    .sort((x, y) => x.b - y.b || x.o.label.localeCompare(y.o.label))
    .map(({ o }) => ({
      outcome: o.outcome,
      label: o.label,
      category: o.category,
    }));
  const outcomeIndex = new Map(outcomes.map((o, i) => [o.outcome, i]));

  const edges = kept.map((k) => ({
    hla: k.hla,
    outcome: k.outcome,
    signalLevel: k.signalLevel,
    nCooccurrence: k.nCooccurrence,
    from: alleleIndex.get(k.hla) ?? 0,
    to: outcomeIndex.get(k.outcome) ?? 0,
  }));

  return { alleles, outcomes, edges };
}

/**
 * Paires « vitrines » variees : une seule par complication et une seule par
 * groupe allelique 2-digit (HLA-DQB1*02 et HLA-DQB1*02:01 racontent la meme
 * chose deux fois), et au plus `maxPerLocus` paires par locus.
 */
export function pickDiverse<T extends { hla: string; outcome: string }>(
  pairs: T[],
  limit: number,
  maxPerLocus = 2,
): T[] {
  const seenOutcome = new Set<string>();
  const seenGroup = new Set<string>();
  const perLocus = new Map<string, number>();
  const out: T[] = [];
  for (const p of pairs) {
    if (out.length >= limit) break;
    const group = p.hla.replace(/(\*\d+):.*$/, "$1");
    const locus = p.hla.split("*")[0];
    if (seenOutcome.has(p.outcome) || seenGroup.has(group)) continue;
    if ((perLocus.get(locus) ?? 0) >= maxPerLocus) continue;
    seenOutcome.add(p.outcome);
    seenGroup.add(group);
    perLocus.set(locus, (perLocus.get(locus) ?? 0) + 1);
    out.push(p);
  }
  return out;
}

/** Graduations « rondes » d'un axe vertical partant de 0. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + 1e-9; i++) ticks.push(Math.round(i * step));
  return ticks;
}

/** Formatage francais des entiers (espace fine insecable). */
export const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

/** Pourcentage francais a une decimale au plus (« 93,4 % »). */
export function formatPct(part: number, total: number): string {
  if (total <= 0) return "0 %";
  const pct = (100 * part) / total;
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: pct < 10 ? 1 : 0,
  }).format(pct)} %`;
}

/** « 1 article » / « 3 articles ». */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${NUMBER_FORMAT.format(n)} ${n > 1 ? (pluralForm ?? `${singular}s`) : singular}`;
}
