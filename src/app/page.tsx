import { ArrowRight } from "lucide-react";
import {
  getCorpusStats,
  getOutcomesByCategory,
  getSignalHighlights,
  getTopAuthors,
} from "@/lib/queries";
import { LinkButton } from "@/components/ui";
import { buildConstellation } from "@/components/landing/constellation";
import { Hero } from "@/components/landing/Hero";

/** Allele propose en exemple sous le champ de recherche. */
const EXAMPLE_ALLELE = "HLA-DQB1*02:01";

/**
 * Accueil — Server Component, aucun JavaScript client hors du champ de
 * recherche.
 *
 * CONSIGNE : l'accueil ne contient QUE le bandeau d'ouverture (chapo, ligne
 * de cadrage, recherche, constellation) et un unique bouton « En savoir plus »
 * vers /presentation. Un clinicien qui arrive veut lancer une recherche en
 * deux secondes : rien d'autre ne doit le distraire. Le cadrage complet, les
 * chiffres du corpus, les trois gestes, les signaux marques, les points
 * d'entree et le contexte scientifique vivent dans /presentation.
 *
 * ORDRE. La ligne de cadrage (« Pas des associations cliniques ni causales »)
 * precede le champ de recherche (garde-fou teste).
 *
 * ⚠ Aucun compteur en dur : tout vient de la base a chaque rendu.
 * ⚠ Aucune metrique d'association brute (NPMI, OR, FDR) n'est affichee.
 */
export default function HomePage() {
  const stats = getCorpusStats();

  const constellation = buildConstellation(
    getSignalHighlights({ levels: ["strong"], resolutions: ["2-digit"], limit: 40 }),
    { maxPerSide: 7, maxEdges: 12 },
  );

  const categories = getOutcomesByCategory();
  const topAuthor = getTopAuthors(1)[0] ?? null;
  const exampleOutcome =
    categories.flatMap((c) => c.outcomes).find((o) => /humoral/i.test(o.label)) ??
    categories[0]?.outcomes[0] ??
    null;

  return (
    <div className="flex min-h-[calc(100svh-16rem)] flex-col justify-center gap-8 sm:gap-10 lg:min-h-[calc(100svh-15rem)]">
      <Hero
        nArticles={stats.nArticles}
        yearMin={stats.yearMin}
        yearMax={stats.yearMax}
        constellation={constellation}
        examples={{
          allele: EXAMPLE_ALLELE,
          outcome: exampleOutcome
            ? { key: exampleOutcome.outcome, label: exampleOutcome.label }
            : null,
          author: topAuthor ? { id: topAuthor.authorId, name: topAuthor.displayName } : null,
        }}
      />
      <div>
        <LinkButton href="/presentation" variant="secondary" size="md">
          En savoir plus
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </LinkButton>
      </div>
    </div>
  );
}
