"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AlleleName } from "@/components/ui/AlleleName";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { formatInt, plural } from "@/lib/format";
import { hlaClassColor } from "@/lib/theme";
import {
  matchesAlleleQuery,
  type AlleleTree,
  type TreeAllele,
  type TreeLocus,
  type TreeTwoDigit,
} from "@/lib/allele-tree";

/**
 * Index navigable des alleles — Client Component (filtre en direct).
 *
 * L'arbre arrive tout construit du serveur (`buildAlleleTree`) : ce
 * composant ne lit pas la base, il filtre. Un 2-digit reste affiche si
 * lui-meme OU l'un de ses 4-digit correspond, pour que le contexte de
 * nomenclature ne disparaisse jamais sous le filtre.
 *
 * Le filtre « au-dessus du seuil » est un choix EXPLICITE du lecteur (il
 * part de « Tous ») ; il dit combien d'entites il retire.
 */

type Scope = "all" | "marked";

function href(hla: string): string {
  return `/allele/${encodeURIComponent(hla)}`;
}

function keepAllele(a: TreeAllele, q: string, scope: Scope): boolean {
  return matchesAlleleQuery(a.hla, q) && (scope === "all" || a.nMarked > 0);
}

function filterLocus(l: TreeLocus, q: string, scope: Scope): TreeLocus | null {
  const alleles: TreeTwoDigit[] = [];
  for (const a of l.alleles) {
    const children = a.children.filter((c) => keepAllele(c, q, scope));
    if (keepAllele(a, q, scope) || children.length > 0) {
      alleles.push({
        ...a,
        // Le parent correspond : on garde tous ses enfants filtres par le
        // seul critere de portee, pour montrer la famille complete.
        children: matchesAlleleQuery(a.hla, q)
          ? a.children.filter((c) => scope === "all" || c.nMarked > 0)
          : children,
      });
    }
  }
  const orphans = l.orphans.filter((o) => keepAllele(o, q, scope));
  if (alleles.length === 0 && orphans.length === 0) return null;
  return { ...l, alleles, orphans };
}

function MarkedHint({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span
      title={`${n} co-occurrence${n > 1 ? "s" : ""} au-dessus du seuil statistique`}
      className="tabular rounded-full bg-signal-strong/10 px-1.5 text-2xs font-medium text-signal-strong"
    >
      {n} ▲
    </span>
  );
}

export function AlleleBrowser({ tree }: { tree: AlleleTree }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");

  const filtered = useMemo(
    () =>
      tree.classes
        .map((c) => ({
          ...c,
          loci: c.loci
            .map((l) => filterLocus(l, query, scope))
            .filter((l): l is TreeLocus => l !== null),
        }))
        .filter((c) => c.loci.length > 0),
    [tree, query, scope],
  );
  const others = tree.others.filter((o) => keepAllele(o, query, scope));

  const count = (t: { loci: TreeLocus[] }[]) =>
    t.reduce(
      (s, c) =>
        s +
        c.loci.reduce(
          (s2, l) =>
            s2 +
            l.orphans.length +
            l.alleles.reduce((s3, a) => s3 + 1 + a.children.length, 0),
          0,
        ),
      0,
    );
  const total = count(tree.classes) + tree.others.length;
  const shown = count(filtered) + others.length;
  // Entites ayant elles-memes au moins une co-occurrence marquee (les
  // 2-digit gardes pour le contexte d'un enfant marque ne comptent pas).
  const markedTotal =
    tree.classes.reduce(
      (s, c) =>
        s +
        c.loci.reduce(
          (s2, l) =>
            s2 +
            l.orphans.filter((o) => o.nMarked > 0).length +
            l.alleles.reduce(
              (s3, a) =>
                s3 +
                (a.nMarked > 0 ? 1 : 0) +
                a.children.filter((ch) => ch.nMarked > 0).length,
              0,
            ),
          0,
        ),
      0,
    ) + tree.others.filter((o) => o.nMarked > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Filtrer les allèles</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer : A*02, DQB1*02:01, DRB1…"
            className="h-10 w-full rounded-lg bg-surface pl-9 pr-9 font-mono text-sm text-fg shadow-xs ring-1 ring-inset ring-line-strong placeholder:font-sans placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer le filtre"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-fg/[0.06] hover:text-fg"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
        <SegmentedControl<Scope>
          ariaLabel="Portée"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "Tous", count: total },
            {
              value: "marked",
              label: "Au-dessus du seuil",
              count: markedTotal,
            },
          ]}
        />
      </div>

      <p className="text-xs text-fg-muted" aria-live="polite">
        {shown === total
          ? `${plural(total, "entité HLA", "entités HLA")}.`
          : `${formatInt(shown)} sur ${plural(total, "entité HLA", "entités HLA")} affichées.`}
        {scope === "marked"
          ? " Filtre actif : seules les entités ayant au moins une co-occurrence au-dessus du seuil sont listées."
          : ""}
      </p>

      {filtered.length === 0 && others.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-muted">
          Aucune entité ne correspond à « {query} ».
        </p>
      ) : null}

      {filtered.map((c) => (
        <section
          key={c.hlaClass}
          id={`classe-${c.hlaClass}`}
          className="scroll-mt-40 space-y-3"
        >
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-fg">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ background: hlaClassColor(c.hlaClass).css }}
            />
            Classe {c.hlaClass}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {c.loci.map((l) => (
              <LocusCard key={l.locus} locus={l} />
            ))}
          </div>
        </section>
      ))}

      {others.length > 0 ? (
        <section id="autres" className="scroll-mt-40 space-y-3">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-fg">
            Autres entités
          </h2>
          <p className="text-sm text-fg-muted">
            Niveaux non alléliques extraits par le pipeline : compte
            d&apos;incompatibilités HLA, mentions d&apos;éplets.
          </p>
          <ul className="flex flex-wrap gap-2">
            {others.map((o) => (
              <li key={o.hla}>
                <Link
                  href={href(o.hla)}
                  className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm shadow-xs ring-1 ring-inset ring-line hover:ring-line-strong"
                >
                  <AlleleName hla={o.hla} className="text-fg" />
                  <span className="tabular text-xs text-fg-subtle">
                    {formatInt(o.nArticles)} art.
                  </span>
                  <MarkedHint n={o.nMarked} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LocusCard({ locus }: { locus: TreeLocus }) {
  const n =
    locus.alleles.reduce((s, a) => s + 1 + a.children.length, 0) +
    locus.orphans.length;
  return (
    <article
      id={`locus-${locus.locus}`}
      className="scroll-mt-40 overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-line bg-surface-muted/60 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: hlaClassColor(locus.hlaClass).css }}
          />
          Locus <span className="allele">{locus.locus}</span>
        </h3>
        <span className="tabular text-2xs text-fg-subtle">
          {plural(n, "allèle")}
        </span>
      </header>
      <ul className="divide-y divide-line/70">
        {locus.alleles.map((a) => (
          <li key={a.hla} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <Link href={href(a.hla)} className="group min-w-0 flex-1">
                <AlleleName
                  hla={a.hla}
                  className="text-sm font-semibold text-fg group-hover:text-primary group-hover:underline"
                />
              </Link>
              <MarkedHint n={a.nMarked} />
              <span className="tabular w-16 shrink-0 text-right text-xs text-fg-subtle">
                {formatInt(a.nArticles)} art.
              </span>
            </div>
            {a.children.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {a.children.map((c) => (
                  <li key={c.hla}>
                    <Link
                      href={href(c.hla)}
                      title={`${c.hla} — ${plural(c.nArticles, "article")}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset transition-colors",
                        c.nMarked > 0
                          ? "bg-primary-soft text-primary-soft-fg ring-primary/15 hover:ring-primary/40"
                          : "bg-surface-muted text-fg-muted ring-line hover:text-fg hover:ring-line-strong",
                      )}
                    >
                      <span className="allele">
                        {c.hla.replace(/^HLA-[A-Z0-9]+\*/, "*")}
                      </span>
                      <span className="tabular text-2xs opacity-70">
                        {c.nArticles}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {locus.orphans.map((o) => (
          <li key={o.hla} className="flex items-center gap-2 px-4 py-2">
            <Link
              href={href(o.hla)}
              className="min-w-0 flex-1 text-sm hover:text-primary"
            >
              <AlleleName hla={o.hla} />
            </Link>
            <span className="tabular text-xs text-fg-subtle">
              {formatInt(o.nArticles)} art.
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
