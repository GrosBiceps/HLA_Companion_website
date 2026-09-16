import Link from "next/link";
import {
  EXTRACTION_METRICS,
  areMetricsStale,
} from "@/lib/extraction-metrics";

/**
 * Cadrage epistemique — encart NON REFERMABLE.
 *
 * C'est la contrainte de conception centrale du site : l'utilisateur ne peut
 * pas faire disparaitre l'avertissement qui dit ce que les chiffres sont, et
 * surtout ce qu'ils ne sont pas. D'ou, volontairement :
 *
 *  - AUCUN <button> dans ce composant (un test l'interdit explicitement) :
 *    pas de croix de fermeture, pas de repli, pas de "ne plus afficher" ;
 *  - aucun etat local, donc rien a persister ni a contourner ;
 *  - aucun terme du vocabulaire causal interdit (cf. la liste du test
 *    epistemic.test.tsx) dans le texte visible — l'encart qui denonce la
 *    lecture causale ne peut pas l'employer lui-meme.
 *
 * ORDRE DE LECTURE. Il est choisi, pas accidentel. Le taux d'erreur remonte
 * dans le corps du texte, juste apres le dementi : place en troisieme puce
 * sous "Metriques d'extraction", il arrivait apres deux chiffres qui se lisent
 * comme RASSURANTS (78,75 % parait eleve, un kappa evoque un instrument
 * valide), et le chemin de survol se terminait donc sur "c'etait valide". Le
 * taux d'erreur n'est pas une metrique parmi d'autres : c'est la consequence.
 *
 * POIDS VISUEL. L'encart doit peser PLUS lourd que les cartes de statistiques
 * de l'accueil. Le bandeau "donnees synthetiques" est une condition temporaire
 * de prototype et disparaitra ; ce cadrage-ci est la contrainte permanente et
 * porteuse. Il ne peut pas rester l'element le plus discret de la page.
 *
 * Les trois metriques viennent de `extraction-metrics.ts`, qui porte la
 * version de corpus contre laquelle elles ont ete mesurees : si le corpus
 * rendu differe, l'encart affiche lui-meme un avertissement de peremption.
 */
export function EpistemicNotice({
  corpusVersion,
}: {
  /**
   * Version du corpus rendu. Omise, la verification de peremption est
   * silencieuse : le composant reste rendable isolement (tests, storybook)
   * sans fabriquer une fausse concordance.
   */
  corpusVersion?: string;
}) {
  const stale =
    corpusVersion !== undefined && areMetricsStale(corpusVersion);

  return (
    <section
      aria-labelledby="epistemic-notice-title"
      className="rounded-lg border-4 border-slate-900 bg-white shadow-md"
    >
      <h2
        id="epistemic-notice-title"
        className="rounded-t bg-slate-900 px-5 py-3 text-base font-bold
                   uppercase tracking-wide text-white"
      >
        Ce que ce site montre — et ce qu&apos;il ne montre pas
      </h2>

      <div className="space-y-3 px-5 py-4 text-sm leading-relaxed
                      text-slate-900">
        <p>
          Ce site cartographie des <strong>co-occurrences textuelles</strong>{" "}
          dans la littérature indexée par PubMed : quels allèles HLA et quelles
          complications sont mentionnés ensemble, et à quelle fréquence,
          comparée à ce qu&apos;on attendrait si les mentions étaient réparties
          au hasard <strong>dans le texte</strong>.
        </p>

        <p className="text-base font-bold text-slate-900">
          Ce ne sont PAS des associations cliniques ni causales.
        </p>

        <p className="font-semibold text-slate-900">
          {EXTRACTION_METRICS.errorRatePhrase}.
        </p>

        <p className="border-l-4 border-slate-900 bg-slate-100 py-2 pl-3
                      font-semibold text-slate-900">
          Un signal fort reflète souvent une mode de publication, un biais
          d&apos;indexation, ou une erreur d&apos;extraction.
        </p>

        <div>
          <p className="font-semibold text-slate-900">
            Métriques d&apos;extraction
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Précision mesurée : {EXTRACTION_METRICS.precisionPct}</li>
            <li>
              Accord négation (kappa) : {EXTRACTION_METRICS.negationKappa} (
              {EXTRACTION_METRICS.negationKappaGloss})
            </li>
          </ul>
          {stale ? (
            <p
              role="alert"
              className="mt-2 border-l-4 border-amber-600 bg-amber-50 py-2
                         pl-3 text-xs font-semibold text-amber-950"
            >
              ⚠ Ces métriques ont été mesurées sur le corpus{" "}
              {EXTRACTION_METRICS.measuredAgainstCorpus}, pas sur le corpus{" "}
              {corpusVersion} affiché ici. Elles doivent être remesurées.
            </p>
          ) : null}
        </div>

        <p>
          Toute lecture clinique exige de relire les sources. Le site y conduit
          systématiquement.
        </p>

        <p>
          <Link
            href="/methodologie"
            className="font-medium text-slate-900 underline
                       underline-offset-2 hover:text-slate-600"
          >
            Méthodologie complète
          </Link>
        </p>
      </div>
    </section>
  );
}
