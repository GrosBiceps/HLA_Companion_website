import Link from "next/link";
import type { Metadata } from "next";
import { Callout, PageHeader, StatTile } from "@/components/ui";
import {
  SerotypeBrowser,
  type SerotypeCard,
  type SerotypeLocusSection,
} from "@/components/entity/SerotypeBrowser";
import { OrganStrip } from "@/components/organ/OrganChip";
import { formatInt } from "@/lib/format";
import { getCorpusStats, getOrgans } from "@/lib/queries";
import {
  organFromPage,
  type PageSearchParams,
} from "@/lib/organ";
import {
  SEROTYPE_LOCI,
  SEROTYPE_LOCUS_LABELS,
  getSerotypeCatalog,
  getSerotypeDirectAlleles,
} from "@/lib/serotypes";

/**
 * Index des serotypes — porte d'entree « Chercher par serotype ».
 *
 * Les specificites serologiques (A2, B27, DR15, DQ2, Cw7...) rangees par
 * locus, les familles larges (A9, B5, DR2...) regroupant leurs specificites
 * plus fines. Chaque carte mene a la fiche du serotype, qui liste les alleles
 * correspondants. Le filtre est un composant client ; les donnees sont lues
 * ici, cote serveur.
 *
 * Les ancres `#locus-<X>` sont la cible du fil d'Ariane des fiches serotype.
 *
 * ORGANE. `?organe=foie` recalcule les effectifs d'articles de chaque carte sur
 * la strate ; le navigateur filtre par defaut sur les specificites citees dans
 * l'organe et sait trier par nombre d'articles (« tri par organe »).
 */
export const metadata: Metadata = {
  title: "Sérotypes HLA — index du corpus",
  description:
    "Spécificités sérologiques HLA (A2, B27, DR15, DQ2…) et allèles " +
    "correspondants. Table de référence ; co-occurrences textuelles, pas des " +
    "associations cliniques.",
};

export default async function SerotypeIndexPage({
  searchParams,
}: {
  searchParams?: PageSearchParams;
} = {}) {
  const organ = await organFromPage(searchParams);
  const catalog = getSerotypeCatalog(organ);
  const direct = getSerotypeDirectAlleles();
  const organs = getOrgans();
  const stratum = organs.find((o) => o.key === organ);

  const sections: SerotypeLocusSection[] = SEROTYPE_LOCI.map((locus) => ({
    locus,
    title: SEROTYPE_LOCUS_LABELS[locus] ?? locus,
    hlaClass: (locus === "A" || locus === "B" || locus === "C" ? "I" : "II") as "I" | "II",
    cards: catalog
      .filter((s) => s.locus === locus)
      .map(
        (s): SerotypeCard => ({
          id: s.serotypeId,
          label: s.label,
          locus: s.locus,
          kind: s.kind,
          broad: s.broadSerotype,
          nAlleles: s.nGroups + s.nAlleles,
          nArticles: s.nArticles,
          direct: (direct.get(s.serotypeId) ?? []).map((h) =>
            h.replace(/^HLA-/, ""),
          ),
        }),
      ),
  })).filter((s) => s.cards.length > 0);

  const nSpecific = catalog.filter((s) => s.kind !== "broad").length;
  const nBroad = catalog.filter((s) => s.kind === "broad").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Chercher par sérotype"
        title="Sérotypes HLA"
        description="Les spécificités sérologiques (A2, B27, DR15, DQ2, Cw7…) et les allèles qui les portent. Un sérotype ouvre la liste de ses allèles, à 2 et à 4 chiffres, chacun avec sa fiche."
      />

      <OrganStrip
        baseHref="/serotype"
        selected={organ}
        counts={Object.fromEntries(organs.map((o) => [o.key, o.nArticles]))}
        allCount={getCorpusStats().nArticles}
        stratum={{ nArticles: stratum?.nArticles, nTotal: getCorpusStats().nArticles }}
        hint="Effectifs : articles de chaque organe. Choisir un organe recalcule les effectifs des cartes sur ses articles."
      />


      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Loci" value={sections.length} hint="A, B, C, DR, DQ, DP" />
        <StatTile
          label="Spécificités"
          value={formatInt(nSpecific)}
          hint="sérotypes proprement dits"
        />
        <StatTile
          label="Familles larges"
          value={formatInt(nBroad)}
          hint="ex. A9 = A23 + A24"
        />
        <StatTile
          label="Allèles reliés"
          value={formatInt(catalog.reduce((n, s) => n + s.nGroups + s.nAlleles, 0))}
          hint="liens sérotype → allèle"
        />
      </div>

      <Callout
        tone="framing"
        title="Comment lire cet index"
        aria-label="Comment lire cet index"
      >
        <p>
          Un <strong>sérotype</strong> est une spécificité reconnue par des
          anticorps ; un <strong>allèle</strong> est une séquence d&apos;ADN.
          La table de correspondance est une{" "}
          <strong>référence pédagogique approchée</strong>, pas un résultat du
          corpus ; les nombres d&apos;articles sont ceux de la littérature
          indexée (co-occurrences textuelles, pas des associations cliniques).
          Les lignes en pointillé sont des familles larges qui regroupent les
          spécificités plus fines affichées avec elles.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      <SerotypeBrowser key={organ} sections={sections} organ={organ} />
    </div>
  );
}
