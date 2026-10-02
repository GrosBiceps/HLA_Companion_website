/**
 * Loci HLA connus du site, dans l'ordre d'affichage : classe I, puis classe II.
 *
 * Source unique pour le tri (matrice, index des alleles, graphe, fiches).
 * Un locus absent de cette liste est range apres les autres, par ordre
 * alphabetique : une nouvelle donnee ne casse jamais l'affichage.
 */
export const LOCUS_ORDER = [
  "A",
  "B",
  "C",
  "DRB1",
  "DRB3",
  "DRB4",
  "DRB5",
  "DQA1",
  "DQB1",
  "DPB1",
] as const;

/** Les six loci « principaux » du typage de routine, repris sur l'accueil. */
export const MAIN_LOCI = ["A", "B", "C", "DRB1", "DQB1", "DPB1"] as const;

export function locusRank(locus: string): number {
  const i = (LOCUS_ORDER as readonly string[]).indexOf(locus);
  return i === -1 ? LOCUS_ORDER.length : i;
}
