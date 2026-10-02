import { getCorpusVersion } from "@/lib/db";
import {
  getAlleleByKey,
  getAssociationsForAllele,
  getPairMentions,
} from "@/lib/queries";
import type { ReadingExample } from "./ReadingGuide";

/** Allele vitrine de la demonstration (exemple vivant du guide). */
export const SHOWCASE_ALLELE = "HLA-DQB1*02:01";

/**
 * Exemple vivant du guide : une paire reelle du corpus rendu (l'allele
 * vitrine, sa paire la plus marquee, sa phrase positive la plus courte).
 * Compose des requetes existantes ; rien n'est ecrit en dur.
 */
export function getReadingExample(): ReadingExample | null {
  const corpus = getCorpusVersion();
  const allele = getAlleleByKey(SHOWCASE_ALLELE);
  const rows = allele ? getAssociationsForAllele(SHOWCASE_ALLELE) : [];
  const row = rows.find((a) => a.signalLevel === "strong") ?? rows[0] ?? null;
  if (!row) return null;
  const mention =
    getPairMentions(row.hla, row.outcome)
      .filter((m) => m.polarity === "positive")
      .sort((a, b) => a.sentence.length - b.sentence.length)[0] ?? null;
  return {
    hla: row.hla,
    outcome: row.outcome,
    label: row.label,
    category: row.category,
    signalLevel: row.signalLevel,
    nCooccurrence: row.nCooccurrence,
    nNegated: row.nNegated,
    synthetic: corpus.isSynthetic,
    mention: mention
      ? {
          sentence: mention.sentence,
          hlaSpan: mention.hlaSpan,
          outcomeSpan: mention.outcomeSpan,
          pmid: mention.pmid,
          year: mention.year,
          journal: mention.journal,
        }
      : null,
  };
}
