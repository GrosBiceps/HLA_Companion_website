import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HighlightedSentence } from "@/components/HighlightedSentence";
import {
  getArticle,
  getArticleAuthors,
  getArticleMentions,
  getOutcome,
} from "@/lib/queries";
import type { PairMention } from "@/lib/types";

/**
 * Fiche article — la PIECE JUSTIFICATIVE.
 *
 * C'est le bout de la chaine de verification : un chiffre de la fiche allele
 * renvoie a des phrases, et une phrase renvoie ici, a l'article qui la
 * contient — puis, par le lien PubMed, hors du site, vers la source que le
 * projet n'a pas ecrite.
 *
 * AUCUNE METRIQUE. Pas de NPMI, pas de FDR, pas d'odds ratio : cette page ne
 * porte que du texte source et des metadonnees bibliographiques. Le nombre de
 * citations est une metadonnee PubMed, pas une statistique du pipeline.
 *
 * LIBELLE CLINIQUE. Chaque mention affiche le libelle de `outcomes`, resolu
 * par `getOutcome`. La cle technique n'apparait pas ; elle ne sert qu'a
 * fabriquer le lien `/complication/<cle>`.
 *
 * SURLIGNAGE. `HighlightedSentence` marque les deux spans extraits. C'est ce
 * qui rend l'extraction verifiable : un span mal place saute aux yeux. La
 * phrase n'est ni tronquee ni normalisee.
 */

type Params = { params: Promise<{ pmid: string }> };

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const pmid = safeDecode((await params).pmid);
  const article = getArticle(pmid);
  if (!article) return { title: "Article inconnu" };
  return {
    title: `${article.title} (${article.year})`,
    description:
      `Article du corpus indexé — mentions HLA et complications repérées ` +
      `dans son texte.`,
  };
}

/**
 * Regroupe les mentions par paire (allele, complication).
 *
 * PAS DE CLE-CHAINE CONCATENEE. Une cle `${hla}<sep>${outcome}` oblige a
 * choisir un separateur qui n'apparait dans aucune des deux valeurs — or les
 * cles HLA contiennent deja `*`, `:` et `-`. On indexe donc une Map imbriquee
 * (hla -> outcome -> lignes) : aucune valeur n'est aplatie en texte, donc
 * aucune collision n'est possible et rien n'a besoin d'etre re-decoupe a la
 * sortie.
 */
function groupByPair(
  mentions: PairMention[],
): { hla: string; outcome: string; rows: PairMention[] }[] {
  const byHla = new Map<string, Map<string, PairMention[]>>();
  for (const m of mentions) {
    let byOutcome = byHla.get(m.hla);
    if (!byOutcome) {
      byOutcome = new Map<string, PairMention[]>();
      byHla.set(m.hla, byOutcome);
    }
    const bucket = byOutcome.get(m.outcome);
    if (bucket) bucket.push(m);
    else byOutcome.set(m.outcome, [m]);
  }

  // Les Map conservent l'ordre d'insertion : le tri de `getArticleMentions`
  // (hla ASC, outcome ASC) est donc preserve tel quel.
  const pairs: { hla: string; outcome: string; rows: PairMention[] }[] = [];
  for (const [hla, byOutcome] of byHla) {
    for (const [outcome, rows] of byOutcome) {
      pairs.push({ hla, outcome, rows });
    }
  }
  return pairs;
}

export default async function ArticlePage({ params }: Params) {
  const pmid = safeDecode((await params).pmid);

  const article = getArticle(pmid);
  if (!article) notFound();

  const authors = getArticleAuthors(pmid);
  const pairs = groupByPair(getArticleMentions(pmid));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{article.title}</h1>
        <p className="text-sm text-slate-700">
          {article.journal ?? article.journalAbbrev ?? "Revue non renseignée"} ·{" "}
          {article.year}
          {article.citedBy !== null ? ` · ${article.citedBy} citations` : ""}
        </p>
        <p className="text-sm">
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-900 underline underline-offset-2
                       hover:text-slate-600"
          >
            Lire la référence sur PubMed (PMID {pmid})
          </a>
        </p>
      </header>

      {authors.length > 0 ? (
        <section aria-label="Auteurs" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide
                         text-slate-700">
            Auteurs
          </h2>
          {/* Ordre de signature conserve : il porte de l'information. */}
          <ul className="flex flex-wrap gap-2">
            {authors.map((author) => (
              <li key={author.authorId}>
                <Link
                  href={`/auteur/${encodeURIComponent(author.authorId)}`}
                  className="inline-block rounded border border-slate-300
                             bg-white px-3 py-1 text-sm text-slate-900
                             hover:border-slate-800 hover:bg-slate-50"
                >
                  {author.displayName}
                  {author.isLast && authors.length > 1 ? (
                    <span className="ml-1 text-xs text-slate-500">
                      (dernier auteur)
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-600">
            Identités déduites par normalisation des noms — homonymes
            possibles.
          </p>
        </section>
      ) : null}

      {article.abstract ? (
        <section aria-label="Résumé" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide
                         text-slate-700">
            Résumé
          </h2>
          <p className="whitespace-pre-line rounded-md border border-slate-200
                        bg-white px-4 py-3 text-sm leading-relaxed
                        text-slate-800">
            {article.abstract}
          </p>
        </section>
      ) : null}

      <section aria-label="Mentions repérées" className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide
                       text-slate-700">
          Mentions repérées dans cet article ({pairs.length})
        </h2>

        {pairs.length === 0 ? (
          <p className="rounded-md border border-slate-300 bg-white px-4 py-3
                        text-sm text-slate-700">
            Aucune co-mention allèle / complication n&apos;a été extraite de cet
            article. L&apos;extraction est automatique et imparfaite : une
            absence ici ne dit rien du contenu réel de l&apos;article.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              Les segments surlignés sont ceux que l&apos;extraction a repérés.
              Relire la phrase entière est le seul moyen de vérifier qu&apos;ils
              portent bien sur ce qu&apos;ils prétendent.
            </p>

            {pairs.map(({ hla, outcome, rows }) => {
              // Le libelle clinique vient de la base, jamais la cle.
              //
              // `getOutcome` peut rendre null si `pair_mentions` reference une
              // complication absente de la table `outcomes` (derive de schema :
              // scenario realiste lors de la bascule vers les donnees reelles).
              // On affiche alors un libelle neutre plutot que la cle technique
              // brute (`graft_loss`...), qui violerait la regle d'affichage de
              // la spec §6. On ne 404 pas l'article entier pour une seule
              // complication inconnue : le reste des mentions reste utile.
              const clinical = getOutcome(outcome);
              const label = clinical?.label ?? "Complication non libellée";
              return (
                <div
                  key={`${hla}:${outcome}`}
                  className="space-y-2 rounded-lg border border-slate-300
                             bg-white p-4"
                >
                  <h3 className="text-base font-semibold text-slate-900">
                    <Link
                      href={`/allele/${encodeURIComponent(hla)}`}
                      className="underline underline-offset-2
                                 hover:text-slate-600"
                    >
                      {hla}
                    </Link>{" "}
                    <span className="font-normal text-slate-500">×</span>{" "}
                    <Link
                      href={`/complication/${encodeURIComponent(outcome)}`}
                      className="underline underline-offset-2
                                 hover:text-slate-600"
                    >
                      {label}
                    </Link>
                  </h3>

                  <ul className="space-y-3">
                    {rows.map((mention) => (
                      <li
                        key={mention.pairMentionId}
                        className="border-l-2 border-slate-200 pl-3 text-sm
                                   text-slate-800"
                      >
                        <HighlightedSentence
                          sentence={mention.sentence}
                          hlaSpan={mention.hlaSpan}
                          outcomeSpan={mention.outcomeSpan}
                        />
                        {mention.polarity === "negated" ? (
                          <p className="mt-1 text-sm font-medium
                                        text-amber-900">
                            Mention au sens négatif
                            {mention.negationTrigger
                              ? ` (« ${mention.negationTrigger} »)`
                              : ""}{" "}
                            — la phrase nie la co-occurrence.
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
