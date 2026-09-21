import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlleleBreadcrumb } from "@/components/AlleleBreadcrumb";
import { AssociationCard } from "@/components/AssociationCard";
import { CATEGORIES } from "@/lib/labels";
import {
  getAlleleAncestry,
  getAlleleByKey,
  getAlleleChildren,
  getAssociationsForAllele,
} from "@/lib/queries";
import type { AssociationRow } from "@/lib/types";

/**
 * Fiche allele — Server Component. Page canonique du site.
 *
 * ENCODAGE DE L'URL. Une cle d'allele contient `*` et `:`
 * (« HLA-DQB1*02:01 »). Les liens l'encodent (`encodeURIComponent`) et la
 * route la decode (`decodeURIComponent`) : le param de route arrive
 * percent-encode et une comparaison brute avec la colonne `hla` echouerait,
 * donnant un 404 sur un allele existant. Le decodage est protege : une
 * sequence percent invalide (« %ZZ ») fait lever `decodeURIComponent`, ce qui
 * produirait une erreur 500 la ou un 404 est la reponse juste.
 *
 * CADRAGE. Le rappel global est monte dans `layout.tsx` — cette page le porte
 * donc meme atteinte par URL directe, sans passer par l'accueil. Elle ajoute
 * par-dessus un cadrage propre a la fiche, qui dit ce que le tri par force de
 * signal ne dit pas : que ces regroupements sont des co-mentions de termes, et
 * que la lecture passe par les phrases sources.
 *
 * REGROUPEMENT. Les associations sont groupees par categorie dans l'ordre de
 * `CATEGORIES` (ordre clinique, decide une fois pour tout le site), et a
 * l'interieur de chaque categorie dans l'ordre rendu par la requete (force de
 * signal decroissante, puis effectif). Les lignes non significatives ne sont
 * NI filtrees NI reportees en fin de liste : elles sont grisees par la carte,
 * a leur place. Une absence de signal sur une complication attendue est une
 * information, et elle se perd si on la relegue.
 */

/** Params de route Next 16 : asynchrones. */
type Params = { params: Promise<{ hla: string }> };

/** Decodage tolerant : une sequence percent invalide ne doit pas lever. */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const hla = safeDecode((await params).hla);
  return {
    title: `${hla} — co-occurrences textuelles`,
    description:
      `Complications co-mentionnées avec ${hla} dans la littérature indexée. ` +
      `Co-occurrences textuelles, pas des associations cliniques.`,
  };
}

/** Regroupe les associations par categorie, dans l'ordre de CATEGORIES. */
function groupByCategory(
  associations: AssociationRow[],
): { category: string; rows: AssociationRow[] }[] {
  const groups = new Map<string, AssociationRow[]>();
  for (const row of associations) {
    const bucket = groups.get(row.category);
    if (bucket) bucket.push(row);
    else groups.set(row.category, [row]);
  }

  const ordered: { category: string; rows: AssociationRow[] }[] = [];
  for (const category of CATEGORIES) {
    const rows = groups.get(category);
    if (rows && rows.length > 0) ordered.push({ category, rows });
    groups.delete(category);
  }
  // Une categorie inconnue de CATEGORIES (referentiel elargi cote pipeline
  // sans mise a jour de labels.ts) est rendue en fin de page plutot que
  // silencieusement perdue : une complication qui disparait de l'ecran est
  // pire qu'une categorie mal placee.
  for (const [category, rows] of groups) ordered.push({ category, rows });
  return ordered;
}

export default async function AllelePage({ params }: Params) {
  const hla = safeDecode((await params).hla);

  const allele = getAlleleByKey(hla);
  if (!allele) notFound();

  const associations = getAssociationsForAllele(hla);
  const ancestry = getAlleleAncestry(hla);
  const children = getAlleleChildren(hla);
  const groups = groupByCategory(associations);

  const nSignificant = associations.filter((a) => a.isSignificant).length;

  return (
    <div className="space-y-6">
      <AlleleBreadcrumb ancestry={ancestry} />

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{allele.hla}</h1>
        <p className="text-sm text-slate-700">
          Classe {allele.hlaClass}, locus {allele.locus}, résolution{" "}
          {allele.resolution} — mentionné dans {allele.nMentions} article
          {allele.nMentions > 1 ? "s" : ""} du corpus.
        </p>
      </header>

      {/*
        Cadrage propre a la fiche, qui s'ajoute au rappel global du layout. Il
        porte ce que le rappel global ne peut pas dire : ce que signifie le
        classement qui suit, sur CETTE page.
      */}
      <section
        aria-label="Comment lire cette fiche"
        className="rounded-md border-l-4 border-slate-900 bg-slate-100 px-4 py-3
                   text-sm text-slate-900"
      >
        <p>
          Chaque ligne compte des <strong>articles où l&apos;allèle et la
          complication sont mentionnés ensemble</strong>, comparé à ce
          qu&apos;on attendrait si les mentions étaient réparties au hasard dans
          le texte. Un signal fort reflète souvent une mode de publication, un
          biais d&apos;indexation ou une erreur d&apos;extraction.
        </p>
        <p className="mt-1">
          Toute lecture clinique exige de relire les phrases sources.{" "}
          <Link
            href="/methodologie"
            className="font-medium underline underline-offset-2
                       hover:text-slate-600"
          >
            Méthodologie
          </Link>
        </p>
      </section>

      <section aria-label="Complications co-mentionnées" className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide
                       text-slate-700">
          Complications co-mentionnées ({associations.length})
        </h2>

        {associations.length === 0 ? (
          <p className="rounded-md border border-slate-300 bg-white px-4 py-3
                        text-sm text-slate-700">
            Aucune complication n&apos;est co-mentionnée avec cet allèle dans ce
            corpus. Ce n&apos;est pas un résultat sur la clinique : c&apos;est
            l&apos;état de la littérature indexée telle qu&apos;elle a été
            extraite.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              {nSignificant} ligne{nSignificant > 1 ? "s" : ""} au-dessus du
              seuil statistique du corpus, {associations.length - nSignificant}{" "}
              en dessous. Les secondes restent affichées, grisées : une absence
              de signal est une information.
            </p>

            {groups.map(({ category, rows }) => (
              <div key={category} className="space-y-3">
                <h3 className="border-b border-slate-200 pb-1 text-sm
                               font-semibold text-slate-900">
                  {category}{" "}
                  <span className="font-normal text-slate-500">
                    ({rows.length})
                  </span>
                </h3>
                <div className="space-y-3">
                  {rows.map((row) => (
                    <AssociationCard
                      key={`${row.hla}:${row.outcome}`}
                      association={row}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      {children.length > 0 ? (
        <section aria-label="Allèles de résolution plus fine" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide
                         text-slate-700">
            Résolution plus fine
          </h2>
          <p className="text-xs text-slate-600">
            Ces allèles comptent leurs propres articles : les chiffres ci-dessus
            ne s&apos;y reportent pas tels quels.
          </p>
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.hla}>
                <Link
                  href={`/allele/${encodeURIComponent(child.hla)}`}
                  className="inline-block rounded border border-slate-300
                             bg-white px-3 py-1 text-sm text-slate-900
                             hover:border-slate-800 hover:bg-slate-50"
                >
                  {child.hla}{" "}
                  <span className="text-xs text-slate-500">
                    ({child.nMentions})
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
