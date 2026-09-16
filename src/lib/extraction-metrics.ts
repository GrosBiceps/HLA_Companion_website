/**
 * Metriques de validation de l'extraction — constantes de pipeline.
 *
 * Ces chiffres ne sont PAS des comptages du corpus (ceux-la sont calcules en
 * base, cf. `getCorpusStats`). Ce sont les resultats d'une validation manuelle
 * d'un echantillon de mentions, mesuree contre UNE version donnee du pipeline
 * et du corpus. Ils ne peuvent donc pas etre derives de la base : ils y sont
 * exterieurs.
 *
 * ⚠ D'ou le risque que ce module existe pour traiter. Au basculement vers les
 * donnees reelles, `getCorpusStats()` se met a jour tout seul, mais ces
 * chiffres-ci resteraient a affirmer en silence la precision du pipeline
 * SYNTHETIQUE a cote de litterature clinique reelle. Une precision annoncee
 * est une revendication de credibilite : elle ne doit jamais devenir muette et
 * fausse.
 *
 * Le garde-fou est `measuredAgainstCorpus` : l'encart compare cette valeur a
 * la version du corpus reellement rendu et affiche un avertissement visible
 * des qu'elles divergent. La peremption s'annonce donc d'elle-meme, au lieu de
 * passer inapercue.
 *
 * POUR METTRE A JOUR : remesurer sur le nouveau corpus, remplacer les trois
 * valeurs ET `measuredAgainstCorpus`, puis mettre a jour les chaines attendues
 * dans `src/__tests__/epistemic.test.tsx` (le test lit ce module, mais il
 * verifie aussi que les valeurs sont bien rendues a l'ecran).
 */

export interface ExtractionMetrics {
  /** Precision mesurée sur echantillon, en pourcentage. */
  precisionPct: string;
  /** Kappa d'accord inter-annotateur sur la negation. */
  negationKappa: string;
  /** Glose qualitative du kappa. */
  negationKappaGloss: string;
  /** Taux d'erreur exprime en langage clinique. */
  errorRatePhrase: string;
  /**
   * Version de corpus contre laquelle ces chiffres ont ete mesures.
   * Comparee a `CorpusVersion.version` au rendu ; toute divergence declenche
   * un avertissement de peremption dans l'encart.
   */
  measuredAgainstCorpus: string;
}

export const EXTRACTION_METRICS: ExtractionMetrics = {
  precisionPct: "78,75 %",
  negationKappa: "0,44",
  negationKappaGloss: "modéré",
  errorRatePhrase: "~1 mention sur 5 est erronée",
  measuredAgainstCorpus: "A-synthetic",
};

/**
 * Vrai si les metriques affichees ont ete mesurees sur un autre corpus que
 * celui effectivement rendu — auquel cas elles sont perimees et l'encart doit
 * le dire.
 */
export function areMetricsStale(corpusVersion: string): boolean {
  return EXTRACTION_METRICS.measuredAgainstCorpus !== corpusVersion;
}
