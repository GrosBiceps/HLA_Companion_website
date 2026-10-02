/**
 * Navigation 2-digit -> 4-digit — SERVEUR UNIQUEMENT (cf. db.ts).
 *
 * Enfants directs d'une entite (4-digit d'un groupe 2-digit, groupes d'un
 * locus) avec leurs effectifs, pour la carte « Résolution plus fine » des
 * fiches allele.
 */

import { getDb } from "./db";
import { ALL_ORGANS, type OrganSelection } from "./organ";

/** Sous-type d'un allele avec ses effectifs. */
export interface AlleleChildSummary {
  hla: string;
  resolution: string;
  /** Articles distincts mentionnant explicitement cette forme. */
  nArticles: number;
  /** Co-occurrences au-dessus du seuil (tout niveau sauf `weak`). */
  nMarked: number;
}

/**
 * Enfants directs d'une entite, du plus au moins cite. Deux sous-requetes
 * indexees par ligne : quelques dizaines de lignes au plus.
 */
export function getAlleleChildSummaries(
  hla: string,
  organ: OrganSelection = ALL_ORGANS,
): AlleleChildSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT h.hla, h.resolution,
              COALESCE((SELECT c.n_articles FROM hla_organ_counts c
                         WHERE c.organ = ? AND c.hla = h.hla), 0) AS n_articles,
              (SELECT COUNT(*) FROM associations a
                WHERE a.organ = ? AND a.hla = h.hla
                  AND a.signal_level <> 'weak') AS n_marked
         FROM hla_entities h
        WHERE h.parent_hla = ?`,
    )
    .all(organ, organ, hla) as {
    hla: string;
    resolution: string;
    n_articles: number;
    n_marked: number;
  }[];
  return rows
    .map((r) => ({
      hla: r.hla,
      resolution: r.resolution,
      nArticles: r.n_articles,
      nMarked: r.n_marked,
    }))
    .sort(
      (a, b) =>
        b.nArticles - a.nArticles ||
        a.hla.localeCompare(b.hla, "en", { numeric: true }),
    );
}
