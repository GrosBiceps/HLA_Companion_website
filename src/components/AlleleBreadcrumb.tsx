import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HlaEntity } from "@/lib/types";

/**
 * Fil d'Ariane de la hierarchie allelique : classe › locus › 2-digit ›
 * 4-digit, racine en tete (ordre rendu par `getAlleleAncestry`).
 *
 * POURQUOI LE COMPTE D'ARTICLES SUR CHAQUE MAILLON. La resolution est la
 * source de confusion la plus couteuse de ce domaine : « HLA-DQB1*02 » et
 * « HLA-DQB1*02:01 » ne designent pas le meme ensemble d'articles, et un
 * lecteur qui remonte d'un cran sans le voir croira lire les memes donnees a
 * un autre niveau de detail. Le compte affiche a chaque maillon rend le
 * changement d'assiette visible AVANT le clic.
 *
 * Le dernier maillon est l'allele courant : il est rendu en `aria-current` et
 * sans lien, parce qu'un lien vers la page ou l'on se trouve deja est du bruit
 * de navigation.
 */
export function AlleleBreadcrumb({ ancestry }: { ancestry: HlaEntity[] }) {
  if (ancestry.length === 0) return null;

  return (
    <nav aria-label="Hiérarchie de l'allèle" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {ancestry.map((node, index) => {
          const isLast = index === ancestry.length - 1;
          const count = `${node.nMentions} article${node.nMentions > 1 ? "s" : ""}`;

          return (
            <li key={node.hla} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-fg-faint"
                />
              ) : null}

              {isLast ? (
                <span
                  aria-current="page"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-0.5 text-primary-soft-fg"
                >
                  <span className="allele font-semibold">{node.hla}</span>
                  <span className="tabular text-2xs opacity-75">({count})</span>
                </span>
              ) : (
                <Link
                  href={`/allele/${encodeURIComponent(node.hla)}`}
                  className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-fg-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
                >
                  <span className="allele">{node.hla}</span>
                  <span className="tabular text-2xs text-fg-subtle">({count})</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
