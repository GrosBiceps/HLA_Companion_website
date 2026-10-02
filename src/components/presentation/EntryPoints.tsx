import Link from "next/link";
import { ArrowRight, Dna, Grid3x3, Network, Stethoscope, UserRound } from "lucide-react";
import { AlleleName, HlaClassBadge, cardClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CategoryOverview, LocusOverview } from "@/lib/queries";
import { categoryClasses, categoryDisplay, hlaClassColor } from "@/lib/theme";
import type { Author } from "@/lib/types";
import { NUMBER_FORMAT, plural } from "@/components/landing/constellation";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";

function PanelHeader({
  icon,
  eyebrow,
  title,
  href,
  hrefLabel,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary [&>svg]:h-[18px] [&>svg]:w-[18px]"
        >
          {icon}
        </span>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="font-semibold text-fg">{title}</h3>
        </div>
      </div>
      {href ? (
        <Link href={href} className="link inline-flex items-center gap-1 text-sm">
          {hrefLabel}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

/** Par allele : loci groupes par classe HLA, alleles les plus cites. */
function ByAllele({ loci, organ }: { loci: LocusOverview[]; organ: OrganSelection }) {
  const classes = ["I", "II"].map((c) => ({
    hlaClass: c,
    loci: loci.filter((l) => l.hlaClass === c),
  }));
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <PanelHeader
        icon={<Dna />}
        eyebrow="Par allèle"
        title="Six loci, deux classes"
        href={withOrgan("/allele", organ)}
        hrefLabel="Tous les allèles"
      />
      {classes.map(({ hlaClass, loci: group }) =>
        group.length === 0 ? null : (
          <div key={hlaClass} className="space-y-2">
            <HlaClassBadge hlaClass={hlaClass} />
            <ul className="divide-y divide-line">
              {group.map((l) => (
                <li
                  key={l.locus}
                  className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-3 py-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]"
                >
                  <div>
                    <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-fg">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full"
                        style={{ background: hlaClassColor(l.hlaClass).css }}
                      />
                      {l.locus}
                    </p>
                    <p className="text-2xs text-fg-subtle">
                      {plural(l.nAlleles2Digit + l.nAlleles4Digit, "allèle")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {l.topAlleles.map((a) => (
                      <Link
                        key={a.hla}
                        href={withOrgan(`/allele/${encodeURIComponent(a.hla)}`, organ)}
                        className="inline-flex items-center rounded-md border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg transition hover:border-primary/50 hover:bg-primary-soft hover:text-primary-soft-fg"
                      >
                        <AlleleName hla={a.hla} />
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

/** Par complication : 7 categories cliniques, chacune avec ses complications. */
function ByComplication({ categories, organ }: { categories: CategoryOverview[]; organ: OrganSelection }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <PanelHeader
        icon={<Stethoscope />}
        eyebrow="Par complication"
        title={`${categories.length} catégories cliniques`}
        href={withOrgan("/complication", organ)}
        hrefLabel="Toutes les complications"
      />
      <ul className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {categories.map((c) => (
          <li key={c.category} className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <span
                aria-hidden="true"
                className={cn("h-2.5 w-2.5 rounded-full", categoryClasses(c.category).bg)}
              />
              {categoryDisplay(c.category)}
              <span className="tabular text-2xs font-normal text-fg-subtle">
                {NUMBER_FORMAT.format(c.nMentions)} mentions
              </span>
            </p>
            <ul className="flex flex-wrap gap-1.5 pl-[1.125rem]">
              {c.outcomes.map((o) => (
                <li key={o.outcome}>
                  <Link
                    href={withOrgan(`/complication/${encodeURIComponent(o.outcome)}`, organ)}
                    className="inline-block rounded-md px-1.5 py-0.5 text-xs text-fg-muted ring-1 ring-inset ring-line transition hover:bg-primary-soft hover:text-primary-soft-fg hover:ring-primary/30"
                  >
                    {o.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Par auteur : les auteurs les plus publies du corpus. */
function ByAuthor({
  authors,
  synthetic,
  organ,
}: {
  authors: Author[];
  synthetic: boolean;
  organ: OrganSelection;
}) {
  const max = Math.max(1, ...authors.map((a) => a.nPublications));
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <PanelHeader icon={<UserRound />} eyebrow="Par auteur" title="Les plus publiés du corpus" />
      <ol className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {authors.map((a, i) => (
          <li key={a.authorId}>
            <Link
              href={withOrgan(`/auteur/${encodeURIComponent(a.authorId)}`, organ)}
              className="group grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="tabular text-xs text-fg-subtle">{i + 1}</span>
              <span className="min-w-0 space-y-1">
                <span className="block truncate text-sm font-medium text-fg group-hover:text-primary">
                  {a.displayName}
                </span>
                <span aria-hidden="true" className="block h-1 rounded-full bg-surface-sunken">
                  <span
                    className="block h-1 rounded-full bg-primary/60"
                    style={{ width: `${(100 * a.nPublications) / max}%` }}
                  />
                </span>
              </span>
              <span className="tabular text-xs text-fg-muted">
                {plural(a.nPublications, "article")}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {synthetic ? (
        <p className="mt-auto text-2xs leading-snug text-fg-subtle">
          Noms fictifs, générés pour le jeu de démonstration.
        </p>
      ) : null}
    </div>
  );
}

const DOORS = [
  {
    href: "/allele",
    icon: Dna,
    title: "Allèle",
    text: "Partir d'un allèle HLA et voir toutes ses complications co-mentionnées.",
  },
  {
    href: "/complication",
    icon: Stethoscope,
    title: "Complication",
    text: "Partir d'un événement clinique et voir les allèles cités avec lui.",
  },
  {
    href: "/matrice",
    icon: Grid3x3,
    title: "Vue d'ensemble",
    text: "La matrice allèles × complications, d'un seul regard.",
  },
  {
    href: "/graph",
    icon: Network,
    title: "Réseau",
    text: "Explorer de proche en proche, d'un nœud à ses voisins.",
  },
];

/** « Par où commencer ? » : quatre grandes portes, plus l'astuce auteur. */
function Doors({ organ }: { organ: OrganSelection }) {
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DOORS.map(({ href, icon: Icon, title, text }) => (
          <li key={href} className="flex">
            <Link
              href={withOrgan(href, organ)}
              className={cn(
                cardClasses({ interactive: true, padding: "lg" }),
                "group flex w-full flex-col gap-3",
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-serif text-xl font-semibold text-fg">{title}</span>
              <span className="text-sm leading-relaxed text-fg-muted">{text}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary">
                Ouvrir
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-subtle" />
        <span>
          Vous cherchez un auteur ? Tapez son nom dans la{" "}
          <a href="/#recherche" className="link">
            recherche
          </a>
          .
        </span>
      </p>
    </div>
  );
}

/**
 * Points d'entree : les quatre portes, puis par allele (loci groupes par
 * classe), par complication (7 categories) et par auteur.
 */
export function EntryPoints({
  loci,
  categories,
  authors,
  synthetic,
  organ = ALL_ORGANS,
}: {
  loci: LocusOverview[];
  categories: CategoryOverview[];
  authors: Author[];
  synthetic: boolean;
  organ?: OrganSelection;
}) {
  return (
    <div className="space-y-8">
      <Doors organ={organ} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ByAllele loci={loci} organ={organ} />
        <ByComplication categories={categories} organ={organ} />
      </div>
      <ByAuthor authors={authors} synthetic={synthetic} organ={organ} />
    </div>
  );
}
