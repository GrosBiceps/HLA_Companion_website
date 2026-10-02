import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Network } from "lucide-react";
import { AssociationCard } from "@/components/AssociationCard";
import { SignalGlyph } from "@/components/SignalIndicator";
import {
  AlleleName,
  Badge,
  Callout,
  Card,
  CardHeader,
  CategoryBadge,
  EmptyState,
  LinkButton,
  PageHeader,
  Section,
  StatTile,
} from "@/components/ui";
import { OrganBreakdown } from "@/components/organ/OrganBreakdown";
import { OrganBadges } from "@/components/organ/OrganChip";
import { OrganScopeNote } from "@/components/organ/OrganScope";
import { ArticleSummaryList } from "@/components/entity/ArticleSummaryList";
import { BarList } from "@/components/entity/BarList";
import { CompactAssociationList } from "@/components/entity/CompactAssociationList";
import {
  LocusStripChart,
  type StripGroup,
} from "@/components/entity/LocusStripChart";
import { YearSparkline } from "@/components/entity/YearSparkline";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_COLORS, categoryDisplay, hlaClassColor } from "@/lib/theme";
import {
  activeYears,
  categoryAnchor,
  formatInt,
  plural,
  yearSpan,
} from "@/lib/format";
import {
  getAllHlaEntities,
  getAssociationsForOutcome,
  getCorpusStats,
  getOrgans,
  getOutcome,
  getOutcomeArticleCount,
  getOutcomeOrganCounts,
  getOutcomeYearCounts,
  getTopArticlesForOutcome,
} from "@/lib/queries";
import { OUTCOME_ORGANS } from "@/lib/labels";
import {
  ALL_ORGANS,
  organFromPage,
  organLabel,
  organShortLabel,
  withOrgan,
  type PageSearchParams,
} from "@/lib/organ";
import type { AssociationRow, HlaEntity } from "@/lib/types";
import { LOCUS_ORDER as LOCI_ORDER } from "@/lib/loci";

/**
 * Fiche complication — NAVIGATION INVERSE de la fiche allele, de facture
 * symetrique.
 *
 * LIBELLE CLINIQUE, JAMAIS LA CLE. L'URL porte la cle technique
 * (`/complication/graft_loss`) parce qu'elle doit etre stable ; l'ECRAN ne la
 * montre nulle part. L'entete affiche « Perte du greffon », le <title> aussi.
 *
 * REGROUPEMENT PAR LOCUS. L'axe symetrique de la categorie clinique (fiche
 * allele) est ici la nomenclature : A, B, C (classe I), DRB1, DQB1, DPB1
 * (classe II), puis les entites non alleliques (compte d'incompatibilites,
 * eplets). Le lecteur balaye la page par bloc de locus, comme il balaye la
 * fiche allele par bloc clinique.
 *
 * VOLUME. Une complication est co-mentionnee avec une centaine d'alleles,
 * dont une dizaine au-dessus du seuil. Les lignes marquees sont en cartes
 * completes ; les autres en lignes compactes GRISEES — presentes, jamais
 * masquees (spec D10), et chacune ouvre le tiroir de phrases.
 *
 * CE QUI N'EST PAS REIMPLEMENTE. AssociationCard porte l'indicateur de
 * signal, la remontee des negations, le repliement des metriques et le
 * tiroir. Aucune metrique ne fuit hors de son depliant.
 *
 * ENCODAGE. On decode defensivement comme la fiche allele.
 *
 * ORGANE. `?organe=foie` recalcule la fiche sur la strate (associations avec
 * leur denominateur, effectifs, chronologie, articles). Les puces « Organes
 * concernés » viennent du VOCABULAIRE (`OUTCOME_ORGANS` : le BOS n'existe
 * qu'apres une greffe pulmonaire) ; la carte « Par organe » compte les
 * articles du corpus. Choisir un organe auquel la complication ne s'applique
 * pas est dit, pas masque.
 */

type Params = { params: Promise<{ outcome: string }> };
type Props = Params & { searchParams?: PageSearchParams };

/** Decodage tolerant : une sequence percent invalide ne doit pas lever. */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const key = safeDecode((await params).outcome);
  const outcome = getOutcome(key);
  // Titre de repli sans la cle technique : meme dans l'onglet du navigateur,
  // `graft_loss` ne doit pas s'afficher.
  if (!outcome) return { title: "Complication inconnue" };
  return {
    title: `${outcome.label} — co-occurrences textuelles`,
    description:
      `Allèles HLA co-mentionnés avec « ${outcome.label} » dans la ` +
      `littérature indexée. Co-occurrences textuelles, pas des associations ` +
      `cliniques.`,
  };
}

/** Ordre des loci : classe I puis classe II, puis tout locus inattendu. */
const LOCUS_ORDER: readonly string[] = LOCI_ORDER;

interface LocusGroup {
  key: string;
  title: string;
  hlaClass: string | null;
  rows: AssociationRow[];
}

/**
 * Regroupe les lignes par locus. Les entites non alleliques (resolution
 * hors 2-digit / 4-digit) forment un groupe « Autres entités » en fin de
 * liste. L'ordre interne des lignes (signal puis effectif) est preserve.
 */
function groupByLocus(
  rows: AssociationRow[],
  entities: Map<string, HlaEntity>,
): LocusGroup[] {
  const groups = new Map<string, LocusGroup>();
  for (const row of rows) {
    const e = entities.get(row.hla);
    const allelic =
      e && (e.resolution === "2-digit" || e.resolution === "4-digit");
    const key = allelic ? e.locus : "__autres";
    let g = groups.get(key);
    if (!g) {
      g = allelic
        ? { key, title: e.locus, hlaClass: e.hlaClass, rows: [] }
        : { key, title: "Autres entités", hlaClass: null, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  const rank = (k: string) => {
    if (k === "__autres") return 1000;
    const i = LOCUS_ORDER.indexOf(k);
    return i === -1 ? 500 : i;
  };
  return [...groups.values()].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key),
  );
}

export default async function OutcomePage({ params, searchParams }: Props) {
  const key = safeDecode((await params).outcome);
  const organ = await organFromPage(searchParams);

  const outcome = getOutcome(key);
  if (!outcome) notFound();

  const associations = getAssociationsForOutcome(key, organ);
  const entities = new Map(getAllHlaEntities().map((e) => [e.hla, e]));
  const groups = groupByLocus(associations, entities);
  const years = getOutcomeYearCounts(key, organ);
  const span = activeYears(years);
  const nArticles = getOutcomeArticleCount(key, organ);
  const topArticles = getTopArticlesForOutcome(key, 6, organ);
  const marked = associations.filter((a) => a.isSignificant);
  const nInverse = associations.filter(
    (a) => a.signalLevel === "inverse",
  ).length;
  const baseHref = `/complication/${encodeURIComponent(key)}`;
  const graphHref = withOrgan(`/graph?center=${encodeURIComponent(key)}`, organ);
  const organCounts = getOutcomeOrganCounts(key);
  const appliesTo = OUTCOME_ORGANS[key] ?? [];
  const stratum = getOrgans().find((o) => o.key === organ);
  const notApplicable = organ !== ALL_ORGANS && !appliesTo.includes(organ);
  const breakdown = (
    <OrganBreakdown
      counts={organCounts}
      selected={organ}
      hrefFor={(o) => withOrgan(baseHref, o)}
      total={getOutcomeArticleCount(key)}
    />
  );

  const strip: StripGroup[] = groups.map((g) => ({
    key: g.key,
    title: g.title,
    hlaClass: g.hlaClass,
    points: g.rows.map((r) => ({
      hla: r.hla,
      locus: g.title,
      hlaClass: g.hlaClass ?? "",
      nCooccurrence: r.nCooccurrence,
      nNegated: r.nNegated,
      signalLevel: r.signalLevel,
    })),
  }));

  // Les lignes au-dessus du seuil, deja triees par signal puis effectif.
  const topMarked = marked.slice(0, 10);

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="space-y-4">
        <nav aria-label="Fil d'Ariane" className="text-sm">
          <Link
            href={withOrgan("/complication", organ)}
            className="text-fg-muted hover:text-fg"
          >
            Complications
          </Link>
          <span aria-hidden="true" className="px-1.5 text-fg-faint">
            ›
          </span>
          <Link
            href={withOrgan(`/complication#${categoryAnchor(outcome.category)}`, organ)}
            className="text-fg-muted hover:text-fg"
          >
            {categoryDisplay(outcome.category)}
          </Link>
          <span aria-hidden="true" className="px-1.5 text-fg-faint">
            ›
          </span>
          <span aria-current="page" className="font-medium text-fg">
            {outcome.label}
          </span>
        </nav>
        {/* Le libelle clinique, jamais `outcome.outcome`. */}
        <PageHeader
          eyebrow="Fiche complication"
          title={outcome.label}
          meta={
            <>
              <CategoryBadge category={outcome.category} />
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                S&apos;applique à :
                <OrganBadges
                  organs={appliesTo}
                  selected={organ}
                  hrefFor={(o) => withOrgan(baseHref, o)}
                />
              </span>
              {span ? (
                <Badge tone="outline">
                  {span.first === span.last
                    ? `Mentionnée en ${span.first}`
                    : `Mentionnée de ${span.first} à ${span.last}`}
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
            Mentionnée dans{" "}
            <strong className="tabular font-semibold text-fg">
              {plural(nArticles, "article")}
            </strong>{" "}
            {organ === ALL_ORGANS ? "du corpus" : `de la strate ${organShortLabel(organ)}`}
            {associations.length > 0 ? (
              <>
                , co-mentionnée avec{" "}
                <strong className="tabular font-semibold text-fg">
                  {plural(associations.length, "entité HLA", "entités HLA")}
                </strong>
                .
              </>
            ) : (
              "."
            )}
          </p>
        </PageHeader>
      </div>

      <OrganScopeNote
        organ={organ}
        nArticles={stratum?.nArticles}
        nTotal={getCorpusStats().nArticles}
        baseHref={baseHref}
      />

      {notApplicable ? (
        <Callout tone="info" title="Cette complication ne concerne pas cet organe">
          <p>
            Dans le vocabulaire du site, « {outcome.label} » ne s&apos;applique
            pas à {organLabel(organ)}. Si des articles la mentionnent quand même
            dans cette strate (article concernant deux organes, par exemple),
            ils sont comptés ci-dessous, sans rien masquer.
          </p>
        </Callout>
      ) : null}

      <Callout
        tone="framing"
        title="Comment lire cette fiche"
        aria-label="Comment lire cette fiche"
      >
        <p>
          Cette page part de la complication et remonte vers les{" "}
          <strong>allèles mentionnés dans les mêmes articles</strong>. Chaque
          ligne compte des articles, comparé à ce qu&apos;on attendrait si les
          mentions étaient réparties au hasard dans le texte — une fréquence de
          publication, pas une observation chez des patients.
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
          hint="mentionnant cette complication"
        />
        <StatTile
          label="Entités HLA"
          value={formatInt(associations.length)}
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

      {associations.length === 0 ? (
        <>
          <EmptyState
            title="Aucun allèle co-mentionné"
            description={
              organ === ALL_ORGANS
                ? "Aucun allèle n'est co-mentionné avec cette complication dans ce corpus. Ce n'est pas un résultat sur la clinique : c'est l'état de la littérature indexée telle qu'elle a été extraite."
                : `Aucun allèle n'est co-mentionné avec cette complication dans la strate « ${organLabel(organ)} ». Ce n'est pas un résultat sur la clinique : c'est l'état de la littérature indexée pour cet organe — la répartition ci-dessous montre où elle apparaît.`
            }
          />
          <div className="max-w-sm">{breakdown}</div>
        </>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <CardHeader
                eyebrow="Vue d'ensemble"
                title="Allèles co-mentionnés, par locus"
                description="Un point par allèle. Position : nombre d'articles. Teinte : niveau de signal. Un point mène à la fiche de l'allèle."
              />
              <div className="mt-5">
                <LocusStripChart groups={strip} organ={organ} />
              </div>
            </Card>

            <div className="space-y-6">
              {breakdown}
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
              {topMarked.length > 0 ? (
                <Card>
                  <CardHeader
                    eyebrow="Au-dessus du seuil"
                    title="Allèles les plus marqués"
                    description="Ordre : niveau de signal, puis nombre d'articles."
                  />
                  <BarList
                    className="mt-4"
                    unit="art."
                    items={topMarked.map((r) => ({
                      key: r.hla,
                      href: withOrgan(`/allele/${encodeURIComponent(r.hla)}`, organ),
                      value: r.nCooccurrence,
                      color: SIGNAL_COLORS[r.signalLevel].css,
                      title: `${r.hla} — ${SIGNAL_DISPLAY[r.signalLevel].label}`,
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <AlleleName hla={r.hla} />
                          <span className={SIGNAL_DISPLAY[r.signalLevel].tone}>
                            <SignalGlyph level={r.signalLevel} />
                          </span>
                        </span>
                      ),
                    }))}
                  />
                </Card>
              ) : null}
            </div>
          </div>

          <Section
            title={`Co-occurrences détaillées (${associations.length})`}
            aria-label="Allèles co-mentionnés"
            description={`${marked.length} au-dessus du seuil statistique du corpus, en cartes ; ${
              associations.length - marked.length
            } en dessous, en lignes grisées. Une absence de signal est une information : rien n'est masqué.`}
          >
            <div className="space-y-8">
              {groups.map((group) => {
                const strong = group.rows.filter((r) => r.isSignificant);
                const weak = group.rows.filter((r) => !r.isSignificant);
                return (
                  <div key={group.key} className="space-y-3">
                    <h3 className="flex items-center gap-2 border-b border-line pb-2 text-sm font-semibold text-fg">
                      {group.hlaClass ? (
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            background: hlaClassColor(group.hlaClass).css,
                          }}
                        />
                      ) : null}
                      {group.hlaClass ? (
                        <>
                          Locus <span className="allele">{group.title}</span>
                          <span className="font-normal text-fg-subtle">
                            · classe {group.hlaClass}
                          </span>
                        </>
                      ) : (
                        group.title
                      )}{" "}
                      <span className="font-normal text-fg-subtle">
                        ({group.rows.length})
                      </span>
                    </h3>
                    {strong.map((row) => (
                      // Le titre de la carte est l'allele, lien vers sa
                      // fiche : c'est lui qui fait de cette page une
                      // navigation, et non une liste morte.
                      <AssociationCard
                        key={row.hla}
                        association={row}
                        title={<AlleleName hla={row.hla} href organ={organ} />}
                        organ={organ}
                      />
                    ))}
                    {weak.length > 0 ? (
                      <CompactAssociationList rows={weak} show="hla" organ={organ} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Section>

          {topArticles.length > 0 ? (
            <Section
              title="Articles les plus riches en co-mentions"
              description="Classés par nombre de phrases où cette complication apparaît avec un allèle. Chaque fiche article montre ces phrases, surlignées."
            >
              <ArticleSummaryList
                articles={topArticles}
                partnerUnit="allèle"
                organ={organ}
              />
            </Section>
          ) : null}

          <Card
            tone="muted"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-serif text-lg font-semibold text-fg">
                Explorer le voisinage de « {outcome.label} »
              </p>
              <p className="text-sm text-fg-muted">
                Le graphe part de cette complication et s&apos;étend aux allèles
                co-mentionnés, puis à leurs autres complications.
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
