import Link from "next/link";
import type { Metadata } from "next";
import { Callout, PageHeader } from "@/components/ui";
import { MatrixHeatmap } from "@/components/charts/MatrixHeatmap";
import {
  CategoryScale,
  CellSizeScale,
  Legend,
  LegendGroup,
  LegendItem,
  SignalScale,
} from "@/components/charts";
import { OrganStrip } from "@/components/organ/OrganChip";
import {
  getAssociationMatrix,
  getCorpusStats,
  getMatrixLoci,
  getOrgans,
} from "@/lib/queries";
import {
  ALL_ORGANS,
  organFromSearchParams,
  organLabel,
  organShortLabel,
} from "@/lib/organ";
import { toClientMatrix } from "@/lib/matrix";

/**
 * Matrice alleles × complications — Server Component.
 *
 * La matrice est lue COTE SERVEUR (`getAssociationMatrix`, ~2 ms) et
 * debarrassee de ses metriques brutes (`toClientMatrix`) avant d'etre
 * transmise au composant client, qui ne porte que l'interaction (tri,
 * filtre, infobulle). La resolution (2 ou 4 chiffres) est dans l'URL :
 * `?resolution=4-digit`, pour qu'une vue soit partageable.
 *
 * ORGANE. `?organe=foie` recalcule la matrice dans la strate : les cases sont
 * les associations de l'organe (denominateur propre), les lignes les alleles
 * cites dans cet organe, les colonnes les complications qui s'y appliquent
 * (plus celles co-mentionnees dans la strate, rien n'est masque).
 */
export const metadata: Metadata = {
  title: "Matrice — co-occurrences textuelles",
  description:
    "Vue croisée des allèles HLA et des complications co-mentionnés dans la " +
    "littérature indexée. Ce ne sont pas des associations cliniques.",
};

type SearchParams = {
  searchParams: Promise<{ resolution?: string; locus?: string; organe?: string }>;
};

export default async function MatricePage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const resolution = sp.resolution === "4-digit" ? "4-digit" : "2-digit";
  const organ = organFromSearchParams(sp);
  const organs = getOrgans();
  const stratum = organs.find((o) => o.key === organ);
  const baseHref =
    resolution === "4-digit"
      ? `/matrice?resolution=4-digit${sp.locus ? `&locus=${encodeURIComponent(sp.locus)}` : ""}`
      : "/matrice";

  let matrix;
  try {
    // En 4 chiffres (~900 lignes), la grille est paginee par locus : une table
    // DOM de 20 000 cases figerait le navigateur. Le 2 chiffres reste entier.
    let locus: string | undefined;
    if (resolution === "4-digit") {
      const loci = getMatrixLoci(resolution, organ).map((l) => l.locus);
      locus = loci.includes(sp.locus ?? "") ? sp.locus : loci[0];
    }
    matrix = toClientMatrix(getAssociationMatrix(resolution, locus, organ));
  } catch (error) {
    console.error("Echec de la lecture de la matrice :", error);
    matrix = null;
  }

  const maxCount = matrix
    ? Math.max(1, ...matrix.cells.map((c) => c.nCooccurrence))
    : 1;
  const midCount = Math.max(2, Math.round(maxCount / 6));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vue croisée"
        title={
          organ === ALL_ORGANS
            ? "Matrice allèles × complications"
            : `Matrice allèles × complications : ${organShortLabel(organ)}`
        }
        description="Chaque case croise un allèle et une complication : sa couleur dit le niveau de signal de leur co-mention, sa taille le nombre d'articles qui les citent ensemble. Survolez une case pour la lire, cliquez pour ouvrir la fiche de l'allèle."
      />

      <OrganStrip
        baseHref={baseHref}
        selected={organ}
        counts={Object.fromEntries(organs.map((o) => [o.key, o.nArticles]))}
        allCount={getCorpusStats().nArticles}
        stratum={{ nArticles: stratum?.nArticles, nTotal: getCorpusStats().nArticles }}
        hint="La matrice est recalculée dans la strate de l'organe : lignes, colonnes, couleurs et tailles sont ceux de ses seuls articles."
      >
        <span className="text-fg-subtle">
          Colonnes : complications de {organLabel(organ)} ; lignes : allèles
          cités dans l&apos;organe.
          {matrix && (matrix.nCellsOutsideOrgan ?? 0) > 0
            ? ` ${matrix.nCellsOutsideOrgan} paire${(matrix.nCellsOutsideOrgan ?? 0) > 1 ? "s" : ""} portant sur des complications d'autres organes (articles concernant deux organes) ne sont pas dessinées ; elles figurent sur les fiches.`
            : ""}
        </span>
      </OrganStrip>


      <Callout tone="framing" title="Comment lire cette matrice" aria-label="Comment lire cette matrice">
        <p>
          Une case pleine signale que les deux termes{" "}
          <strong>apparaissent dans les mêmes articles</strong> du corpus
          indexé, pas qu&apos;ils sont observés ensemble chez des patients. Une
          case foncée est une co-occurrence marquée dans le texte ; une case
          grise reste indiscernable du hasard ; une case vide n&apos;a jamais
          été co-mentionnée.
        </p>
        <p>
          Toute lecture clinique passe par les phrases sources, accessibles
          depuis la fiche de chaque allèle.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      {matrix ? (
        <MatrixHeatmap matrix={matrix} />
      ) : (
        <Callout tone="danger" role="alert" title="Le corpus n'a pas pu être consulté">
          Ce n&apos;est pas un résultat : aucune conclusion n&apos;est à tirer
          de cette absence. Réessayez dans un instant.
        </Callout>
      )}

      <Legend className="md:grid-cols-[1.4fr_1fr_1fr]">
        <LegendGroup title="Couleur : niveau de signal">
          <li>
            <SignalScale />
          </li>
          <li className="pt-1 text-2xs text-fg-subtle">
            Un niveau qualitatif, jamais une mesure clinique. Le signal inverse
            (moins de co-mentions qu&apos;attendu) est hors échelle.
          </li>
        </LegendGroup>
        <LegendGroup title="Taille : nombre d'articles">
          <li>
            <CellSizeScale max={maxCount} steps={[1, midCount, maxCount]} />
          </li>
          <LegendItem
            swatch={
              <span className="flex h-4 w-4 items-center justify-center rounded-[2px] ring-1 ring-inset ring-line">
                <span className="h-[3px] w-[3px] rounded-full bg-fg/20" />
              </span>
            }
          >
            Case vide : jamais co-mentionnés
          </LegendItem>
          <LegendItem
            swatch={
              <span className="flex h-4 w-4 items-center justify-center rounded-[2px] ring-1 ring-inset ring-line">
                <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-fg/30" />
              </span>
            }
          >
            Contour pointillé : masquée par le filtre
          </LegendItem>
        </LegendGroup>
        <LegendGroup title="Colonnes : catégorie clinique">
          <li>
            <CategoryScale />
          </li>
        </LegendGroup>
      </Legend>
    </div>
  );
}
