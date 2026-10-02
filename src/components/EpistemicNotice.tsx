import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
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
      className="overflow-hidden rounded-2xl border border-primary/30 bg-surface shadow-raised ring-1 ring-primary/10"
    >
      <h2
        id="epistemic-notice-title"
        className="flex items-center gap-2.5 bg-primary px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-primary-fg sm:px-6"
      >
        <ShieldAlert aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
        Ce que ce site montre — et ce qu&apos;il ne montre pas
      </h2>

      <div className="grid md:grid-cols-[1.65fr_1fr]">
        <div className="space-y-4 px-5 py-5 text-[0.9375rem] leading-relaxed text-fg sm:px-6 sm:py-6">
          <p className="text-fg-muted">
            Ce site cartographie des{" "}
            <strong className="font-semibold text-fg">co-occurrences textuelles</strong>{" "}
            dans la littérature indexée par PubMed : quels allèles HLA et
            quelles complications sont mentionnés ensemble, et à quelle
            fréquence, comparée à ce qu&apos;on attendrait si les mentions
            étaient réparties au hasard <strong className="font-semibold text-fg">dans le texte</strong>.
          </p>

          <p className="font-serif text-xl font-semibold leading-snug tracking-tight text-fg sm:text-2xl">
            Ce ne sont PAS des associations cliniques ni causales.
          </p>

          <p className="flex items-start gap-2 font-semibold text-fg">
            <AlertTriangle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-warn" />
            <span>{EXTRACTION_METRICS.errorRatePhrase}.</span>
          </p>

          <p className="rounded-lg border-l-[3px] border-primary bg-primary-soft/70 px-4 py-2.5 font-medium text-fg">
            Un signal fort reflète souvent une mode de publication, un biais
            d&apos;indexation, ou une erreur d&apos;extraction.
          </p>

          <p className="text-fg-muted">
            Toute lecture clinique exige de relire les sources. Le site y conduit
            systématiquement.
          </p>
        </div>

        <div className="flex flex-col gap-4 border-t border-line bg-surface-muted/70 px-5 py-5 sm:px-6 md:border-l md:border-t-0 md:py-6">
          <div>
            <p className="eyebrow">Métriques d&apos;extraction</p>
            <ul className="mt-3 space-y-3">
              <li className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
                <span className="text-sm text-fg-muted">Précision mesurée : </span>
                <span className="tabular font-serif text-xl font-semibold text-fg">
                  {EXTRACTION_METRICS.precisionPct}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-fg-muted">
                  Accord négation (kappa) :{" "}
                </span>
                <span className="text-right">
                  <span className="tabular font-serif text-xl font-semibold text-fg">
                    {EXTRACTION_METRICS.negationKappa}
                  </span>{" "}
                  <span className="text-xs text-fg-subtle">
                    ({EXTRACTION_METRICS.negationKappaGloss})
                  </span>
                </span>
              </li>
            </ul>
            {/*
              Le taux d'erreur, rendu visible : cinq mentions, une fausse.
              Reformulation du meme chiffre (pas une nouvelle mesure), sans
              repeter la phrase exacte deja lue a gauche.
            */}
            <div className="mt-4 rounded-lg border border-line bg-surface px-3 py-3">
              <div aria-hidden="true" className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="h-2 flex-1 rounded-sm bg-fg-subtle/60" />
                ))}
                <span className="h-2 flex-1 rounded-sm bg-warn" />
              </div>
              <p className="mt-2 text-xs leading-snug text-fg-muted">
                Sur 5 mentions extraites automatiquement, environ une est
                fausse : la relecture des phrases sources n&apos;est pas
                optionnelle.
              </p>
            </div>
            {stale ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-xs font-semibold text-warn-soft-fg"
              >
                ⚠ Ces métriques ont été mesurées sur le corpus{" "}
                {EXTRACTION_METRICS.measuredAgainstCorpus}, pas sur le corpus{" "}
                {corpusVersion} affiché ici. Elles doivent être remesurées.
              </p>
            ) : null}
          </div>

          <p className="mt-auto">
            <Link href="/methode" className="link inline-flex items-center gap-1 text-sm">
              Méthodologie complète
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
