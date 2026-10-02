import Link from "next/link";
import { getCorpusVersion } from "@/lib/db";
import { getCorpusStats } from "@/lib/queries";
import { EpistemicNotice } from "@/components/EpistemicNotice";
import { SearchBar } from "@/components/SearchBar";
import { PageHeader, Section, StatTile, cardClasses } from "@/components/ui";
import { ArrowRight, CalendarRange, Dna, FileText, Network, Stethoscope } from "lucide-react";

/** Allele vitrine de la demonstration. */
const SHOWCASE_ALLELE = "HLA-DQB1*02:01";

/** Formatage francais des entiers (espace insecable comme separateur). */
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function formatBuiltAt(builtAt: string): string {
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return builtAt;
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function EntryCard({
  href,
  eyebrow,
  title,
  description,
  icon,
}: {
  href: string;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cardClasses({ interactive: true }) + " group flex flex-col gap-3"}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary [&>svg]:h-[18px] [&>svg]:w-[18px]"
      >
        {icon}
      </span>
      <span className="space-y-1">
        <span className="eyebrow block">{eyebrow}</span>
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-sm leading-relaxed text-fg-muted">
          {description}
        </span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
        Ouvrir
        <ArrowRight
          aria-hidden="true"
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

/**
 * Accueil — Server Component.
 *
 * ORDRE D'AFFICHAGE. Le cadrage epistemique est place AVANT la recherche, donc
 * avant tout chemin vers une fiche. C'est une correction : l'encart etait sous
 * la recherche, dont le panneau de resultats etait `absolute` et le recouvrait
 * — un utilisateur qui tapait des l'arrivee pouvait rejoindre une fiche allele
 * sans avoir lu une ligne du cadrage. Le panneau est desormais dans le flux
 * (cf. SearchBar) et l'encart le precede : les deux moities de la garantie.
 *
 * Elle reste une garantie de mise en page, pas un verrou : rien n'empeche un
 * acces direct a /allele/... par URL. Les fiches portent leur propre rappel.
 *
 * ⚠ Aucun compteur n'est ecrit en dur : tous viennent de `getCorpusStats()`,
 * qui les calcule en base a chaque rendu.
 */
export default function HomePage() {
  const corpus = getCorpusVersion();
  const stats = getCorpusStats();

  const coverage =
    stats.yearMin !== null && stats.yearMax !== null
      ? `${stats.yearMin}–${stats.yearMax}`
      : "—";

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Corpus A · espace allélique"
        title="Compagnon bibliométrique HLA"
        description="Explorer les co-occurrences entre allèles HLA et complications de la transplantation rénale dans la littérature indexée."
      />

      <EpistemicNotice corpusVersion={corpus.version} />

      <SearchBar />

      <section aria-label="Statistiques du corpus" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={<FileText />}
            value={NUMBER_FORMAT.format(stats.nArticles)}
            label="Articles"
          />
          <StatTile
            icon={<Stethoscope />}
            value={NUMBER_FORMAT.format(stats.nOutcomes)}
            label="Complications"
          />
          <StatTile
            icon={<Dna />}
            value={NUMBER_FORMAT.format(stats.nAlleles)}
            label="Allèles"
          />
          <StatTile icon={<CalendarRange />} value={coverage} label="Couverture" />
        </div>
        <p className="text-xs text-fg-subtle">
          Corpus <strong className="font-mono font-medium text-fg-muted">{corpus.version}</strong> (univers {corpus.universe}),
          figé le {formatBuiltAt(corpus.builtAt)}. Corpus gelé : les chiffres
          ne changent pas tant qu&apos;il n&apos;est pas reconstruit.
        </p>
      </section>

      <Section aria-label="Points d'entrée" title="Par où commencer">
        <div className="grid gap-4 sm:grid-cols-3">
          <EntryCard
            href={`/allele/${encodeURIComponent(SHOWCASE_ALLELE)}`}
            eyebrow="Fiche allèle"
            icon={<Dna />}
            title={<span className="allele">{SHOWCASE_ALLELE}</span>}
            description="Toutes les complications co-mentionnées avec cet allèle, et les phrases sources."
          />
          <EntryCard
            href="/complication"
            eyebrow="Fiche complication"
            icon={<Stethoscope />}
            title="Complication"
            description="Partir d'une complication clinique et voir quels allèles l'accompagnent dans le texte."
          />
          <EntryCard
            // Route en anglais (`/graph`) : c'est le chemin pose par le plan
            // de taches. Le libelle affiche reste francais, comme partout.
            href="/graph"
            eyebrow="Exploration"
            icon={<Network />}
            title="Graphe"
            description="Vue d'ensemble des co-mentions du corpus, allèles et complications reliés."
          />
        </div>
      </Section>
    </div>
  );
}
