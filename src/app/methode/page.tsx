import type { Metadata } from "next";
import { getCorpusVersion } from "@/lib/db";
import { EpistemicNotice } from "@/components/EpistemicNotice";
import { UnderConstruction } from "@/components/shell/UnderConstruction";

/**
 * Methode — PAGE PROVISOIRE.
 *
 * Cible de tous les liens « Méthodologie » / « En savoir plus » du site. En
 * attendant la page complete (phase 2), elle porte au minimum l'encart
 * epistemique : un lien « en savoir plus » qui menerait a une page vide
 * ferait pire que pas de lien.
 */
export const metadata: Metadata = {
  title: "Méthode — ce que mesurent les chiffres",
  description:
    "Méthode d'extraction et de mesure des co-occurrences textuelles entre " +
    "allèles HLA et complications. Ce ne sont pas des associations cliniques.",
};

export default function MethodePage() {
  const corpus = getCorpusVersion();
  return (
    <UnderConstruction
      eyebrow="À propos"
      title="Méthode"
      description="Comment le corpus est constitué, ce que mesure chaque chiffre, et les limites de l'extraction automatique."
      planned="La description complète de la méthode arrive dans une prochaine version. L'essentiel du cadrage est ci-dessous."
    >
      <EpistemicNotice corpusVersion={corpus.version} />
    </UnderConstruction>
  );
}
