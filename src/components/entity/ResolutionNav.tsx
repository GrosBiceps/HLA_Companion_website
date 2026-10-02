import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { AlleleName } from "@/components/ui/AlleleName";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatInt, plural } from "@/lib/format";
import type { AlleleChildSummary } from "@/lib/allele-nav";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";
import type { HlaEntity } from "@/lib/types";

/**
 * Navigation de resolution : du groupe 2-digit a ses alleles 4-digit, et
 * inversement. Server Component, place sous l'en-tete des fiches allele.
 *
 *  - fiche 2-digit : carte « Allèles 4-digit » listant TOUS les enfants, avec
 *    leurs articles (une barre compare les effectifs d'un meme groupe) ;
 *  - fiche 4-digit : lien proeminent vers le groupe parent et pastilles des
 *    allèles freres.
 *
 * Les comptes sont des articles distincts qui mentionnent EXPLICITEMENT chaque
 * forme : un article qui ecrit « DQB1*02 » n'est pas compte sous
 * « DQB1*02:01 », donc les comptes ne s'additionnent pas d'un niveau a l'autre.
 */

/** Nombre de tuiles visibles avant « Voir les N autres ». */
const VISIBLE = 12;

function href(hla: string, organ: OrganSelection): string {
  return withOrgan(`/allele/${encodeURIComponent(hla)}`, organ);
}

function Tile({
  item,
  max,
  organ,
  current = false,
}: {
  item: AlleleChildSummary;
  max: number;
  organ: OrganSelection;
  current?: boolean;
}) {
  const width = Math.max(4, Math.round((item.nArticles / Math.max(1, max)) * 100));
  const inner = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <AlleleName
          hla={item.hla}
          className={cn("text-sm", current ? "font-semibold" : "text-fg")}
        />
        <span className="tabular shrink-0 text-xs text-fg-subtle">
          {formatInt(item.nArticles)} art.
          {item.nMarked > 0 ? (
            <span
              title={`${item.nMarked} co-occurrence${item.nMarked > 1 ? "s" : ""} au-dessus du seuil statistique`}
              className="ml-1.5 text-signal-strong"
            >
              {item.nMarked} ▲
            </span>
          ) : null}
        </span>
      </span>
      <span aria-hidden="true" className="mt-1.5 block h-[3px] rounded-full bg-fg/[0.07]">
        <span
          className="block h-full rounded-full bg-primary/60"
          style={{ width: `${width}%` }}
        />
      </span>
    </>
  );
  if (current) {
    return (
      <span
        aria-current="page"
        className="block rounded-lg bg-primary-soft px-3 py-2 text-primary-soft-fg ring-1 ring-inset ring-primary/20"
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={href(item.hla, organ)}
      title={`${item.hla} — ${plural(item.nArticles, "article")}`}
      className="block rounded-lg bg-surface px-3 py-2 ring-1 ring-inset ring-line transition-colors hover:bg-surface-muted hover:ring-line-strong"
    >
      {inner}
    </Link>
  );
}

function TileGrid({
  items,
  max,
  organ,
  currentHla,
}: {
  items: AlleleChildSummary[];
  max: number;
  organ: OrganSelection;
  currentHla?: string;
}) {
  const head = items.slice(0, VISIBLE);
  const tail = items.slice(VISIBLE);
  const grid =
    "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return (
    <>
      <ul className={grid}>
        {head.map((item) => (
          <li key={item.hla}>
            <Tile item={item} max={max} organ={organ} current={item.hla === currentHla} />
          </li>
        ))}
      </ul>
      {tail.length > 0 ? (
        <details className="group mt-2">
          <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:underline">
            <span className="group-open:hidden">
              Voir les {tail.length} autres allèles
            </span>
            <span className="hidden group-open:inline">Replier</span>
          </summary>
          <ul className={cn(grid, "mt-2")}>
            {tail.map((item) => (
              <li key={item.hla}>
                <Tile item={item} max={max} organ={organ} current={item.hla === currentHla} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

export function ResolutionNav({
  allele,
  parent,
  parentCount,
  children,
  siblings,
  organ = ALL_ORGANS,
}: {
  /** Strate des effectifs ; reportee sur les liens. */
  organ?: OrganSelection;
  allele: HlaEntity;
  parent: HlaEntity | null;
  /** Articles distincts du groupe parent. */
  parentCount: number;
  /** Enfants directs (fiche 2-digit). */
  children: AlleleChildSummary[];
  /** Enfants du parent, l'allele courant compris (fiche 4-digit). */
  siblings: AlleleChildSummary[];
}) {
  if (allele.resolution === "2-digit" && children.length > 0) {
    const max = Math.max(...children.map((c) => c.nArticles));
    return (
      <Card aria-label="Allèles 4-digit du groupe">
        <CardHeader
          eyebrow="Du 2-digit au 4-digit"
          title={`${plural(children.length, "allèle")} 4-digit dans ce groupe`}
          description={`Chaque allèle 4-digit a sa propre fiche, ses propres articles et ses propres co-occurrences. Triés par nombre d'articles.`}
        />
        <div className="mt-4">
          <TileGrid items={children} max={max} organ={organ} />
        </div>
        <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
          Nombres : articles mentionnant explicitement chaque forme. Ils ne
          s&apos;additionnent pas d&apos;un niveau à l&apos;autre.
        </p>
      </Card>
    );
  }

  if (allele.resolution === "4-digit" && parent && parent.resolution === "2-digit") {
    const max = Math.max(1, ...siblings.map((s) => s.nArticles));
    const others = siblings.filter((s) => s.hla !== allele.hla);
    return (
      <Card aria-label="Groupe parent et allèles voisins">
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="eyebrow">Du 4-digit au 2-digit</p>
            <Link
              href={href(parent.hla, organ)}
              className="block rounded-xl bg-surface-muted px-4 py-3 ring-1 ring-inset ring-line transition-colors hover:bg-primary-soft hover:ring-primary/30"
            >
              <span className="flex items-center gap-2 text-xs text-fg-subtle">
                <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                Groupe parent
              </span>
              <AlleleName hla={parent.hla} className="mt-1 block text-base font-semibold text-fg" />
              <span className="mt-0.5 block text-xs text-fg-muted">
                {plural(parentCount, "article")} · {plural(siblings.length, "allèle")} 4-digit
              </span>
            </Link>
          </div>
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">
              {others.length > 0
                ? `Autres allèles de ${parent.hla.replace(/^HLA-/, "")}`
                : "Seul allèle 4-digit de ce groupe dans le corpus"}
            </p>
            {others.length > 0 ? (
              <TileGrid items={siblings} max={max} organ={organ} currentHla={allele.hla} />
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
          Nombres : articles mentionnant explicitement chaque forme. Ils ne
          s&apos;additionnent pas d&apos;un niveau à l&apos;autre.
        </p>
      </Card>
    );
  }

  return null;
}
