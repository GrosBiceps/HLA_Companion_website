import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlleleBreadcrumb } from "@/components/AlleleBreadcrumb";
import { AssociationCard } from "@/components/AssociationCard";
import { CATEGORIES } from "@/lib/labels";
import { categoryClasses, categoryDisplay } from "@/lib/theme";
import { AlleleName, Badge, HlaClassBadge, PageHeader } from "@/components/ui";
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

      <PageHeader
        eyebrow="Fiche allèle"
        title={<AlleleName hla={allele.hla} className="font-semibold" />}
        meta={
          <>
            <HlaClassBadge hlaClass={allele.hlaClass} />
            <Badge>Locus {allele.locus}</Badge>
            <Badge>Résolution {allele.resolution}</Badge>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          Classe {allele.hlaClass}, locus {allele.locus}, résolution{" "}
          {allele.resolution} — mentionné dans{" "}
          <strong className="tabular font-semibold text-fg">
            {allele.nMentions} article{allele.nMentions > 1 ? "s" : ""}
          </strong>{" "}
          du corpus.
        </p>
      </PageHeader>

      {/*
        Cadrage propre a la fiche, qui s'ajoute au rappel global du layout. Il
        porte ce que le rappel global ne peut pas dire : ce que signifie le
        classement qui suit, sur CETTE page.
      */}
      <section
        aria-label="Comment lire cette fiche"
        className="rounded-lg border-l-[3px] border-primary/60 bg-primary-soft/60 px-4 py-3 text-sm leading-relaxed text-fg"
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
            href="/methode"
            className="font-medium underline decoration-primary/30 underline-offset-[3px]
                       hover:text-primary"
          >
            Méthodologie
          </Link>
        </p>
      </section>

      <section aria-label="Complications co-mentionnées" className="space-y-6">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-fg">
          Complications co-mentionnées{" "}
          <span className="tabular font-sans text-base font-normal text-fg-subtle">
            ({associations.length})
          </span>
        </h2>

        {associations.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-3
                        text-sm text-fg-muted">
            Aucune complication n&apos;est co-mentionnée avec cet allèle dans ce
            corpus. Ce n&apos;est pas un résultat sur la clinique : c&apos;est
            l&apos;état de la littérature indexée telle qu&apos;elle a été
            extraite.
          </p>
        ) : (
          <>
            <p className="text-xs text-fg-muted">
              {nSignificant} ligne{nSignificant > 1 ? "s" : ""} au-dessus du
              seuil statistique du corpus, {associations.length - nSignificant}{" "}
              en dessous. Les secondes restent affichées, grisées : une absence
              de signal est une information.
            </p>

            {groups.map(({ category, rows }) => (
              <div key={category} className="space-y-3">
                <h3 className="flex items-center gap-2 border-b border-line pb-2 text-sm
                               font-semibold text-fg">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-[3px] ${categoryClasses(category).bg}`}
                  />
                  {categoryDisplay(category)}{" "}
                  <span className="font-normal text-fg-subtle">
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
          <h2 className="font-serif text-xl font-semibold tracking-tight text-fg">
            Résolution plus fine
          </h2>
          <p className="text-xs text-fg-muted">
            Ces allèles comptent leurs propres articles : les chiffres ci-dessus
            ne s&apos;y reportent pas tels quels.
          </p>
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.hla}>
                <Link
                  href={`/allele/${encodeURIComponent(child.hla)}`}
                  className="inline-block rounded-lg border border-line
                             bg-surface px-3 py-1 text-sm text-fg
                             hover:border-primary/50 hover:bg-surface-muted"
                >
                  <span className="allele">{child.hla}</span>{" "}
                  <span className="text-xs text-fg-subtle">
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
