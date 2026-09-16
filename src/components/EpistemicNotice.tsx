import Link from "next/link";

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
 * Les trois metriques sont celles de la validation manuelle de l'extraction
 * (cf. spec §5.2) et sont volontairement ecrites en dur ICI : ce sont des
 * constantes d'evaluation du pipeline, pas des comptages du corpus. Les
 * compteurs du corpus, eux, sont calcules en base (cf. page.tsx).
 */
export function EpistemicNotice() {
  return (
    <section
      aria-labelledby="epistemic-notice-title"
      className="rounded-lg border-2 border-slate-800 bg-slate-50 p-5"
    >
      <h2
        id="epistemic-notice-title"
        className="text-base font-bold uppercase tracking-wide text-slate-900"
      >
        Ce que ce site montre — et ce qu&apos;il ne montre pas
      </h2>

      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-800">
        <p>
          Ce site cartographie des <strong>co-occurrences textuelles</strong>{" "}
          dans la littérature indexée par PubMed : quels allèles HLA et quelles
          complications sont mentionnés ensemble, et à quelle fréquence par
          rapport au hasard.
        </p>

        <p className="font-semibold text-slate-900">
          Ce ne sont PAS des associations cliniques ni causales.
        </p>

        <p>
          Un signal fort peut refléter une mode de publication, un biais
          d&apos;indexation, ou une erreur d&apos;extraction.
        </p>

        <div>
          <p className="font-semibold text-slate-900">
            Métriques d&apos;extraction
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Précision mesurée : 78,75 %</li>
            <li>Accord négation (kappa) : 0,44 (modéré)</li>
            <li>~1 mention sur 5 est erronée</li>
          </ul>
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
