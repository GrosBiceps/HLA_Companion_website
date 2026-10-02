import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink, Quote } from "lucide-react";
import { HighlightedSentence } from "@/components/HighlightedSentence";
import { HighlightedText } from "@/components/entity/HighlightedText";
import {
  AlleleName,
  Badge,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  Section,
  buttonClasses,
} from "@/components/ui";
import { OrganBadges } from "@/components/organ/OrganChip";
import { cn } from "@/lib/cn";
import { organFromPage, withOrgan, type PageSearchParams } from "@/lib/organ";
import { categoryClasses } from "@/lib/theme";
import { formatInt, plural } from "@/lib/format";
import type { HighlightNeedle } from "@/lib/highlight";
import {
  getArticle,
  getArticleAuthors,
  getArticleEntities,
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
 * MISE EN PAGE DE LECTURE. Colonne de texte (titre, auteurs, resume) a
 * gauche, colonne d'appui a droite (references externes, entites reperees).
 * Le titre et le resume sont surlignes avec les segments que l'extraction a
 * reconnus dans l'article (`hla_mentions`, `outcome_mentions`) : le lecteur
 * voit ce que la machine a vu, et ce qu'elle a manque.
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
 *
 * ORGANE. L'article porte les organes qu'il concerne (puces sous le titre :
 * un article peut en concerner plusieurs). Cliquer une puce selectionne
 * l'organe ; les liens de la page reportent la strate courante.
 */

type Params = { params: Promise<{ pmid: string }> };
type Props = Params & { searchParams?: PageSearchParams };

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
 * PAS DE CLE-CHAINE CONCATENEE. Les cles HLA contiennent deja `*`, `:` et
 * `-` : on indexe une Map imbriquee (hla -> outcome -> lignes), aucune
 * collision n'est possible.
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
  // Ordre d'insertion conserve : le tri de `getArticleMentions`.
  const pairs: { hla: string; outcome: string; rows: PairMention[] }[] = [];
  for (const [hla, byOutcome] of byHla) {
    for (const [outcome, rows] of byOutcome) pairs.push({ hla, outcome, rows });
  }
  return pairs;
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const pmid = safeDecode((await params).pmid);
  const organ = await organFromPage(searchParams);
  const baseHref = `/article/${encodeURIComponent(pmid)}`;

  const article = getArticle(pmid);
  if (!article) notFound();

  const authors = getArticleAuthors(pmid);
  const mentions = getArticleMentions(pmid);
  const pairs = groupByPair(mentions);
  const entities = getArticleEntities(pmid);
  const nNegated = mentions.filter((m) => m.polarity === "negated").length;

  // Segments a surligner dans le titre et le resume : spans extraits ET cles
  // HLA (la forme canonique apparait souvent telle quelle dans le titre).
  const needles: HighlightNeedle[] = [
    ...entities.hla.flatMap((e) => [
      { text: e.hla, kind: "hla" as const },
      ...e.spans.map((s) => ({ text: s, kind: "hla" as const })),
    ]),
    ...entities.outcomes.flatMap((e) =>
      e.spans.map((s) => ({ text: s, kind: "outcome" as const })),
    ),
    ...mentions.flatMap((m) => [
      { text: m.hlaSpan, kind: "hla" as const },
      { text: m.outcomeSpan, kind: "outcome" as const },
    ]),
  ];

  const pubmed = `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
  const doiHref = article.doi ? `https://doi.org/${article.doi}` : null;
  const journal =
    article.journal ?? article.journalAbbrev ?? "Revue non renseignée";

  return (
    <div className="space-y-8 sm:space-y-10">
      <nav aria-label="Fil d'Ariane" className="text-sm text-fg-muted">
        Article <span className="allele">PMID {pmid}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <article className="min-w-0 space-y-6">
          <PageHeader
            eyebrow={
              <>
                <span className="italic normal-case tracking-normal">
                  {journal}
                </span>{" "}
                · <span className="tabular">{article.year}</span>
              </>
            }
            title={
              <span className="text-2xl leading-snug sm:text-[2rem]">
                <HighlightedText text={article.title} needles={needles} />
              </span>
            }
          />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
            <span className="eyebrow">
              {article.organs.length > 1 ? "Organes" : "Organe"}
            </span>
            <OrganBadges
              organs={article.organs}
              selected={organ}
              hrefFor={(o) => withOrgan(baseHref, o)}
            />
          </div>

          {authors.length > 0 ? (
            <section aria-label="Auteurs" className="space-y-2">
              {/* Ordre de signature conserve : il porte de l'information. */}
              <ol className="flex flex-wrap gap-x-1 gap-y-1 text-sm leading-relaxed">
                {authors.map((author, i) => (
                  <li key={author.authorId} className="inline">
                    <Link
                      href={withOrgan(`/auteur/${encodeURIComponent(author.authorId)}`, organ)}
                      className="font-medium text-fg underline decoration-fg/20 underline-offset-[3px] hover:text-primary hover:decoration-primary"
                    >
                      {author.displayName}
                    </Link>
                    {i === 0 && authors.length > 1 ? (
                      <sup className="ml-0.5 text-2xs text-fg-subtle">1er</sup>
                    ) : null}
                    {author.isLast && authors.length > 1 ? (
                      <sup className="ml-0.5 text-2xs text-fg-subtle">
                        dernier
                      </sup>
                    ) : null}
                    {i < authors.length - 1 ? (
                      <span className="text-fg-faint">,</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-fg-subtle">
                Identités déduites par normalisation des noms — homonymes
                possibles.
              </p>
            </section>
          ) : null}

          <Section title="Résumé" aria-label="Résumé">
            {article.abstract ? (
              <Card padding="lg">
                <p className="max-w-prose whitespace-pre-line font-serif text-[1.0625rem] leading-[1.75] text-fg">
                  <HighlightedText text={article.abstract} needles={needles} />
                </p>
              </Card>
            ) : (
              <p className="text-sm text-fg-muted">
                Aucun résumé n&apos;est indexé pour cet article.
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-subtle">
              <span className="inline-flex items-center gap-1.5">
                <mark className="rounded-[3px] bg-mark-hla px-1 text-mark-hla-fg">
                  allèle
                </mark>
                segment repéré comme allèle
              </span>
              <span className="inline-flex items-center gap-1.5">
                <mark className="rounded-[3px] bg-mark-outcome px-1 text-mark-outcome-fg">
                  complication
                </mark>
                segment repéré comme complication
              </span>
            </p>
          </Section>
        </article>

        <aside className="space-y-5 lg:pt-1">
          <Card padding="sm" className="space-y-2.5 p-4">
            <p className="eyebrow">Source</p>
            <a
              href={pubmed}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonClasses("primary", "md"),
                "w-full justify-center",
              )}
            >
              Ouvrir dans PubMed
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
            {doiHref ? (
              <a
                href={doiHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonClasses("secondary", "md"),
                  "w-full justify-center",
                )}
              >
                DOI{" "}
                <span className="allele truncate text-xs">{article.doi}</span>
                <ExternalLink
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                />
              </a>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-xs">
              <dt className="text-fg-subtle">Revue</dt>
              <dd className="text-fg">{journal}</dd>
              <dt className="text-fg-subtle">Année</dt>
              <dd className="tabular text-fg">{article.year}</dd>
              {article.country ? (
                <>
                  <dt className="text-fg-subtle">Pays</dt>
                  <dd className="text-fg">{article.country}</dd>
                </>
              ) : null}
              {article.citedBy !== null ? (
                <>
                  <dt className="text-fg-subtle">Citations</dt>
                  <dd className="tabular text-fg">
                    {formatInt(article.citedBy)}
                  </dd>
                </>
              ) : null}
            </dl>
          </Card>

          {entities.hla.length + entities.outcomes.length > 0 ? (
            <Card padding="sm" className="space-y-3 p-4">
              <p className="eyebrow">Entités repérées</p>
              {entities.hla.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {entities.hla.map((e) => (
                    <li key={e.hla}>
                      <Link
                        href={withOrgan(`/allele/${encodeURIComponent(e.hla)}`, organ)}
                        className="inline-flex items-center gap-1 rounded-md bg-mark-hla px-1.5 py-0.5 text-xs text-mark-hla-fg hover:underline"
                      >
                        <AlleleName hla={e.hla} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {entities.outcomes.length > 0 ? (
                <ul className="space-y-1">
                  {entities.outcomes.map((e) => (
                    <li
                      key={e.outcome}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          categoryClasses(e.category).bg,
                        )}
                      />
                      <Link
                        href={withOrgan(`/complication/${encodeURIComponent(e.outcome)}`, organ)}
                        className="min-w-0 truncate text-fg hover:text-primary hover:underline"
                      >
                        {e.label}
                      </Link>
                      {e.nNegated > 0 ? (
                        <Badge tone="warn" size="xs" className="ml-auto">
                          niée
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </aside>
      </div>

      <Section
        title={`Mentions repérées dans cet article (${pairs.length})`}
        aria-label="Mentions repérées"
        description={
          pairs.length > 0
            ? `${plural(mentions.length, "phrase")} de co-mention${
                nNegated > 0 ? `, dont ${nNegated} au sens négatif` : ""
              }. Les segments surlignés sont ceux que l'extraction a repérés : relire la phrase entière est le seul moyen de vérifier qu'ils portent bien sur ce qu'ils prétendent.`
            : undefined
        }
      >
        {pairs.length === 0 ? (
          <EmptyState
            icon={<Quote />}
            title="Aucune co-mention extraite"
            description="Aucune co-mention allèle / complication n'a été extraite de cet article. L'extraction est automatique et imparfaite : une absence ici ne dit rien du contenu réel de l'article."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pairs.map(({ hla, outcome, rows }) => {
              // Le libelle clinique vient de la base, jamais la cle.
              //
              // `getOutcome` peut rendre null si `pair_mentions` reference une
              // complication absente de la table `outcomes` (derive de schema).
              // On affiche alors un libelle neutre plutot que la cle technique
              // brute, qui violerait la regle d'affichage de la spec §6.
              const clinical = getOutcome(outcome);
              const label = clinical?.label ?? "Complication non libellée";
              return (
                <Card key={`${hla}:${outcome}`} className="space-y-3">
                  <h3 className="flex flex-wrap items-baseline gap-x-1.5 text-[0.975rem] font-semibold leading-snug text-fg">
                    <AlleleName hla={hla} href organ={organ} />
                    <span className="font-normal text-fg-subtle">×</span>
                    <Link
                      href={withOrgan(`/complication/${encodeURIComponent(outcome)}`, organ)}
                      className="text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary"
                    >
                      {label}
                    </Link>
                  </h3>
                  <ul className="space-y-3">
                    {rows.map((mention) => (
                      <li
                        key={mention.pairMentionId}
                        className={cn(
                          "border-l-2 pl-3 text-sm text-fg",
                          mention.polarity === "negated"
                            ? "border-warn"
                            : "border-line-strong",
                        )}
                      >
                        <blockquote className="leading-relaxed">
                          <HighlightedSentence
                            sentence={mention.sentence}
                            hlaSpan={mention.hlaSpan}
                            outcomeSpan={mention.outcomeSpan}
                          />
                        </blockquote>
                        {mention.polarity === "negated" ? (
                          <p className="mt-1.5 text-xs font-medium text-warn-soft-fg">
                            Mention au sens négatif
                            {mention.negationTrigger
                              ? ` (« ${mention.negationTrigger} »)`
                              : ""}{" "}
                            — la phrase nie la co-occurrence. Détection
                            automatique, à vérifier.
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Callout tone="info">
        Extraction automatique : environ une mention sur cinq est erronée, et la
        détection de négation n&apos;est que modérément fiable. La{" "}
        <Link href="/methode" className="link">
          méthodologie
        </Link>{" "}
        détaille ce que l&apos;extraction repère et ce qu&apos;elle manque.
      </Callout>
    </div>
  );
}
