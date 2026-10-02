import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Info } from "lucide-react";
import {
  AlleleName,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Section,
  StatTile,
} from "@/components/ui";
import { BarList } from "@/components/entity/BarList";
import { YearSparkline } from "@/components/entity/YearSparkline";
import { categoryColor, hlaClassColor } from "@/lib/theme";
import { formatInt, plural, yearSpan } from "@/lib/format";
import {
  getAuthor,
  getAuthorInterests,
  getAuthorPublications,
  getAuthorshipRoles,
  getCoAuthors,
  getCorpusYearRange,
  type YearCount,
} from "@/lib/queries";
import type { Article } from "@/lib/types";

/**
 * Fiche auteur — fonctionnalite secondaire du site : partant d'un auteur,
 * remonter ses publications et son profil thematique.
 *
 * ⚠ LA RESERVE SUR L'HOMONYMIE EST OBLIGATOIRE, ET ELLE EST SOUS LE NOM.
 *
 * L'identite d'auteur du corpus est un SLUG DERIVE DU NOM (« wiebe-a »), pas
 * un identifiant verifie type ORCID. Cette normalisation est fallible dans
 * les deux sens : elle FUSIONNE deux personnes distinctes portant le meme nom
 * (« Wang J. » est un cas d'ecole), et elle SCINDE une meme personne dont le
 * nom a change ou est translittere differemment.
 *
 * La consequence n'est pas cosmetique. Un chef de service qui trouve sur
 * « sa » fiche la publication d'un homonyme conclut que le site se trompe —
 * et il a raison sur ce point precis. S'il ne trouve nulle part la mise en
 * garde, il etend sa defiance a tout le reste, y compris aux parties exactes.
 * Cette phrase est l'attenuation : elle place l'incertitude AVANT la donnee,
 * au lieu de laisser l'utilisateur la decouvrir par une erreur.
 *
 * Elle est donc rendue juste apres le <h1>, non repliee, non survolable, et
 * son libelle exact est verrouille par un test
 * (`src/__tests__/author-page.test.tsx`). Ne pas la reformuler.
 *
 * PROFIL THEMATIQUE = EFFECTIFS DESCRIPTIFS. Les barres comptent des
 * articles de cet auteur ou l'entite est mentionnee. Ce n'est ni une
 * specialite declaree ni une mesure d'association.
 *
 * TRAJECTOIRE. Le corpus ne porte ni affiliation ni date par institution :
 * on n'affiche que ce qui est derivable — publications par annee, position
 * de signature — plutot que de fabriquer une narration.
 */

/** Libelle exact impose par la spec. NE PAS REFORMULER. */
export const HOMONYM_RESERVATION =
  "Identité déduite par normalisation du nom — homonymes possibles";

type Params = { params: Promise<{ authorId: string }> };

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const authorId = safeDecode((await params).authorId);
  const author = getAuthor(authorId);
  if (!author) return { title: "Auteur inconnu" };
  return {
    title: `${author.displayName} — publications indexées`,
    description:
      `Publications et thèmes récurrents attribués à ${author.displayName} ` +
      `dans le corpus indexé. Identité déduite du nom : homonymes possibles.`,
  };
}

/** Serie annuelle dense des publications, sur les bornes du corpus. */
function yearSeries(publications: Article[]): YearCount[] {
  const range = getCorpusYearRange();
  if (!range) return [];
  const counts = new Map<number, number>();
  for (const p of publications)
    counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
  const out: YearCount[] = [];
  for (let y = range.min; y <= range.max; y++)
    out.push({ year: y, n: counts.get(y) ?? 0 });
  return out;
}

/** Publications groupees par annee, de la plus recente a la plus ancienne. */
function byYear(publications: Article[]): { year: number; items: Article[] }[] {
  const groups: { year: number; items: Article[] }[] = [];
  for (const p of publications) {
    const last = groups[groups.length - 1];
    if (last && last.year === p.year) last.items.push(p);
    else groups.push({ year: p.year, items: [p] });
  }
  return groups;
}

export default async function AuthorPage({ params }: Params) {
  const authorId = safeDecode((await params).authorId);

  const author = getAuthor(authorId);
  if (!author) notFound();

  const publications = getAuthorPublications(authorId);
  const interests = getAuthorInterests(authorId);
  const coAuthors = getCoAuthors(authorId);
  const roles = getAuthorshipRoles(authorId);

  const years = publications.map((p) => p.year);
  const yearMin = years.length > 0 ? Math.min(...years) : null;
  const yearMax = years.length > 0 ? Math.max(...years) : null;

  // Le haut de la distribution suffit a dire « sur quoi publie-t-il » ; le
  // reste est atteignable par ses articles.
  const topHla = interests.hla
    .filter(
      (i) =>
        i.entity.resolution === "2-digit" || i.entity.resolution === "4-digit",
    )
    .slice(0, 8);
  const topOutcomes = interests.outcomes.slice(0, 8);
  const topCo = coAuthors.slice(0, 10);
  const otherCo = coAuthors.slice(10);
  const nPub = publications.length;

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHeader eyebrow="Fiche auteur" title={author.displayName}>
        {/*
          LA RESERVE. Directement sous le nom, avant tout chiffre : elle doit
          etre lue avant la donnee qu'elle qualifie, pas apres.
        */}
        <p
          role="note"
          className="flex max-w-prose items-start gap-2 rounded-lg border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-sm text-warn-soft-fg"
        >
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{HOMONYM_RESERVATION}</span>
        </p>
        <p className="text-base text-fg-muted">
          {nPub} publication{nPub > 1 ? "s" : ""} dans le corpus
          {yearMin !== null && yearMax !== null
            ? yearMin === yearMax
              ? ` (${yearMin})`
              : ` (${yearMin} – ${yearMax})`
            : ""}
          .
        </p>
      </PageHeader>

      <Callout
        tone="framing"
        title="Comment lire cette fiche"
        aria-label="Comment lire cette fiche"
      >
        <p>
          Cette fiche décrit ce que <strong>le corpus indexé attribue</strong> à
          ce nom : elle ne décrit ni une carrière ni une spécialité déclarée.
          Les thèmes ci-dessous comptent des articles, pas des travaux
          revendiqués.
        </p>
      </Callout>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Publications"
          value={formatInt(nPub)}
          hint="dans le corpus indexé"
        />
        <StatTile
          label="Période"
          value={yearSpan(yearMin, yearMax) ?? "—"}
          hint="première et dernière publication"
        />
        <StatTile
          label="Co-auteurs"
          value={formatInt(coAuthors.length)}
          hint="noms distincts sur ses articles"
        />
        <StatTile
          label="Premier / dernier"
          value={
            <>
              {roles.first}
              <span className="text-base font-normal text-fg-subtle"> / </span>
              {roles.last}
            </>
          }
          hint="position de signature"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader eyebrow="Chronologie" title="Publications par année" />
          <div className="mt-4">
            <YearSparkline
              series={yearSeries(publications)}
              unit="publication"
            />
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Signature" title="Position dans les auteurs" />
          {nPub > 0 ? (
            <>
              <div
                aria-hidden="true"
                className="mt-5 flex h-3 gap-[2px] overflow-hidden rounded-full"
              >
                {[
                  { n: roles.first, cls: "bg-primary" },
                  { n: roles.middle, cls: "bg-primary/35" },
                  { n: roles.last, cls: "bg-accent" },
                ]
                  .filter((s) => s.n > 0)
                  .map((s, i) => (
                    <span key={i} className={s.cls} style={{ flexGrow: s.n }} />
                  ))}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-fg-muted">
                <li className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-sm bg-primary"
                  />
                  Premier auteur{" "}
                  <span className="tabular ml-auto text-fg">{roles.first}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-sm bg-primary/35"
                  />
                  Position intermédiaire{" "}
                  <span className="tabular ml-auto text-fg">
                    {roles.middle}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-sm bg-accent"
                  />
                  Dernier auteur{" "}
                  <span className="tabular ml-auto text-fg">{roles.last}</span>
                </li>
              </ul>
            </>
          ) : null}
        </Card>
      </div>

      <Section
        title="Profil thématique"
        aria-label="Centres d'intérêt"
        description="Entités les plus souvent présentes dans ses articles, en nombre d'articles. Un décompte descriptif : ni une spécialité, ni une mesure d'association."
      >
        {topHla.length === 0 && topOutcomes.length === 0 ? (
          <EmptyState
            title="Aucune entité extraite"
            description="Aucune entité HLA ni complication n'a été extraite des articles rattachés à ce nom."
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Allèles les plus présents" />
              {topHla.length > 0 ? (
                <BarList
                  className="mt-4"
                  unit="art."
                  max={nPub}
                  items={topHla.map(({ entity, nArticles }) => ({
                    key: entity.hla,
                    href: `/allele/${encodeURIComponent(entity.hla)}`,
                    label: <AlleleName hla={entity.hla} />,
                    value: nArticles,
                    color: hlaClassColor(entity.hlaClass).css,
                    dot: hlaClassColor(entity.hlaClass).css,
                    title: `${entity.hla} — classe ${entity.hlaClass}`,
                  }))}
                />
              ) : (
                <p className="mt-3 text-sm text-fg-muted">
                  Aucun allèle extrait.
                </p>
              )}
              <p className="mt-4 flex gap-4 text-2xs text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ background: hlaClassColor("I").css }}
                  />
                  Classe I
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ background: hlaClassColor("II").css }}
                  />
                  Classe II
                </span>
                <span className="ml-auto">
                  échelle : ses {plural(nPub, "publication")}
                </span>
              </p>
            </Card>
            <Card>
              <CardHeader title="Complications les plus présentes" />
              {topOutcomes.length > 0 ? (
                <BarList
                  className="mt-4"
                  unit="art."
                  max={nPub}
                  items={topOutcomes.map(({ entity, nArticles }) => ({
                    key: entity.outcome,
                    href: `/complication/${encodeURIComponent(entity.outcome)}`,
                    // Libelle clinique de la base, jamais la cle technique.
                    label: entity.label,
                    value: nArticles,
                    color: categoryColor(entity.category).css,
                    dot: categoryColor(entity.category).css,
                  }))}
                />
              ) : (
                <p className="mt-3 text-sm text-fg-muted">
                  Aucune complication extraite.
                </p>
              )}
              <p className="mt-4 text-right text-2xs text-fg-subtle">
                pastille : catégorie clinique · échelle : ses{" "}
                {plural(nPub, "publication")}
              </p>
            </Card>
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section title={`Publications (${nPub})`} aria-label="Publications">
          <div className="space-y-5">
            {byYear(publications).map(({ year, items }) => (
              <div key={year} className="grid grid-cols-[3.25rem_1fr] gap-3">
                <p className="tabular pt-3 font-serif text-lg font-semibold text-fg-subtle">
                  {year}
                </p>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
                  {items.map((article) => (
                    <li key={article.pmid} className="px-4 py-3">
                      <Link
                        href={`/article/${encodeURIComponent(article.pmid)}`}
                        className="text-sm font-medium leading-snug text-fg hover:text-primary hover:underline hover:decoration-primary/40 hover:underline-offset-[3px]"
                      >
                        {article.title}
                      </Link>
                      <p className="mt-1 text-xs text-fg-muted">
                        <span className="italic">
                          {article.journal ??
                            article.journalAbbrev ??
                            "Revue non renseignée"}
                        </span>{" "}
                        ·{" "}
                        <span className="allele text-fg-subtle">
                          PMID {article.pmid}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {coAuthors.length > 0 ? (
          <Section
            title={`Co-auteurs (${coAuthors.length})`}
            aria-label="Co-auteurs"
          >
            <Card>
              <p className="text-xs text-fg-muted">
                Noms apparaissant sur les mêmes articles, par nombre
                d&apos;articles partagés. La même réserve d&apos;homonymie
                s&apos;applique à chacun d&apos;eux.
              </p>
              <BarList
                className="mt-4"
                unit="art."
                items={topCo.map((co) => ({
                  key: co.authorId,
                  href: `/auteur/${encodeURIComponent(co.authorId)}`,
                  label: co.displayName,
                  value: co.nSharedArticles,
                }))}
              />
              {otherCo.length > 0 ? (
                <details className="group mt-4 border-t border-line pt-3">
                  <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
                    <ChevronRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                    />
                    {otherCo.length} autre{otherCo.length > 1 ? "s" : ""}{" "}
                    co-auteur
                    {otherCo.length > 1 ? "s" : ""}
                  </summary>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {otherCo.map((co) => (
                      <li key={co.authorId}>
                        <Link
                          href={`/auteur/${encodeURIComponent(co.authorId)}`}
                          className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs text-fg ring-1 ring-inset ring-line hover:ring-line-strong"
                        >
                          {co.displayName}
                          <span className="tabular text-fg-subtle">
                            {co.nSharedArticles}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
