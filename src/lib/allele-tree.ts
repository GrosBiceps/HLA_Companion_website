/**
 * Arbre de nomenclature pour l'index des alleles — module PUR (aucun acces
 * base) : il recoit le catalogue a plat et le range en
 * classe -> locus -> 2-digit -> 4-digit. Testable isolement, et
 * serialisable tel quel vers le composant client de filtrage.
 */

export interface TreeAllele {
  hla: string;
  locus: string;
  hlaClass: string;
  resolution: string;
  nArticles: number;
  nOutcomes: number;
  nMarked: number;
}

export interface TreeTwoDigit extends TreeAllele {
  children: TreeAllele[];
}

export interface TreeLocus {
  locus: string;
  hlaClass: string;
  alleles: TreeTwoDigit[];
  /** 4-digit dont le parent 2-digit est absent du referentiel. */
  orphans: TreeAllele[];
}

export interface TreeClass {
  hlaClass: string;
  loci: TreeLocus[];
}

export interface AlleleTree {
  classes: TreeClass[];
  /** Entites non alleliques (compte d'incompatibilites, eplets...). */
  others: TreeAllele[];
}

const LOCUS_ORDER = ["A", "B", "C", "DRB1", "DQB1", "DPB1"];

function locusRank(locus: string): number {
  const i = LOCUS_ORDER.indexOf(locus);
  return i === -1 ? LOCUS_ORDER.length : i;
}

/** Tri naturel des champs d'allele : *2 avant *10, *02:01 avant *02:10. */
export function compareAlleles(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

export function buildAlleleTree(
  entries: (TreeAllele & { parentHla: string | null })[],
): AlleleTree {
  const pick = ({
    hla,
    locus,
    hlaClass,
    resolution,
    nArticles,
    nOutcomes,
    nMarked,
  }: TreeAllele): TreeAllele => ({
    hla,
    locus,
    hlaClass,
    resolution,
    nArticles,
    nOutcomes,
    nMarked,
  });

  const loci = new Map<string, TreeLocus>();
  const getLocus = (locus: string, hlaClass: string) => {
    let l = loci.get(locus);
    if (!l) {
      l = { locus, hlaClass, alleles: [], orphans: [] };
      loci.set(locus, l);
    }
    return l;
  };

  const twoDigit = new Map<string, TreeTwoDigit>();
  for (const e of entries) {
    if (e.resolution !== "2-digit") continue;
    const node: TreeTwoDigit = { ...pick(e), children: [] };
    twoDigit.set(e.hla, node);
    getLocus(e.locus, e.hlaClass).alleles.push(node);
  }

  const others: TreeAllele[] = [];
  for (const e of entries) {
    if (e.resolution === "4-digit") {
      const parent = e.parentHla ? twoDigit.get(e.parentHla) : undefined;
      if (parent) parent.children.push(pick(e));
      else getLocus(e.locus, e.hlaClass).orphans.push(pick(e));
    } else if (e.resolution !== "2-digit" && e.resolution !== "class") {
      others.push(pick(e));
    }
  }

  for (const l of loci.values()) {
    l.alleles.sort((a, b) => compareAlleles(a.hla, b.hla));
    for (const a of l.alleles)
      a.children.sort((x, y) => compareAlleles(x.hla, y.hla));
    l.orphans.sort((a, b) => compareAlleles(a.hla, b.hla));
  }

  const byClass = new Map<string, TreeLocus[]>();
  for (const l of loci.values()) {
    const list = byClass.get(l.hlaClass) ?? [];
    list.push(l);
    byClass.set(l.hlaClass, list);
  }
  const classes: TreeClass[] = [...byClass.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hlaClass, list]) => ({
      hlaClass,
      loci: list.sort(
        (a, b) =>
          locusRank(a.locus) - locusRank(b.locus) ||
          a.locus.localeCompare(b.locus),
      ),
    }));

  others.sort((a, b) => compareAlleles(a.hla, b.hla));
  return { classes, others };
}

/**
 * Filtre texte tolerant : « a*02 », « HLA-A*02 », « dqb1 02 » trouvent tous
 * HLA-A*02 / HLA-DQB1*02. Insensible a la casse et au prefixe « HLA- ».
 */
export function matchesAlleleQuery(hla: string, query: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^hla-/, "")
      .replace(/[\s*:_-]+/g, "");
  const q = norm(query.trim());
  if (q.length === 0) return true;
  return norm(hla).includes(q);
}
