import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { getCorpusVersion } from "@/lib/db";
import { EpistemicNotice } from "@/components/EpistemicNotice";
import { SignalIndicator } from "@/components/SignalIndicator";
import { Callout, Card, PageHeader } from "@/components/ui";
import {
  CLEAR_MIN_N,
  SIGNAL_LABELS,
  SIGNAL_LEVELS,
  SIGNIFICANCE_THRESHOLD,
  STRONG_MIN_N,
} from "@/lib/labels";
import { EXTRACTION_METRICS } from "@/lib/extraction-metrics";
import { formatInt } from "@/lib/format";
import { getCorpusStats } from "@/lib/queries";
import type { SignalLevel } from "@/lib/types";

/**
 * Methode — ce que mesurent les chiffres, et leurs limites.
 *
 * Cible de tous les liens « Méthodologie » / « En savoir plus » du site.
 * C'est la SEULE page ou les metriques (NPMI, odds ratio, Fisher, FDR) sont
 * nommees et definies hors d'un depliant : on les explique ici pour que le
 * lecteur qui ouvre un « Détail statistique » sache ce qu'il lit. Aucune
 * VALEUR de metrique n'y figure — seulement des definitions et des seuils.
 *
 * LES SEUILS SONT IMPORTES, PAS RECOPIES. Le tableau des niveaux de signal
 * lit `SIGNIFICANCE_THRESHOLD`, `STRONG_MIN_N` et `CLEAR_MIN_N` de
 * `labels.ts` (miroir de `compute_signal_level` dans `scripts/labels.py`) :
 * si le pipeline change un seuil, cette page suit. Les metriques
 * d'extraction viennent de `extraction-metrics.ts`, les effectifs de la base.
 *
 * L'encart epistemique (`EpistemicNotice`) reste en tete : une page de
 * methode qui commencerait par des formules se lirait comme une caution.
 */
export const metadata: Metadata = {
  title: "Méthode — ce que mesurent les chiffres",
  description:
    "Méthode d'extraction et de mesure des co-occurrences textuelles entre " +
    "allèles HLA et complications. Ce ne sont pas des associations cliniques.",
};

const TOC = [
  { id: "pipeline", label: "De PubMed au site" },
  { id: "corpus", label: "Corpus A et B" },
  { id: "co-occurrence", label: "Co-occurrence" },
  { id: "mesures", label: "Les mesures" },
  { id: "signal", label: "Niveaux de signal" },
  { id: "negations", label: "Négations" },
  { id: "qualite", label: "Qualité de l'extraction" },
  { id: "limites", label: "Limites et biais" },
  { id: "reproductibilite", label: "Reproductibilité" },
];

function Block({
  id,
  eyebrow,
  title,
  children,
  after,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Contenu pleine largeur (schema, tableau) rendu sous le texte. */
  after?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className="scroll-mt-40 space-y-4"
    >
      <div className="space-y-1">
        <p className="eyebrow">{eyebrow}</p>
        <h2
          id={`${id}-titre`}
          className="font-serif text-2xl font-semibold tracking-tight text-fg"
        >
          {title}
        </h2>
      </div>
      <div className="max-w-prose space-y-4 text-[0.9875rem] leading-relaxed text-fg-muted [&_strong]:font-semibold [&_strong]:text-fg">
        {children}
      </div>
      {after}
    </section>
  );
}

/** Formule en chasse fixe, sur fond teinte, defilable sur mobile. */
function Formula({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface-muted">
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed text-fg">
        {children}
      </pre>
      {caption ? (
        <figcaption className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

const PIPELINE: { step: string; title: string; body: string; where: string }[] =
  [
    {
      step: "1",
      title: "Interrogation PubMed",
      body: "Requête figée sur la transplantation rénale et le système HLA ; notices XML (titre, résumé, auteurs, MeSH).",
      where: "Pipeline Python",
    },
    {
      step: "2",
      title: "Filtrage de pertinence",
      body: "Dédoublonnage et exclusion des articles hors greffe rénale. Deux corrections du filtre ont retiré des contaminations inter-organes.",
      where: "Pipeline Python",
    },
    {
      step: "3",
      title: "Extraction NLP",
      body: "Repérage des allèles (nomenclature IPD-IMGT) et des complications (lexique de 21 termes), phrase par phrase, avec détection de négation.",
      where: "Pipeline Python",
    },
    {
      step: "4",
      title: "Statistiques",
      body: "Pour chaque paire allèle × complication : table 2 × 2 sur les articles, NPMI, odds ratio, tests de Fisher, correction FDR.",
      where: "Pipeline Python",
    },
    {
      step: "5",
      title: "CSV versionnés",
      body: "Sorties figées du pipeline : mentions, phrases sources, agrégats. Rien n'est saisi à la main.",
      where: "Contrat de schéma",
    },
    {
      step: "6",
      title: "Base SQLite scellée",
      body: "Construction, 8 validations bloquantes, index de recherche, empreinte SHA-256. Le site la lit en lecture seule.",
      where: "Ce dépôt",
    },
  ];

export default function MethodePage() {
  const corpus = getCorpusVersion();
  const stats = getCorpusStats();
  const threshold = String(SIGNIFICANCE_THRESHOLD).replace(".", ",");

  const rules: Record<SignalLevel, ReactNode> = {
    inverse: (
      <>
        odds ratio &lt; 1 <strong>et</strong> FDR bilatéral &lt; {threshold}.
        Testé <strong>en premier</strong>.
      </>
    ),
    strong: (
      <>
        FDR unilatéral &lt; {threshold} <strong>et</strong> n ≥ {STRONG_MIN_N}{" "}
        articles.
      </>
    ),
    clear: (
      <>
        FDR unilatéral &lt; {threshold} <strong>et</strong> {CLEAR_MIN_N} ≤ n
        &lt; {STRONG_MIN_N} articles.
      </>
    ),
    moderate: (
      <>
        FDR unilatéral &lt; {threshold} <strong>mais</strong> n &lt;{" "}
        {CLEAR_MIN_N} articles.
      </>
    ),
    weak: (
      <>
        FDR unilatéral ≥ {threshold}, ou non calculable. Affiché grisé, jamais
        masqué.
      </>
    ),
  };

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="À propos"
        title="Méthode"
        description="Comment le corpus est constitué, ce que mesure chaque chiffre du site, et pourquoi aucun d'eux n'est une association clinique."
      />

      {corpus.isSynthetic ? (
        <Callout tone="warn" title="Données synthétiques">
          <p>
            Le corpus affiché ({corpus.version}, {formatInt(stats.nArticles)}{" "}
            articles) est <strong>entièrement fictif</strong> : articles,
            auteurs et phrases sont générés pour développer l&apos;interface. La
            méthode décrite ici est celle qui s&apos;appliquera au corpus réel ;
            les chiffres actuels ne disent rien de la littérature.
          </p>
        </Callout>
      ) : null}

      <EpistemicNotice corpusVersion={corpus.version} />

      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Sommaire"
          className="lg:sticky lg:top-[calc(var(--header-h)+5rem)] lg:self-start"
        >
          <p className="eyebrow mb-2">Sommaire</p>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-1">
            {TOC.map((t, i) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="flex gap-2 rounded-md py-0.5 text-fg-muted hover:text-fg"
                >
                  <span className="tabular w-4 text-fg-faint">{i + 1}</span>
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-14">
          <Block
            id="pipeline"
            eyebrow="1 · Chaîne de traitement"
            title="De PubMed au site"
            after={
              <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PIPELINE.map((s, i) => (
                  <li key={s.step} className="relative">
                    <Card padding="sm" className="h-full p-4">
                      <div className="flex items-center gap-2">
                        <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
                          {s.step}
                        </span>
                        <p className="font-semibold text-fg">{s.title}</p>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                        {s.body}
                      </p>
                      <p className="mt-2 text-2xs uppercase tracking-wider text-fg-subtle">
                        {s.where}
                      </p>
                    </Card>
                    {i < PIPELINE.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 text-fg-faint sm:hidden"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            }
          >
            <p>
              Le site n&apos;interroge pas PubMed : il affiche le résultat
              <strong> figé et versionné</strong> d&apos;un pipeline externe.
              Chaque étape produit un artefact que la suivante relit ; une
              valeur agrégée qu&apos;on ne sait pas dériver des extractions est
              un bogue, pas une donnée.
            </p>
          </Block>

          <Block
            id="corpus"
            eyebrow="2 · Périmètre"
            title="Corpus A et corpus B"
          >
            <p>
              Le projet distingue deux univers,{" "}
              <strong>strictement scindés</strong> : le{" "}
              <strong>corpus A</strong> (espace allélique, 5 581 articles dans
              la révision 1.2 des manuscrits) et le <strong>corpus B</strong>{" "}
              (espace éplétique, 359 articles). Ils n&apos;ont ni le même
              dénominateur statistique ni le même vocabulaire d&apos;entités :
              les combiner produirait des chiffres faux.
            </p>
            <p>
              Ce site ne montre que le corpus A. Aucune vue ne mélange les deux.
              Les mentions d&apos;éplets que l&apos;on croise dans le corpus A
              (entité « HLA-eplet ») restent des mentions textuelles de
              l&apos;univers A, pas le corpus B.
            </p>
          </Block>

          <Block
            id="co-occurrence"
            eyebrow="3 · L'objet mesuré"
            title="Qu'est-ce qu'une co-occurrence ?"
          >
            <p>
              Une <strong>co-occurrence</strong> est le fait qu&apos;un allèle
              et une complication soient{" "}
              <strong>mentionnés dans la même phrase</strong> d&apos;un titre ou
              d&apos;un résumé. Chaque phrase retenue est conservée telle
              quelle, avec les deux segments repérés : c&apos;est elle que
              montre le tiroir « Voir les phrases ».
            </p>
            <p>
              L&apos;<strong>unité de compte est l&apos;article</strong>. Pour
              une paire (allèle A, complication C) parmi N articles, on
              construit une table 2 × 2 :
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse overflow-hidden rounded-lg text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left text-xs text-fg-subtle">
                    <th className="border border-line px-3 py-2 font-medium" />
                    <th className="border border-line px-3 py-2 font-medium">
                      C mentionnée
                    </th>
                    <th className="border border-line px-3 py-2 font-medium">
                      C absente
                    </th>
                  </tr>
                </thead>
                <tbody className="text-fg">
                  <tr>
                    <th className="border border-line px-3 py-2 text-left text-xs font-medium text-fg-subtle">
                      A mentionné
                    </th>
                    <td className="border border-line px-3 py-2 font-mono">
                      a — co-mentions
                    </td>
                    <td className="border border-line px-3 py-2 font-mono">
                      b
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-line px-3 py-2 text-left text-xs font-medium text-fg-subtle">
                      A absent
                    </th>
                    <td className="border border-line px-3 py-2 font-mono">
                      c
                    </td>
                    <td className="border border-line px-3 py-2 font-mono">
                      d
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Toutes les mesures d&apos;une paire découlent de cette{" "}
              <strong>même table</strong> : elles ne peuvent pas se contredire.
              Le nombre affiché sur les fiches (« 18 articles ») est{" "}
              <span className="font-mono text-fg">a</span> — la seule quantité
              qu&apos;un lecteur peut vérifier lui-même en lisant les phrases.
            </p>
            <p>
              Une co-occurrence dit qu&apos;<strong>on écrit</strong> ces deux
              termes ensemble. Elle ne dit pas ce qui arrive aux patients.
            </p>
          </Block>

          <Block
            id="mesures"
            eyebrow="4 · Définitions"
            title="Les mesures derrière le signal"
          >
            <p>
              Ces mesures gouvernent le niveau de signal affiché ; leurs valeurs
              ne sont visibles qu&apos;en dépliant le « Détail statistique »
              d&apos;une carte. Les voici définies, pour que ce dépliant se lise
              en connaissance de cause.
            </p>

            <h3 className="pt-2 font-semibold text-fg">
              NPMI — information mutuelle ponctuelle normalisée
            </h3>
            <Formula caption="Bornée entre −1 (jamais ensemble) et +1 (toujours ensemble) ; 0 = fréquence attendue si les mentions étaient réparties au hasard.">
              {`PMI  = ln( p(A,C) / (p(A) · p(C)) )
NPMI = PMI / −ln p(A,C)          p(A,C) = a / N, p(A) = (a+b) / N, p(C) = (a+c) / N`}
            </Formula>
            <p>
              La NPMI compare la fréquence observée de la co-mention à celle
              qu&apos;on attendrait par hasard. Elle est sensible aux effectifs
              très faibles : deux articles rares cités ensemble donnent une NPMI
              élevée sur presque rien.
            </p>

            <h3 className="pt-2 font-semibold text-fg">
              Odds ratio et intervalle de confiance
            </h3>
            <Formula caption="Correction de Haldane-Anscombe (+0,5 à chaque case) pour éviter les divisions par zéro ; IC 95 % de Woolf.">
              {`OR    = (a+½)(d+½) / ((b+½)(c+½))
IC95% = exp( ln OR ± 1,96 · √(1/(a+½) + 1/(b+½) + 1/(c+½) + 1/(d+½)) )`}
            </Formula>
            <p>
              Un odds ratio supérieur à 1 signifie que la complication est plus
              souvent <strong>écrite</strong> dans les articles qui mentionnent
              l&apos;allèle ; inférieur à 1, moins souvent. Il porte sur des
              articles, pas sur des patients.
            </p>

            <h3 className="pt-2 font-semibold text-fg">Test exact de Fisher</h3>
            <p>
              Deux tests sur la même table. Le test <strong>unilatéral</strong>{" "}
              (« plus de co-mentions qu&apos;attendu ») est le test principal ;
              il est structurellement aveugle au cas inverse. Le test{" "}
              <strong>bilatéral</strong> est donc aussi calculé, pour ne pas
              rendre invisibles les paires <em>moins</em> co-mentionnées
              qu&apos;attendu (signal inverse).
            </p>

            <h3 className="pt-2 font-semibold text-fg">
              FDR — correction de Benjamini–Hochberg
            </h3>
            <Formula caption="m = nombre de paires testées, p(i) = i-ème plus petite p-valeur ; la suite est rendue monotone et bornée à 1.">
              {`FDR(i) = min( 1, min_{k ≥ i} p(k) · m / k )`}
            </Formula>
            <p>
              Le corpus teste{" "}
              <strong className="tabular">
                {formatInt(stats.nAssociations)}
              </strong>{" "}
              paires à la fois : sur autant de tests, des p-valeurs basses
              apparaissent par simple hasard. La correction de
              Benjamini–Hochberg contrôle la{" "}
              <strong>proportion attendue de fausses découvertes</strong> parmi
              les paires retenues. Un seuil de FDR à {threshold} accepte
              qu&apos;environ 5 % des paires « au-dessus du seuil » le soient
              par hasard — avant même de compter les erreurs d&apos;extraction.
            </p>
          </Block>

          <Block
            id="signal"
            eyebrow="5 · Ce que le site affiche"
            title="Les niveaux de signal"
            after={
              <>
                <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted text-left text-xs text-fg-subtle">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Niveau</th>
                        <th className="px-4 py-2.5 font-medium">Règle</th>
                        <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                          Paires dans ce corpus
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {SIGNAL_LEVELS.map((level) => (
                        <tr key={level} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3">
                            <SignalIndicator level={level} />
                          </td>
                          <td className="px-4 py-3 text-fg-muted">
                            <p className="text-fg">{rules[level]}</p>
                            <p className="mt-0.5 text-xs text-fg-subtle">
                              {SIGNAL_LABELS[level].description}
                            </p>
                            <p className="tabular mt-1 text-xs text-fg-subtle sm:hidden">
                              {formatInt(stats.associationsBySignal[level])}{" "}
                              paires dans ce corpus
                            </p>
                          </td>
                          <td className="tabular hidden px-4 py-3 text-right text-fg sm:table-cell">
                            {formatInt(stats.associationsBySignal[level])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="max-w-prose space-y-3 text-sm leading-relaxed text-fg-muted">
                  <p>
                    « Au-dessus du seuil » désigne sur les fiches tout niveau
                    autre que faible. Le signal inverse est testé avant les
                    autres : une paire moins co-mentionnée qu&apos;attendu ne
                    doit pas se perdre en bas de liste. Ces seuils sont des
                    choix éditoriaux soumis à la relecture du laboratoire.
                  </p>
                </div>
              </>
            }
          >
            <p>
              Au lieu des scores, chaque paire reçoit un{" "}
              <strong>niveau qualitatif</strong>, calculé au build par la même
              règle dans le pipeline Python et dans ce site. Les seuils
              ci-dessous sont lus dans le code, pas recopiés. Le nombre
              d&apos;articles reste toujours affiché à côté.
            </p>
          </Block>

          <Block id="negations" eyebrow="6 · Polarité" title="Les négations">
            <p>
              Une phrase peut mentionner une paire pour la <strong>nier</strong>{" "}
              : « no significant difference in donor-specific antibodies between
              DQB1*02:01 carriers and non-carriers ». L&apos;extraction cherche
              un déclencheur de négation (« no », « not », « did not », «
              absence of »…) dans la phrase et marque la mention{" "}
              <strong>au sens négatif</strong>.
            </p>
            <p>
              Les mentions négatives sont{" "}
              <strong>comptées à part et jamais fondues</strong> dans le total :
              « 18 articles, dont 4 au sens négatif » raconte une controverse
              que « 18 articles » masquerait. Le site les affiche par défaut,
              avec le déclencheur détecté.
            </p>
            <p>
              Cette détection est faillible : l&apos;accord avec
              l&apos;annotation manuelle est <strong>modéré</strong> (kappa ={" "}
              {EXTRACTION_METRICS.negationKappa}). C&apos;est pourquoi chaque
              phrase négative porte la mention « Détection automatique — accord
              modéré, à vérifier ».
            </p>
          </Block>

          <Block
            id="qualite"
            eyebrow="7 · Validation"
            title="Qualité de l'extraction"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Card padding="sm" className="p-4">
                <p className="eyebrow">Précision</p>
                <p className="tabular mt-1 font-serif text-2xl font-semibold text-fg">
                  {EXTRACTION_METRICS.precisionPct}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  mentions correctes sur échantillon annoté
                </p>
              </Card>
              <Card padding="sm" className="p-4">
                <p className="eyebrow">Kappa négation</p>
                <p className="tabular mt-1 font-serif text-2xl font-semibold text-fg">
                  {EXTRACTION_METRICS.negationKappa}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  accord {EXTRACTION_METRICS.negationKappaGloss}
                </p>
              </Card>
              <Card padding="sm" className="p-4">
                <p className="eyebrow">En clair</p>
                <p className="mt-1 font-serif text-lg font-semibold leading-snug text-fg">
                  {EXTRACTION_METRICS.errorRatePhrase}
                </p>
              </Card>
            </div>
            <p>
              Ces chiffres viennent d&apos;une{" "}
              <strong>validation manuelle</strong> d&apos;un échantillon de
              mentions, mesurée sur une version donnée du pipeline. Ils ne se
              déduisent pas de la base. Le site compare la version de mesure (
              {EXTRACTION_METRICS.measuredAgainstCorpus}) à celle du corpus
              affiché, et avertit si elles divergent.
            </p>
            <p>
              Le <strong>surlignage</strong> des segments repérés, dans chaque
              phrase source, est l&apos;outil de contrôle : une extraction
              erronée se voit quand le surlignage porte sur le mauvais mot.
            </p>
          </Block>

          <Block id="limites" eyebrow="8 · Prudence" title="Limites et biais">
            <ul className="list-disc space-y-2 pl-5 marker:text-fg-faint">
              <li>
                <strong>Mode de publication.</strong> Un sujet en vogue (éplets,
                anticorps anti-donneur) multiplie les co-mentions sans
                qu&apos;aucun fait clinique nouveau n&apos;apparaisse. Le corpus
                grossit aussi d&apos;année en année : une pente montante sur une
                chronologie peut ne refléter que cette croissance.
              </li>
              <li>
                <strong>Biais d&apos;indexation.</strong> Seuls les titres et
                résumés indexés par PubMed sont lus, pas le texte intégral ; les
                résultats négatifs sont moins publiés que les positifs.
              </li>
              <li>
                <strong>Erreurs d&apos;extraction.</strong> Environ une mention
                sur cinq est fausse ; la négation est détectée avec un accord
                modéré.
              </li>
              <li>
                <strong>Non-indépendance.</strong> Plusieurs articles d&apos;une
                même équipe, ou une même cohorte publiée plusieurs fois,
                comptent comme autant d&apos;articles.
              </li>
              <li>
                <strong>Résolution allélique.</strong> « DQB1*02 » et «
                DQB1*02:01 » sont des entités distinctes : un article est compté
                sous la forme qu&apos;il écrit, et les effectifs ne
                s&apos;additionnent pas d&apos;un niveau à l&apos;autre.
              </li>
              <li>
                <strong>Tests multiples et petits effectifs.</strong> Même après
                correction FDR, une fraction des paires marquées l&apos;est par
                hasard ; un signal sur 1 ou 2 articles (« modéré ») est fragile.
              </li>
              <li>
                <strong>Homonymie des auteurs.</strong> L&apos;identité
                d&apos;auteur est déduite du nom normalisé : deux homonymes
                fusionnent, un changement de nom scinde une personne.
              </li>
            </ul>
            <p>
              Aucune de ces mesures ne remplace la lecture des sources. Le site
              est conçu pour y conduire : chaque nombre mène, en deux clics, aux
              phrases qui le produisent.
            </p>
          </Block>

          <Block
            id="reproductibilite"
            eyebrow="9 · Traçabilité"
            title="Reproductibilité"
          >
            <p>
              La base est un <strong>artefact de build</strong> reconstruit à
              partir des CSV du pipeline, avec des clés naturelles (PMID, forme
              IPD-IMGT) : deux constructions sur les mêmes sources donnent un
              fichier identique, vérifiable par son empreinte SHA-256.
            </p>
            <p>
              Huit validations bloquantes refusent toute base incohérente : le N
              annoncé est le N réel, aucune référence orpheline, chaque agrégat
              est égal au nombre de ses phrases sources, positives + négatives =
              total, arborescence HLA acyclique, NPMI dans [−1, 1] et FDR dans
              [0, 1], années plausibles, et chaque complication possède un
              libellé clinique — aucune clé technique ne peut atteindre
              l&apos;écran.
            </p>
            <p className="text-sm">
              Corpus affiché :{" "}
              <span className="allele text-fg">{corpus.version}</span>,
              construit le{" "}
              <span className="tabular">{corpus.builtAt.slice(0, 10)}</span>.
            </p>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Link
                href="/allele"
                className="link inline-flex items-center gap-1"
              >
                Parcourir les allèles{" "}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/complication"
                className="link inline-flex items-center gap-1"
              >
                Parcourir les complications{" "}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </p>
          </Block>
        </div>
      </div>
    </div>
  );
}
