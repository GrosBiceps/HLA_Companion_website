import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, ChevronRight, Network } from "lucide-react";
import { SignalIndicator } from "@/components/SignalIndicator";
import {
  KIND_HINTS,
  KIND_LABELS,
  SerotypeBadge,
  SerotypeMembers,
  serotypeHref,
} from "@/components/entity/SerotypeParts";
import {
  AlleleName,
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  Section,
  StatTile,
} from "@/components/ui";
import { OrganBreakdown } from "@/components/organ/OrganBreakdown";
import { OrganScopeNote } from "@/components/organ/OrganScope";
import { formatInt, plural } from "@/lib/format";
import { getCorpusStats, getOrgans } from "@/lib/queries";
import {
  ALL_ORGANS,
  organFromPage,
  organLabel,
  organShortLabel,
  withOrgan,
  type PageSearchParams,
} from "@/lib/organ";
import {
  SEROTYPE_LOCUS_LABELS,
  getSerotype,
  getSerotypeCatalog,
  getSerotypeChildren,
  getSerotypeMembers,
  getSerotypeOrganCounts,
  getSerotypeOutcomes,
  resolveSerotypeKey,
} from "@/lib/serotypes";
import { categoryColor, categoryDisplay } from "@/lib/theme";

/**
 * Fiche serotype — Server Component. Route : `/serotype/DR15`, `/serotype/Cw7`.
 *
 * UN SEROTYPE N'EST PAS UN ALLELE. Le serotype est une specificite reconnue
 * par des anticorps (typage serologique historique) ; l'allele est une
 * sequence d'ADN (typage moleculaire). Un serotype regroupe plusieurs alleles,
 * et un groupe 2-digit peut se repartir sur plusieurs serotypes. La page sert
 * de pont entre les deux notations : elle liste les alleles du serotype
 * (groupes 2-digit et 4-digit, chacun lie a sa fiche) avec leurs effectifs.
 *
 * LA TABLE DE CORRESPONDANCE EST UNE REFERENCE, PAS UN RESULTAT : approximation
 * pedagogique (docs/SEROTYPES.md), distincte de l'extraction du corpus. Les
 * effectifs, eux, sont ceux du corpus. Aucune statistique n'est calculee au
 * niveau du serotype : les complications listees sont des EFFECTIFS d'articles ;
 * le niveau de signal affiche est celui de l'allele le plus marque.
 *
 * ENCODAGE. La cle de route est la graphie canonique (« DR15 », « Cw7 ») ;
 * une graphie approchee (« dr15 », « c7 ») redirige vers elle.
 *
 * ORGANE. `?organe=gcsh` recalcule les effectifs (alleles, articles,
 * complications) sur la strate ; la carte « Par organe » ventile les articles
 * du serotype par organe. Tous les liens reportent la strate.
 */

type Params = { params: Promise<{ serotype: string }> };
type Props = Params & { searchParams?: PageSearchParams };

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const key = safeDecode((await params).serotype);
  return {
    title: `Sérotype ${key} — allèles correspondants`,
    description:
      `Allèles HLA correspondant au sérotype ${key} et complications ` +
      `co-mentionnées dans la littérature indexée. Co-occurrences textuelles, ` +
      `pas des associations cliniques.`,
  };
}

export default async function SerotypePage({ params, searchParams }: Props) {
  const raw = safeDecode((await params).serotype);
  const organ = await organFromPage(searchParams);
  const serotype = getSerotype(raw);
  if (!serotype) {
    const canonical = resolveSerotypeKey(raw);
    if (canonical) redirect(withOrgan(serotypeHref(canonical), organ));
    notFound();
  }

  const members = getSerotypeMembers(serotype.serotypeId, organ);
  const outcomes = getSerotypeOutcomes(serotype.serotypeId, organ);
  const narrower = getSerotypeChildren(serotype.serotypeId);
  const catalog = getSerotypeCatalog(organ);
  const baseHref = serotypeHref(serotype.serotypeId);
  const organCounts = getSerotypeOrganCounts(serotype.serotypeId);
  const stratum = getOrgans().find((o) => o.key === organ);
  const entry = catalog.find((s) => s.serotypeId === serotype.serotypeId);
  const broad = serotype.broadSerotype
    ? catalog.find((s) => s.serotypeId === serotype.broadSerotype)
    : null;
  const siblings = serotype.broadSerotype
    ? catalog.filter(
        (s) =>
          s.broadSerotype === serotype.broadSerotype &&
          s.serotypeId !== serotype.serotypeId,
      )
    : [];

  const groups = members.filter((m) => m.resolution === "2-digit");
  const alleles = members.filter((m) => m.resolution === "4-digit");
  const nArticles = entry?.nArticles ?? 0;
  const maxArticles = Math.max(1, ...outcomes.map((o) => o.nArticles));

  // Point d'entree du graphe : le groupe (ou l'allele) du serotype le plus
  // cite parmi ceux qui ont des co-occurrences.
  const graphTarget = [...members]
    .filter((m) => m.nOutcomes > 0)
    .sort((a, b) => b.nArticles - a.nArticles || a.hla.localeCompare(b.hla))[0];

  const locusLabel = SEROTYPE_LOCUS_LABELS[serotype.locus] ?? serotype.locus;

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="space-y-4">
        <nav aria-label="Fil d'Ariane du sérotype" className="text-sm">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <li>
              <Link
                href={withOrgan("/serotype", organ)}
                className="rounded-md px-1 py-0.5 text-fg-muted hover:text-fg"
              >
                Sérotypes
              </Link>
            </li>
            <li className="flex items-center gap-1">
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-fg-faint" />
              <Link
                href={withOrgan(`/serotype#locus-${serotype.locus}`, organ)}
                className="rounded-md px-1 py-0.5 text-fg-muted hover:text-fg"
              >
                {locusLabel}
              </Link>
            </li>
            {broad ? (
              <li className="flex items-center gap-1">
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-fg-faint" />
                <Link
                  href={withOrgan(serotypeHref(broad.serotypeId), organ)}
                  className="rounded-md px-1 py-0.5 text-fg-muted hover:text-fg"
                >
                  {broad.label}
                </Link>
              </li>
            ) : null}
            <li className="flex items-center gap-1">
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-fg-faint" />
              <span aria-current="page" className="rounded-md px-1 py-0.5 font-medium text-fg">
                {serotype.label}
              </span>
            </li>
          </ol>
        </nav>

        <PageHeader
          eyebrow="Fiche sérotype"
          title={serotype.label}
          meta={
            <>
              <Badge tone="primary" title={KIND_HINTS[serotype.kind]}>
                {KIND_LABELS[serotype.kind]}
              </Badge>
              <Badge>Locus {locusLabel}</Badge>
              {broad ? (
                <Link href={withOrgan(serotypeHref(broad.serotypeId), organ)}>
                  <Badge tone="outline">Famille {broad.label}</Badge>
                </Link>
              ) : null}
            </>
          }
          actions={
            graphTarget ? (
              <LinkButton
                href={withOrgan(
                  `/graph?center=${encodeURIComponent(graphTarget.hla)}`,
                  organ,
                )}
                variant="secondary"
              >
                <Network aria-hidden="true" className="h-4 w-4" />
                Voir {graphTarget.hla.replace(/^HLA-/, "")} dans le graphe
              </LinkButton>
            ) : null
          }
        >
          <p className="max-w-prose text-base leading-relaxed text-fg-muted">
            Ce sérotype correspond à{" "}
            <strong className="tabular font-semibold text-fg">
              {plural(groups.length + alleles.length, "allèle")}
            </strong>{" "}
            du corpus
            {groups.length > 0 && alleles.length > 0
              ? ` (${plural(groups.length, "groupe")} 2-digit et ${plural(alleles.length, "allèle")} 4-digit)`
              : ""}
            , cités dans{" "}
            <strong className="tabular font-semibold text-fg">
              {plural(nArticles, "article")}
            </strong>
            {organ === ALL_ORGANS ? "" : ` (${organShortLabel(organ)})`}.
          </p>
          {serotype.note ? (
            <p className="max-w-prose text-sm text-fg-muted">{serotype.note}</p>
          ) : null}
        </PageHeader>
      </div>

      <OrganScopeNote
        organ={organ}
        nArticles={stratum?.nArticles}
        nTotal={getCorpusStats().nArticles}
        baseHref={baseHref}
      />

      <Callout
        tone="framing"
        title="Sérotype et allèle : deux notations"
        aria-label="Sérotype et allèle"
      >
        <p>
          Un <strong>sérotype</strong> est une spécificité reconnue par des
          anticorps, héritée du typage sérologique ; un <strong>allèle</strong>{" "}
          est une séquence d&apos;ADN, notée à 2 chiffres (le groupe) puis à 4
          chiffres (la protéine). Plusieurs allèles partagent un même sérotype,
          et un groupe peut se répartir entre plusieurs sérotypes.
        </p>
        <p>
          La correspondance ci-dessous est une{" "}
          <strong>table de référence pédagogique</strong>, pas un résultat du
          corpus. Les nombres d&apos;articles sont ceux de la littérature
          indexée : des co-occurrences textuelles, pas des associations
          cliniques.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Groupes 2-digit"
          value={formatInt(groups.length)}
          hint="liés à ce sérotype"
        />
        <StatTile
          label="Allèles 4-digit"
          value={formatInt(alleles.length)}
          hint="liés à ce sérotype"
        />
        <StatTile
          label="Articles"
          value={formatInt(nArticles)}
          hint="citant au moins un de ces allèles"
        />
        <StatTile
          label="Complications"
          value={formatInt(outcomes.length)}
          hint="co-mentionnées avec l'un d'eux"
        />
      </div>

      <div className="max-w-md">
        <OrganBreakdown
          counts={organCounts}
          selected={organ}
          hrefFor={(o) => withOrgan(baseHref, o)}
          total={getSerotypeCatalog().find((s) => s.serotypeId === serotype.serotypeId)?.nArticles}
        />
      </div>

      {narrower.length > 0 ? (
        <Section
          title="Spécificités plus fines"
          description={`${serotype.label} regroupe ${plural(narrower.length, "spécificité")} : ouvrez-en une pour voir ses allèles propres.`}
        >
          <ul className="flex flex-wrap gap-2">
            {narrower.map((n) => {
              const e = catalog.find((s) => s.serotypeId === n.serotypeId);
              return (
                <li key={n.serotypeId}>
                  <Link
                    href={withOrgan(serotypeHref(n.serotypeId), organ)}
                    className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm shadow-xs ring-1 ring-inset ring-line hover:ring-line-strong"
                  >
                    <span className="font-semibold text-fg">{n.label}</span>
                    <span className="tabular text-xs text-fg-subtle">
                      {plural((e?.nGroups ?? 0) + (e?.nAlleles ?? 0), "allèle")} ·{" "}
                      {plural(e?.nArticles ?? 0, "article")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section
        title={`Allèles de ce sérotype (${members.length})`}
        description="Groupes 2-digit et allèles 4-digit, avec le nombre d'articles qui mentionnent explicitement chaque forme. « ▲ » signale au moins une co-occurrence au-dessus du seuil du corpus. Chaque forme ouvre sa fiche."
        aria-label="Allèles du sérotype"
      >
        {members.length > 0 ? (
          <SerotypeMembers members={members} organ={organ} />
        ) : (
          <EmptyState
            title="Aucun allèle du corpus"
            description="Aucun allèle de ce sérotype n'est présent dans le vocabulaire du corpus."
          />
        )}
        <p className="text-2xs leading-relaxed text-fg-subtle">
          Nombres : articles mentionnant explicitement chaque forme. Ils ne
          s&apos;additionnent pas d&apos;un niveau à l&apos;autre : un article
          qui écrit « {groups[0]?.hla.replace(/^HLA-/, "") ?? "DRB1*15"} » n&apos;est
          pas compté sous un allèle 4-digit.
        </p>
      </Section>

      <Section
        title="Complications co-mentionnées"
        description="Articles qui citent au moins un allèle de ce sérotype et la complication. C'est un effectif descriptif ; la lecture statistique se fait allèle par allèle, sur leurs fiches."
        aria-label="Complications co-mentionnées avec le sérotype"
      >
        {outcomes.length === 0 ? (
          <EmptyState
            title="Aucune complication co-mentionnée"
            description={
              organ === ALL_ORGANS
                ? "Aucune complication n'est co-mentionnée avec ces allèles dans ce corpus. Ce n'est pas un résultat sur la clinique : c'est l'état de la littérature indexée telle qu'elle a été extraite."
                : `Aucune complication n'est co-mentionnée avec ces allèles dans la strate « ${organLabel(organ)} ». Ce n'est pas un résultat sur la clinique : c'est l'état de la littérature indexée pour cet organe.`
            }
          />
        ) : (
          <Card>
            <CardHeader
              eyebrow="Effectifs"
              title="Articles par complication"
              description="Longueur : nombre d'articles. La pastille donne le niveau de signal le plus marqué parmi les allèles du sérotype."
            />
            <ul className="mt-4 divide-y divide-line">
              {outcomes.slice(0, 12).map((o) => (
                <li
                  key={o.outcome}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <Link
                      href={withOrgan(`/complication/${encodeURIComponent(o.outcome)}`, organ)}
                      className="flex items-center gap-1.5 text-sm font-medium text-fg hover:text-primary hover:underline"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-[3px]"
                        style={{ background: categoryColor(o.category).css }}
                      />
                      <span className="truncate">{o.label}</span>
                    </Link>
                    <p className="pl-3.5 text-2xs text-fg-subtle">
                      {categoryDisplay(o.category)} ·{" "}
                      {plural(o.nAlleles, "allèle")} concerné
                      {o.nAlleles > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div
                    aria-hidden="true"
                    className="order-last col-span-2 h-1.5 overflow-hidden rounded-full bg-fg/[0.07] sm:order-none sm:col-span-1"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, Math.round((o.nArticles / maxArticles) * 100))}%`,
                        background: categoryColor(o.category).css,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <SignalIndicator level={o.topLevel} variant="plain" />
                    <span className="tabular w-16 text-right text-sm text-fg">
                      {plural(o.nArticles, "article")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {outcomes.length > 12 ? (
              <p className="mt-3 text-xs text-fg-subtle">
                {outcomes.length - 12} autres complications moins citées : voir
                les fiches des allèles ci-dessus.
              </p>
            ) : null}
          </Card>
        )}
      </Section>

      {siblings.length > 0 ? (
        <Section
          title={`Autres spécificités de la famille ${broad?.label ?? ""}`}
          aria-label="Spécificités voisines"
        >
          <ul className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <li key={s.serotypeId}>
                <SerotypeBadge serotypeId={s.serotypeId} kind={s.kind} organ={organ} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Card tone="muted" className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-serif text-lg font-semibold text-fg">
            Parcourir les autres sérotypes
          </p>
          <p className="text-sm text-fg-muted">
            L&apos;index les range par locus et par famille. Les allèles se
            parcourent aussi par{" "}
            <Link href={withOrgan("/allele", organ)} className="link">
              nomenclature
            </Link>
            {groups[0] ? (
              <>
                , par exemple{" "}
                <AlleleName hla={groups[0].hla} href organ={organ} className="text-sm" />
              </>
            ) : null}
            .
          </p>
        </div>
        <LinkButton href={withOrgan("/serotype", organ)} variant="primary">
          Index des sérotypes
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </LinkButton>
      </Card>
    </div>
  );
}
