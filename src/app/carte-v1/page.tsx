import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Callout, PageHeader, Section, StatTile } from "@/components/ui";
import {
  CategoryScale,
  EdgeSwatch,
  Legend,
  LegendGroup,
  LegendItem,
  NodeSwatch,
} from "@/components/charts";
import LegacyMapClient from "@/components/LegacyMapClient";
import {
  getLegacyMap,
  legacyStats,
  topLegacyPairs,
  type LegacyPair,
} from "@/lib/legacy-map";
import {
  CATEGORY_FALLBACK,
  CHART_NEUTRALS,
  categoryColor,
  HLA_CLASS_COLORS,
} from "@/lib/theme";
import { cn } from "@/lib/cn";

/**
 * Carte v1 — Server Component.
 *
 * Donnees REELLES de l'etude anterieure, importees a la construction depuis
 * `data/legacy/carte_v1_renal.json` (cf. `src/lib/legacy-map.ts`). Le rendu
 * interactif est client (`LegacyMapClient`) ; le tableau des paires est rendu
 * cote serveur et sert d'alternative accessible au reseau.
 */
export const metadata: Metadata = {
  title: "Carte v1 — co-occurrences textuelles (étude antérieure)",
  description:
    "Carte réelle de l'étude bibliométrique antérieure sur la greffe rénale : " +
    "co-mentions entre libellés HLA et complications, comptées en PMID. Ce ne " +
    "sont pas des associations cliniques.",
};

const REPO_URL = "https://github.com/GrosBiceps/Renal-HLA-Bibliometric";

export default function CarteV1Page() {
  const map = getLegacyMap();
  const stats = legacyStats(map);
  const pairs = topLegacyPairs(map);
  const robust = pairs.filter((p) => p.weight >= 2);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Étude antérieure · données réelles"
        title="Carte v1 — greffe rénale"
        description="La carte des co-mentions entre libellés HLA et complications produite par la première étude bibliométrique, présentée telle qu'exportée : mêmes libellés, mêmes liens, disposition d'origine."
        meta={
          <>
            <Badge tone="accent">Données réelles</Badge>
            <Badge tone="outline">Export Gephi · 80 nœuds</Badge>
          </>
        }
      />

      <Callout tone="framing" title="Ce que montre cette carte — et ce qu'elle ne montre pas" aria-label="Cadrage de la carte v1">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <strong>Données réelles</strong> de l&apos;étude antérieure (dépôt{" "}
            <a href={REPO_URL} className="link" rel="noopener noreferrer" target="_blank">
              github.com/GrosBiceps/Renal-HLA-Bibliometric
            </a>
            ), et non le corpus synthétique du reste du site : le bandeau
            « données synthétiques » ne concerne pas cette page.
          </li>
          <li>
            Le poids d&apos;un lien est un <strong>compte brut</strong> : le
            nombre de PMID uniques où les deux libellés apparaissent ensemble.
            Aucun test statistique, donc aucun niveau de signal.
          </li>
          <li>
            Les <strong>libellés ne sont pas normalisés</strong> vers le
            vocabulaire actuel : notation sérologique (« HLA-*A23 »), doublons
            (« TMA » et « thrombotic microangiopathy »), termes en anglais. Le
            regroupement par catégorie et les traductions sont indicatifs,
            ajoutés pour la lecture.
          </li>
          <li>
            L&apos;export ne contient <strong>ni PMID ni phrases sources</strong> :
            aucun lien ne peut être vérifié depuis ce site.
          </li>
          <li>
            Une co-occurrence dans les résumés n&apos;est{" "}
            <strong>pas une association clinique</strong>.{" "}
            <Link href="/methode" className="link font-medium">
              Méthodologie
            </Link>
          </li>
        </ul>
      </Callout>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Libellés HLA"
          value={stats.nHla}
          hint={`dont ${stats.nSerological} en notation sérologique`}
        />
        <StatTile label="Complications" value={stats.nComplications} hint="libellés d'origine" />
        <StatTile
          label="Liens"
          value={stats.nEdges}
          hint={`${stats.nSinglePmid} reposent sur un seul PMID`}
        />
        <StatTile
          label="PMID par paire"
          value={`1 à ${stats.maxWeight}`}
          hint={`${robust.length} paires à 2 PMID ou plus`}
        />
      </div>

      <Section
        title="Le réseau"
        description="Survolez un nœud pour isoler ses partenaires, cliquez pour le détail. Les liens les plus épais reposent sur plusieurs articles."
      >
        <LegacyMapClient map={map} />

        <Legend className="sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1fr]">
          <LegendGroup title="Libellés HLA (cercles)">
            <LegendItem swatch={<NodeSwatch shape="circle" color={HLA_CLASS_COLORS.I.css} />}>
              Classe I (A, B, C)
            </LegendItem>
            <LegendItem swatch={<NodeSwatch shape="circle" color={HLA_CLASS_COLORS.II.css} />}>
              Classe II (DR, DQ)
            </LegendItem>
            <LegendItem
              swatch={<NodeSwatch shape="circle" color={HLA_CLASS_COLORS.I.css} dashed size={10} />}
            >
              Contour pointillé : notation sérologique non normalisée
            </LegendItem>
            <LegendItem
              swatch={
                <span className="inline-flex items-center gap-0.5">
                  <NodeSwatch shape="circle" color="rgb(var(--fg-faint))" size={6} />
                  <NodeSwatch shape="circle" color="rgb(var(--fg-faint))" size={12} />
                </span>
              }
            >
              Taille : celle de la carte d&apos;origine
            </LegendItem>
          </LegendGroup>
          <LegendGroup title="Complications (carrés) — regroupement indicatif">
            <li>
              <CategoryScale extra="Hors catégories du site" />
            </li>
          </LegendGroup>
          <LegendGroup title="Liens : PMID uniques en commun">
            <LegendItem swatch={<EdgeSwatch color={CHART_NEUTRALS.fgSubtle.css} width={1.1} opacity={0.6} />}>
              1 PMID
            </LegendItem>
            <LegendItem swatch={<EdgeSwatch color={CHART_NEUTRALS.primary.css} width={2.6} opacity={0.85} />}>
              2 PMID
            </LegendItem>
            <LegendItem swatch={<EdgeSwatch color={CHART_NEUTRALS.primary.css} width={4} opacity={0.85} />}>
              3 PMID
            </LegendItem>
            <li className="pt-1 text-2xs text-fg-subtle">
              Encre neutre : un compte brut, pas un niveau de signal.
            </li>
          </LegendGroup>
        </Legend>
      </Section>

      <Section
        title="Paires les plus co-citées"
        description={`Les ${robust.length} paires qui reposent sur au moins deux PMID. Les ${stats.nSinglePmid} autres n'en ont qu'un : une seule publication suffit à créer le lien.`}
      >
        <PairsTable pairs={robust} max={stats.maxWeight} />
        <details className="group rounded-xl border border-line bg-surface shadow-xs">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg hover:bg-surface-muted">
            Afficher les {pairs.length} paires de la carte
          </summary>
          <div className="border-t border-line p-3">
            <PairsTable pairs={pairs} max={stats.maxWeight} compact />
          </div>
        </details>
      </Section>

      <Section title="Méthode de l'étude d'origine">
        <p className="max-w-prose text-sm leading-relaxed text-fg-muted">
          Détection des libellés dans les titres et résumés (fenêtre de ±800
          caractères autour de chaque mention, option au niveau de la phrase),
          avec contrôle des négations ; poids d&apos;un lien = nombre de PMID
          uniques ; disposition et tailles calculées dans Gephi. Le site
          actuel reprend cette démarche avec un vocabulaire normalisé, des
          tests statistiques et la conservation des phrases sources.
        </p>
      </Section>
    </div>
  );
}

function PairsTable({
  pairs,
  max,
  compact = false,
}: {
  pairs: LegacyPair[];
  max: number;
  compact?: boolean;
}) {
  return (
    <div className={cn("overflow-x-auto", !compact && "rounded-xl border border-line bg-surface shadow-card")}>
      <table className="w-full min-w-[30rem] text-left text-sm">
        <caption className="sr-only">
          Paires libellé HLA × complication de la carte v1, par nombre de PMID
          uniques décroissant
        </caption>
        <thead className="bg-surface-muted text-2xs uppercase tracking-wider text-fg-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Libellé HLA</th>
            <th scope="col" className="px-3 py-2 font-medium">Complication (libellé d&apos;origine)</th>
            <th scope="col" className="px-3 py-2 font-medium">PMID uniques</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {pairs.map((p) => (
            <tr key={`${p.hla.id}-${p.complication.id}`}>
              <td className={cn("px-3", compact ? "py-1" : "py-2")}>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: p.hla.hlaClass
                        ? HLA_CLASS_COLORS[p.hla.hlaClass].css
                        : CATEGORY_FALLBACK.css,
                    }}
                  />
                  <span className="allele text-fg">{p.hla.label}</span>
                </span>
              </td>
              <td className={cn("px-3", compact ? "py-1" : "py-2")}>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-[2px]"
                    style={{
                      background: p.complication.category
                        ? categoryColor(p.complication.category).css
                        : CATEGORY_FALLBACK.css,
                    }}
                  />
                  <span className="text-fg">{p.complication.label}</span>
                  {p.complication.gloss && !compact ? (
                    <span className="text-xs text-fg-subtle">≈ {p.complication.gloss}</span>
                  ) : null}
                </span>
              </td>
              <td className={cn("px-3", compact ? "py-1" : "py-2")}>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-16 rounded-full bg-fg/[0.07]">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(p.weight / max) * 100}%` }}
                    />
                  </span>
                  <span className="tabular text-fg">{p.weight}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
