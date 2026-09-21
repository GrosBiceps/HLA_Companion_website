import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAuthor,
  getAuthorInterests,
  getAuthorPublications,
  getCoAuthors,
} from "@/lib/queries";

/**
 * Fiche auteur — fonctionnalite secondaire du site : partant d'un auteur,
 * remonter ses publications et ses centres d'interet.
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
 * TRAJECTOIRE. Le corpus ne porte ni affiliation ni date par institution :
 * rien ne permet de tracer une trajectoire de carriere. On affiche donc
 * seulement ce qui est reellement derivable — l'etendue des annees de
 * publication — plutot que de fabriquer une narration a partir de donnees
 * absentes.
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

export default async function AuthorPage({ params }: Params) {
  const authorId = safeDecode((await params).authorId);

  const author = getAuthor(authorId);
  if (!author) notFound();

  const publications = getAuthorPublications(authorId);
  const interests = getAuthorInterests(authorId);
  const coAuthors = getCoAuthors(authorId);

  const years = publications.map((p) => p.year);
  const yearMin = years.length > 0 ? Math.min(...years) : null;
  const yearMax = years.length > 0 ? Math.max(...years) : null;

  // On n'affiche pas les listes entieres : un auteur prolifique du corpus
  // porte des dizaines d'entites. Le haut de la distribution suffit a dire
  // « sur quoi publie-t-il », le reste est atteignable par ses articles.
  const topHla = interests.hla.slice(0, 10);
  const topOutcomes = interests.outcomes.slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          {author.displayName}
        </h1>

        {/*
          LA RESERVE. Directement sous le nom, avant tout chiffre : elle doit
          etre lue avant la donnee qu'elle qualifie, pas apres.
        */}
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border-l-4
                     border-amber-600 bg-amber-50 px-3 py-2 text-sm
                     text-amber-950"
        >
          <span aria-hidden="true">ⓘ</span>
          <span>{HOMONYM_RESERVATION}</span>
        </p>

        <p className="text-sm text-slate-700">
          {publications.length} publication
          {publications.length > 1 ? "s" : ""} dans le corpus
          {yearMin !== null && yearMax !== null
            ? yearMin === yearMax
              ? ` (${yearMin})`
              : ` (${yearMin} – ${yearMax})`
            : ""}
          .
        </p>
      </header>

      <section
        aria-label="Comment lire cette fiche"
        className="rounded-md border-l-4 border-slate-900 bg-slate-100 px-4 py-3
                   text-sm text-slate-900"
      >
        <p>
          Cette fiche décrit ce que <strong>le corpus indexé attribue</strong> à
          ce nom : elle ne décrit ni une carrière ni une spécialité déclarée.
          Les thèmes ci-dessous comptent des articles, pas des travaux
          revendiqués.
        </p>
      </section>

      <section aria-label="Centres d'intérêt" className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide
                       text-slate-700">
          Centres d&apos;intérêt
        </h2>

        {topHla.length === 0 && topOutcomes.length === 0 ? (
          <p className="rounded-md border border-slate-300 bg-white px-4 py-3
                        text-sm text-slate-700">
            Aucune entité HLA ni complication n&apos;a été extraite des articles
            rattachés à ce nom.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {topHla.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Allèles récurrents
                </h3>
                <ul className="space-y-1">
                  {topHla.map(({ entity, nArticles }) => (
                    <li key={entity.hla} className="text-sm">
                      <Link
                        href={`/allele/${encodeURIComponent(entity.hla)}`}
                        className="text-slate-900 underline underline-offset-2
                                   hover:text-slate-600"
                      >
                        {entity.hla}
                      </Link>{" "}
                      <span className="text-slate-500">
                        ({nArticles} article{nArticles > 1 ? "s" : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {topOutcomes.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Complications récurrentes
                </h3>
                {/* Libelle clinique de la base, jamais la cle technique. */}
                <ul className="space-y-1">
                  {topOutcomes.map(({ entity, nArticles }) => (
                    <li key={entity.outcome} className="text-sm">
                      <Link
                        href={`/complication/${encodeURIComponent(entity.outcome)}`}
                        className="text-slate-900 underline underline-offset-2
                                   hover:text-slate-600"
                      >
                        {entity.label}
                      </Link>{" "}
                      <span className="text-slate-500">
                        ({nArticles} article{nArticles > 1 ? "s" : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section aria-label="Publications" className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide
                       text-slate-700">
          Publications ({publications.length})
        </h2>
        <ul className="space-y-2">
          {publications.map((article) => (
            <li
              key={article.pmid}
              className="rounded-md border border-slate-200 bg-white px-4 py-3"
            >
              <Link
                href={`/article/${encodeURIComponent(article.pmid)}`}
                className="text-sm font-medium text-slate-900 underline
                           underline-offset-2 hover:text-slate-600"
              >
                {article.title}
              </Link>
              <p className="mt-1 text-xs text-slate-600">
                {article.journal ?? article.journalAbbrev ?? "Revue non renseignée"}{" "}
                · {article.year}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {coAuthors.length > 0 ? (
        <section aria-label="Co-auteurs" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide
                         text-slate-700">
            Co-auteurs ({coAuthors.length})
          </h2>
          <p className="text-xs text-slate-600">
            Noms apparaissant sur les mêmes articles. La même réserve
            d&apos;homonymie s&apos;applique à chacun d&apos;eux.
          </p>
          <ul className="flex flex-wrap gap-2">
            {coAuthors.map((co) => (
              <li key={co.authorId}>
                <Link
                  href={`/auteur/${encodeURIComponent(co.authorId)}`}
                  className="inline-block rounded border border-slate-300
                             bg-white px-3 py-1 text-sm text-slate-900
                             hover:border-slate-800 hover:bg-slate-50"
                >
                  {co.displayName}{" "}
                  <span className="text-xs text-slate-500">
                    ({co.nSharedArticles})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
