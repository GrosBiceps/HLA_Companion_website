import Link from "next/link";
import type { Metadata } from "next";
import { Callout, PageHeader, StatTile } from "@/components/ui";
import { AlleleBrowser } from "@/components/entity/AlleleBrowser";
import { buildAlleleTree } from "@/lib/allele-tree";
import { formatInt } from "@/lib/format";
import { getAlleleCatalog } from "@/lib/queries";

/**
 * Index des alleles — porte d'entree « Explorer par allele ».
 *
 * Toute la nomenclature du corpus, rangee classe -> locus -> 2-digit ->
 * 4-digit, avec le nombre d'articles mentionnant chaque forme et le nombre
 * de co-occurrences au-dessus du seuil (un compte de niveaux qualitatifs,
 * pas une metrique). Le filtre est un composant client ; l'arbre est
 * construit ici, cote serveur, par un module pur (`allele-tree.ts`).
 *
 * Les ancres `#classe-I`, `#classe-II` et `#locus-<X>` sont la cible des
 * maillons « classe » et « locus » du fil d'Ariane des fiches allele.
 */
export const metadata: Metadata = {
  title: "Allèles HLA — index du corpus",
  description:
    "Tous les allèles HLA mentionnés dans le corpus, par classe, locus et " +
    "résolution. Co-occurrences textuelles, pas des associations cliniques.",
};

export default function AlleleIndexPage() {
  const catalog = getAlleleCatalog();
  const tree = buildAlleleTree(catalog);
  const n2 = catalog.filter((e) => e.resolution === "2-digit").length;
  const n4 = catalog.filter((e) => e.resolution === "4-digit").length;
  const nLoci = tree.classes.reduce((s, c) => s + c.loci.length, 0);
  const nWithSignal = catalog.filter((e) => e.nMarked > 0).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Explorer par allèle"
        title="Allèles HLA du corpus"
        description="La nomenclature telle que l'extraction l'a rencontrée : classe, locus, puis résolution 2-digit et 4-digit. Chaque forme a sa fiche et ses propres articles."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Loci" value={nLoci} hint="classes I et II" />
        <StatTile
          label="Allèles 2-digit"
          value={formatInt(n2)}
          hint="ex. HLA-DQB1*02"
        />
        <StatTile
          label="Allèles 4-digit"
          value={formatInt(n4)}
          hint="ex. HLA-DQB1*02:01"
        />
        <StatTile
          label="Au-dessus du seuil"
          value={formatInt(nWithSignal)}
          hint="entités avec ≥ 1 co-occurrence marquée"
        />
      </div>

      <Callout
        tone="framing"
        title="Comment lire cet index"
        aria-label="Comment lire cet index"
      >
        <p>
          « art. » compte les articles qui mentionnent{" "}
          <strong>explicitement</strong> cette forme : un article qui écrit «
          DQB1*02 » n&apos;est pas compté sous « DQB1*02:01 », et les nombres ne
          s&apos;additionnent pas d&apos;un niveau à l&apos;autre. « ▲ » compte
          les complications co-mentionnées au-dessus du seuil statistique du
          corpus — des co-occurrences textuelles, pas des associations
          cliniques.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      <AlleleBrowser tree={tree} />
    </div>
  );
}
