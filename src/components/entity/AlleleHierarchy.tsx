import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AlleleName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";
import type { HlaEntity } from "@/lib/types";

/**
 * Navigation dans la nomenclature : fil d'Ariane (classe › locus › 2-digit
 * › 4-digit) et carte « parent / freres / sous-types ».
 *
 * POURQUOI DES COMPTES D'ARTICLES DISTINCTS A CHAQUE MAILLON. « HLA-DQB1*02 »
 * et « HLA-DQB1*02:01 » ne designent pas le meme ensemble d'articles : un
 * article qui ecrit « DQB1*02 » n'est pas compte sous « *02:01 », et
 * inversement. Le compte affiche avant le clic rend ce changement
 * d'assiette visible.
 *
 * Les noeuds « classe » et « locus » n'ont pas de mentions propres dans le
 * corpus : ils menent a l'index des alleles, ancre sur leur groupe, plutot
 * qu'a une fiche vide.
 */

/** Lien d'un noeud de hierarchie : index ancre pour classe/locus, fiche sinon. */
export function hierarchyHref(node: HlaEntity): string {
  if (node.resolution === "class") {
    return node.parentHla === null
      ? `/allele#classe-${node.hlaClass}`
      : `/allele#locus-${node.locus}`;
  }
  return `/allele/${encodeURIComponent(node.hla)}`;
}

/** Libelle lisible d'un noeud de hierarchie. */
export function hierarchyLabel(node: HlaEntity): string {
  if (node.resolution === "class") {
    return node.parentHla === null
      ? `Classe ${node.hlaClass}`
      : `Locus ${node.locus}`;
  }
  return node.hla;
}

export function AlleleBreadcrumbTrail({
  ancestry,
  organ = ALL_ORGANS,
}: {
  ancestry: HlaEntity[];
  organ?: OrganSelection;
}) {
  return (
    <nav aria-label="Hiérarchie de l'allèle" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <li>
          <Link
            href={withOrgan("/allele", organ)}
            className="rounded-md px-1 py-0.5 text-fg-muted hover:text-fg"
          >
            Allèles
          </Link>
        </li>
        {ancestry.map((node, i) => {
          const last = i === ancestry.length - 1;
          const label = hierarchyLabel(node);
          const isAllele = node.resolution !== "class";
          return (
            <li key={node.hla} className="flex items-center gap-1">
              <ChevronRight
                aria-hidden="true"
                className="h-3.5 w-3.5 text-fg-faint"
              />
              {last ? (
                <span
                  aria-current="page"
                  className={cn(
                    "rounded-md px-1 py-0.5 font-medium text-fg",
                    isAllele && "allele",
                  )}
                >
                  {label}
                </span>
              ) : (
                <Link
                  href={withOrgan(hierarchyHref(node), organ)}
                  className={cn(
                    "rounded-md px-1 py-0.5 text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
                    isAllele && "allele",
                  )}
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Chip({
  entity,
  count,
  organ,
  current = false,
}: {
  entity: HlaEntity;
  count: number;
  organ: OrganSelection;
  current?: boolean;
}) {
  if (current) {
    return (
      <span
        aria-current="page"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-2 py-1 text-xs text-primary-soft-fg ring-1 ring-inset ring-primary/20"
      >
        <AlleleName hla={entity.hla} className="font-semibold" />
        <span className="tabular opacity-75">{formatInt(count)}</span>
      </span>
    );
  }
  return (
    <Link
      href={withOrgan(hierarchyHref(entity), organ)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-xs text-fg ring-1 ring-inset ring-line transition-colors hover:bg-surface-muted hover:ring-line-strong"
    >
      <AlleleName hla={entity.hla} />
      <span className="tabular text-fg-subtle">{formatInt(count)}</span>
    </Link>
  );
}

export function AlleleFamily({
  allele,
  parent,
  siblings,
  children,
  counts,
  organ = ALL_ORGANS,
}: {
  organ?: OrganSelection;
  allele: HlaEntity;
  parent: HlaEntity | null;
  siblings: HlaEntity[];
  children: HlaEntity[];
  /** Articles distincts par entite. */
  counts: Map<string, number>;
}) {
  const n = (e: HlaEntity) => counts.get(e.hla) ?? 0;
  const parentIsAllele = parent !== null && parent.resolution !== "class";
  const sameLevel = [...siblings, allele].sort((a, b) =>
    a.hla.localeCompare(b.hla),
  );

  return (
    <div className="space-y-4 text-sm">
      {parentIsAllele ? (
        <div>
          <p className="eyebrow mb-1.5">Niveau supérieur</p>
          <Chip entity={parent} count={n(parent)} organ={organ} />
        </div>
      ) : null}

      {siblings.length > 0 ? (
        <div>
          <p className="eyebrow mb-1.5">
            {parentIsAllele
              ? `Sous-types de ${parent.hla.replace(/^HLA-/, "")}`
              : parent && parent.parentHla !== null
                ? `Allèles du locus ${parent.locus}`
                : "Même niveau"}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {sameLevel.map((e) => (
              <li key={e.hla}>
                <Chip entity={e} count={n(e)} organ={organ} current={e.hla === allele.hla} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children.length > 0 ? (
        <div>
          <p className="eyebrow mb-1.5">Résolution plus fine</p>
          <ul className="flex flex-wrap gap-1.5">
            {children.map((e) => (
              <li key={e.hla}>
                <Chip entity={e} count={n(e)} organ={organ} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-2xs leading-relaxed text-fg-subtle">
        Nombres : articles mentionnant explicitement chaque forme. Ils ne
        s&apos;additionnent pas d&apos;un niveau à l&apos;autre.
      </p>
    </div>
  );
}
