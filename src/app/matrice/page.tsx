import type { Metadata } from "next";
import { UnderConstruction } from "@/components/shell/UnderConstruction";

/**
 * Matrice alleles × complications — PAGE PROVISOIRE.
 * Remplacee par la vraie vue (phase 2) ; la route existe deja pour que le
 * lien de navigation ne mene pas a un 404.
 */
export const metadata: Metadata = {
  title: "Matrice — co-occurrences textuelles",
  description:
    "Vue croisée des allèles HLA et des complications co-mentionnés dans la " +
    "littérature indexée. Ce ne sont pas des associations cliniques.",
};

export default function MatricePage() {
  return (
    <UnderConstruction
      eyebrow="Vue croisée"
      title="Matrice allèles × complications"
      description="Une grille qui croise les allèles et les complications, chaque case résumant les articles qui les mentionnent ensemble."
      planned="La matrice arrive dans une prochaine version. En attendant, le graphe permet déjà de parcourir les co-mentions de proche en proche."
    />
  );
}
