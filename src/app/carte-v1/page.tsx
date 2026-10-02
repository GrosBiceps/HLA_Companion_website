import type { Metadata } from "next";
import { UnderConstruction } from "@/components/shell/UnderConstruction";

/**
 * Carte d'ensemble (v1) — PAGE PROVISOIRE.
 * Remplacee par la vraie vue (phase 2) ; la route existe deja pour que le
 * lien de navigation ne mene pas a un 404.
 */
export const metadata: Metadata = {
  title: "Carte v1 — co-occurrences textuelles",
  description:
    "Cartographie d'ensemble des co-mentions entre allèles HLA et " +
    "complications dans la littérature indexée. Ce ne sont pas des " +
    "associations cliniques.",
};

export default function CarteV1Page() {
  return (
    <UnderConstruction
      eyebrow="Cartographie"
      title="Carte d'ensemble du corpus"
      description="Une vue panoramique de ce qui se publie ensemble : allèles, complications et la densité de leurs co-mentions."
      planned="La carte arrive dans une prochaine version. En attendant, le graphe permet déjà de parcourir les co-mentions de proche en proche."
    />
  );
}
