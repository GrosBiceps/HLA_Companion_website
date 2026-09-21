import Link from "next/link";
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
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {ancestry.map((node, index) => {
          const isLast = index === ancestry.length - 1;
          const count = `${node.nMentions} article${node.nMentions > 1 ? "s" : ""}`;

          return (
            <li key={node.hla} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden="true" className="text-slate-400">
                  ›
                </span>
              ) : null}

              {isLast ? (
                <span
                  aria-current="page"
                  className="font-semibold text-slate-900"
                >
                  {node.hla}
                </span>
              ) : (
                <Link
                  href={`/allele/${encodeURIComponent(node.hla)}`}
                  className="text-slate-700 underline underline-offset-2
                             hover:text-slate-900"
                >
                  {node.hla}
                </Link>
              )}

              <span className="text-xs text-slate-500">({count})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
