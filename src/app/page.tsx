import Link from "next/link";
import { getCorpusVersion } from "@/lib/db";
import { getCorpusStats } from "@/lib/queries";
import { EpistemicNotice } from "@/components/EpistemicNotice";
import { SearchBar } from "@/components/SearchBar";

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

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-600">
        {label}
      </p>
    </div>
  );
}

function EntryCard({
  href,
  title,
  description,
  starred = false,
}: {
  href: string;
  title: string;
  description: string;
  starred?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-300 bg-white p-4
                 transition hover:border-slate-800 hover:bg-slate-50"
    >
      <p className="font-semibold text-slate-900">
        {starred ? (
          <span aria-hidden="true" className="mr-1 text-amber-500">
            ★
          </span>
        ) : null}
        {title}
      </p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
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
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          Compagnon bibliométrique HLA
        </h1>
        <p className="text-sm text-slate-700">
          Explorer les co-occurrences entre allèles HLA et complications de la
          transplantation rénale dans la littérature indexée.
        </p>
      </header>

      <EpistemicNotice corpusVersion={corpus.version} />

      <SearchBar />

      <section aria-label="Statistiques du corpus">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            value={NUMBER_FORMAT.format(stats.nArticles)}
            label="Articles"
          />
          <StatCard
            value={NUMBER_FORMAT.format(stats.nOutcomes)}
            label="Complications"
          />
          <StatCard
            value={NUMBER_FORMAT.format(stats.nAlleles)}
            label="Allèles"
          />
          <StatCard value={coverage} label="Couverture" />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Corpus <strong>{corpus.version}</strong> (univers {corpus.universe}),
          figé le {formatBuiltAt(corpus.builtAt)}. Corpus gelé : les chiffres
          ne changent pas tant qu&apos;il n&apos;est pas reconstruit.
        </p>
      </section>

      <section aria-label="Points d'entrée" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide
                       text-slate-700">
          Par où commencer
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <EntryCard
            starred
            href={`/allele/${encodeURIComponent(SHOWCASE_ALLELE)}`}
            title={`Allèle — ${SHOWCASE_ALLELE}`}
            description="Toutes les complications co-mentionnées avec cet allèle, et les phrases sources."
          />
          <EntryCard
            href="/complication"
            title="Complication"
            description="Partir d'une complication clinique et voir quels allèles l'accompagnent dans le texte."
          />
          <EntryCard
            href="/graphe"
            title="Graphe"
            description="Vue d'ensemble des co-mentions du corpus, allèles et complications reliés."
          />
        </div>
      </section>
    </div>
  );
}
