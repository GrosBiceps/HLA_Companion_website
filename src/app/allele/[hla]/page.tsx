import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Network } from "lucide-react";
import { AssociationCard } from "@/components/AssociationCard";
import { CATEGORIES } from "@/lib/labels";
import { categoryClasses, categoryDisplay } from "@/lib/theme";
import {
  AlleleName,
  Badge,
  Card,
  CardHeader,
  Callout,
  EmptyState,
  HlaClassBadge,
  LinkButton,
  PageHeader,
  Section,
  StatTile,
} from "@/components/ui";
import {
  AlleleBreadcrumbTrail,
  AlleleFamily,
} from "@/components/entity/AlleleHierarchy";
import { ArticleSummaryList } from "@/components/entity/ArticleSummaryList";
import { CompactAssociationList } from "@/components/entity/CompactAssociationList";
import { OutcomeProfileChart } from "@/components/entity/OutcomeProfileChart";
import { YearSparkline } from "@/components/entity/YearSparkline";
import {
  activeYears,
  coAnchor,
  formatInt,
  plural,
  yearSpan,
} from "@/lib/format";
import {
  getAlleleAncestry,
  getAlleleByKey,
  getAlleleChildren,
  getAlleleSiblings,
  getAlleleYearCounts,
  getArticleCountsByHla,
  getAssociationsForAllele,
  getOutcomeCount,
  getTopArticlesForAllele,
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
 * ORDRE DE LECTURE (de l'agrege vers la source, spec § 3) :
 *  1. en-tete : nom, classe / locus / resolution, effectif d'articles ;
 *  2. cadrage propre a la fiche (en plus du rappel global du layout) ;
 *  3. tuiles d'EFFECTIFS descriptifs ;
 *  4. vue d'ensemble : profil par categorie (barres = articles, teinte =
 *     niveau qualitatif), activite annuelle, position dans la nomenclature ;
 *  5. les co-occurrences detaillees, groupees par categorie : cartes pour les
 *     lignes au-dessus du seuil, lignes compactes GRISEES (jamais masquees)
 *     pour les autres — toutes ouvrent le tiroir de phrases ;
 *  6. les articles les plus riches en co-mentions, puis le graphe.
 *
 * Aucune metrique brute hors du depliant « Détail statistique » des cartes.
 *
 * ARTICLES DISTINCTS. `hla_entities.n_mentions` compte des lignes de
 * mention ; l'en-tete affiche le nombre d'ARTICLES distincts, la quantite
 * verifiable (cf. bloc « fiches enrichies » de queries.ts).
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

/**
 * Regroupe les associations par categorie, dans l'ordre de CATEGORIES.
 * Une categorie inconnue est rendue en fin de page plutot que perdue.
 */
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
  for (const [category, rows] of groups) ordered.push({ category, rows });
  return ordered;
}

function resolutionLabel(resolution: string): string {
  switch (resolution) {
    case "4-digit":
      return "Résolution 4-digit";
    case "2-digit":
      return "Résolution 2-digit";
    case "class":
      return "Niveau de nomenclature";
    case "mismatch_count":
      return "Compte d'incompatibilités";
    case "eplet":
      return "Niveau éplétique";
    default:
      return `Résolution ${resolution}`;
  }
}

export default async function AllelePage({ params }: Params) {
  const hla = safeDecode((await params).hla);

  const allele = getAlleleByKey(hla);
  if (!allele) notFound();

  const associations = getAssociationsForAllele(hla);
  const ancestry = getAlleleAncestry(hla);
  const children = getAlleleChildren(hla);
  const siblings = getAlleleSiblings(hla);
  const counts = getArticleCountsByHla();
  const years = getAlleleYearCounts(hla);
  const topArticles = getTopArticlesForAllele(hla, 6);
  const groups = groupByCategory(associations);

  const parent = ancestry.length >= 2 ? ancestry[ancestry.length - 2] : null;
  const nArticles = counts.get(hla) ?? 0;
  const span = activeYears(years);
  const marked = associations.filter((a) => a.isSignificant);
  const nInverse = associations.filter(
    (a) => a.signalLevel === "inverse",
  ).length;
  const nOutcomesTotal = getOutcomeCount();
  const graphHref = `/graph?center=${encodeURIComponent(hla)}`;
  const isLocusNode = allele.resolution === "class";

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="space-y-4">
        <AlleleBreadcrumbTrail ancestry={ancestry} />

        <PageHeader
          eyebrow="Fiche allèle"
          title={<AlleleName hla={allele.hla} className="font-semibold" />}
          meta={
            <>
              <HlaClassBadge hlaClass={allele.hlaClass} />
              {allele.locus !== allele.hla ? (
                <Badge>Locus {allele.locus}</Badge>
              ) : null}
              <Badge>{resolutionLabel(allele.resolution)}</Badge>
              {span ? (
                <Badge tone="outline">
                  {span.first === span.last
                    ? `Mentionné en ${span.first}`
                    : `Mentionné de ${span.first} à ${span.last}`}
                </Badge>
              ) : null}
            </>
          }
          actions={
            associations.length > 0 ? (
              <LinkButton href={graphHref} variant="secondary">
                <Network aria-hidden="true" className="h-4 w-4" />
                Voir dans le graphe
              </LinkButton>
            ) : null
          }
        >
          <p className="max-w-prose text-base leading-relaxed text-fg-muted">
            Mentionné dans{" "}
            <strong className="tabular font-semibold text-fg">
              {plural(nArticles, "article")}
            </strong>{" "}
            du corpus
            {associations.length > 0 ? (
              <>
                , co-mentionné avec{" "}
                <strong className="tabular font-semibold text-fg">
                  {plural(associations.length, "complication")}
                </strong>{" "}
                sur les {nOutcomesTotal} du référentiel.
              </>
            ) : (
              "."
            )}
          </p>
        </PageHeader>
      </div>

      {/*
        Cadrage propre a la fiche, qui s'ajoute au rappel global du layout : il
        dit ce que signifient les chiffres qui suivent, sur CETTE page.
      */}
      <Callout
        tone="framing"
        title="Comment lire cette fiche"
        aria-label="Comment lire cette fiche"
      >
        <p>
          Chaque ligne compte des{" "}
          <strong>
            articles où l&apos;allèle et la complication sont mentionnés
            ensemble
          </strong>
          , comparé à ce qu&apos;on attendrait si les mentions étaient réparties
          au hasard dans le texte. Un signal fort reflète souvent une mode de
          publication, un biais d&apos;indexation ou une erreur
          d&apos;extraction.
        </p>
        <p>
          Toute lecture clinique exige de relire les phrases sources.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Articles"
          value={formatInt(nArticles)}
          hint="mentionnant cette forme"
        />
        <StatTile
          label="Complications"
          value={
            <>
              {associations.length}
              <span className="text-base font-normal text-fg-subtle">
                {" "}
                / {nOutcomesTotal}
              </span>
            </>
          }
          hint="co-mentionnées au moins une fois"
        />
        <StatTile
          label="Au-dessus du seuil"
          value={marked.length}
          hint={
            nInverse > 0
              ? `dont ${nInverse} en signal inverse`
              : "co-occurrences marquées"
          }
        />
        <StatTile
          label="Période"
          value={yearSpan(span?.first, span?.last) ?? "—"}
          hint="première et dernière mention"
        />
      </div>

      {isLocusNode && children.length > 0 ? (
        <Card>
          <CardHeader
            eyebrow="Nomenclature"
            title="Ce nœud regroupe des allèles"
            description="Les co-occurrences sont comptées au niveau de chaque allèle : ouvrez l'un d'eux."
          />
          <div className="mt-4">
            <AlleleFamily
              allele={allele}
              parent={parent}
              siblings={[]}
              children={children}
              counts={counts}
            />
          </div>
        </Card>
      ) : null}

      {associations.length === 0 ? (
        <EmptyState
          title="Aucune complication co-mentionnée"
          description="Aucune complication n'est co-mentionnée avec cette entité dans ce corpus. Ce n'est pas un résultat sur la clinique : c'est l'état de la littérature indexée telle qu'elle a été extraite."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <CardHeader
                eyebrow="Vue d'ensemble"
                title="Complications co-mentionnées, par catégorie"
                description="Longueur : nombre d'articles. Teinte : niveau de signal. Une ligne mène à sa carte détaillée."
              />
              <div className="mt-5">
                <OutcomeProfileChart groups={groups} />
              </div>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader eyebrow="Chronologie" title="Articles par année" />
                <div className="mt-4">
                  <YearSparkline series={years} />
                </div>
                <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
                  Le corpus entier grossit d&apos;année en année : une pente
                  montante peut ne refléter que cette croissance.
                </p>
              </Card>
              <Card>
                <CardHeader eyebrow="Nomenclature" title="Allèles voisins" />
                <div className="mt-4">
                  <AlleleFamily
                    allele={allele}
                    parent={parent}
                    siblings={siblings}
                    children={children}
                    counts={counts}
                  />
                </div>
              </Card>
            </div>
          </div>

          <Section
            title={`Co-occurrences détaillées (${associations.length})`}
            aria-label="Complications co-mentionnées"
            description={`${marked.length} au-dessus du seuil statistique du corpus, en cartes ; ${
              associations.length - marked.length
            } en dessous, en lignes grisées. Une absence de signal est une information : rien n'est masqué.`}
          >
            <div className="space-y-8">
              {groups.map(({ category, rows }) => {
                const strong = rows.filter((r) => r.isSignificant);
                const weak = rows.filter((r) => !r.isSignificant);
                return (
                  <div key={category} className="space-y-3">
                    <h3 className="flex items-center gap-2 border-b border-line pb-2 text-sm font-semibold text-fg">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 rounded-[3px] ${categoryClasses(category).bg}`}
                      />
                      {categoryDisplay(category)}{" "}
                      <span className="font-normal text-fg-subtle">
                        ({rows.length})
                      </span>
                    </h3>
                    {strong.map((row) => (
                      <div
                        key={row.outcome}
                        id={coAnchor(row.outcome)}
                        className="scroll-mt-40"
                      >
                        <AssociationCard association={row} />
                      </div>
                    ))}
                    {weak.length > 0 ? (
                      <CompactAssociationList rows={weak} show="outcome" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Section>

          {topArticles.length > 0 ? (
            <Section
              title="Articles les plus riches en co-mentions"
              description="Classés par nombre de phrases où cet allèle apparaît avec une complication. Chaque fiche article montre ces phrases, surlignées."
            >
              <ArticleSummaryList
                articles={topArticles}
                partnerUnit="complication"
              />
            </Section>
          ) : null}

          <Card
            tone="muted"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-serif text-lg font-semibold text-fg">
                Explorer le voisinage de <AlleleName hla={allele.hla} />
              </p>
              <p className="text-sm text-fg-muted">
                Le graphe part de cet allèle et s&apos;étend, de proche en
                proche, aux complications puis aux autres allèles co-mentionnés.
              </p>
            </div>
            <LinkButton href={graphHref} variant="primary">
              Ouvrir le graphe
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </LinkButton>
          </Card>
        </>
      )}
    </div>
  );
}
