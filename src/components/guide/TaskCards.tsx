import Link from "next/link";
import {
  ArrowRight,
  Dna,
  GitCompareArrows,
  Grid3x3,
  Network,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cardClasses } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Cartes « Que voulez-vous faire ? » du guide : un besoin, une action, une
 * destination. Chaque carte est un lien entier vers la route concernee.
 *
 * ⚠ Les `href` sont verifies contre `src/app` par `guide.test.tsx`.
 */
export interface Task {
  id: string;
  icon: LucideIcon;
  need: string;
  how: string;
  cta: string;
  href: string;
}

export const TASKS: Task[] = [
  {
    id: "allele",
    icon: Dna,
    need: "Je cherche un allèle précis",
    how: "Tapez son nom dans la recherche (« DQB1*02:01 », « A*02 »…) ou parcourez les allèles par locus. La fiche liste toutes les complications co-mentionnées.",
    cta: "Parcourir les allèles",
    href: "/allele",
  },
  {
    id: "complication",
    icon: Stethoscope,
    need: "Je pars d'une complication",
    how: "Choisissez-la par catégorie clinique (rejet, infection, fonction du greffon…) : la fiche classe les allèles co-mentionnés avec elle.",
    cta: "Parcourir les complications",
    href: "/complication",
  },
  {
    id: "ensemble",
    icon: Grid3x3,
    need: "Je veux la vue d'ensemble",
    how: "La matrice croise tous les allèles et toutes les complications d'un coup d'œil ; chaque case est cliquable jusqu'aux phrases.",
    cta: "Ouvrir la matrice",
    href: "/matrice",
  },
  {
    id: "reseau",
    icon: Network,
    need: "Je veux explorer de proche en proche",
    how: "Le graphe part d'un nœud et déroule ses voisins : un allèle mène à ses complications, une complication à ses allèles.",
    cta: "Ouvrir le graphe",
    href: "/graph",
  },
  {
    id: "auteur",
    icon: UserRound,
    need: "Je cherche un auteur",
    how: "Tapez un nom dans le champ de recherche de l'accueil (ou « / » depuis n'importe quelle page) : la fiche auteur liste ses articles du corpus.",
    cta: "Aller à la recherche",
    href: "/#recherche",
  },
  {
    id: "v1",
    icon: GitCompareArrows,
    need: "Je veux comparer avec l'étude v1",
    how: "La carte v1 reproduit la cartographie de l'étude antérieure, pour la confronter à la lecture actuelle du corpus.",
    cta: "Voir la carte v1",
    href: "/carte-v1",
  },
];

export function TaskCards() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TASKS.map(({ id, icon: Icon, need, how, cta, href }) => (
        <li key={id} className="flex">
          <Link
            href={href}
            className={cn(
              cardClasses({ interactive: true }),
              "group flex w-full flex-col gap-3 focus-visible:outline-2",
            )}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary"
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="space-y-1.5">
              <span className="block font-serif text-lg font-semibold leading-snug text-fg">
                {need}
              </span>
              <span className="block text-sm leading-relaxed text-fg-muted">{how}</span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary">
              {cta}
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
