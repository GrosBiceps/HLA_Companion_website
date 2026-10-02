"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { AlleleName } from "@/components/ui/AlleleName";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { formatInt, plural } from "@/lib/format";
import { hlaClassColor } from "@/lib/theme";
import {
  ALL_ORGANS,
  organLabel,
  organShortLabel,
  withOrgan,
  type OrganSelection,
} from "@/lib/organ";
import {
  matchesAlleleQuery,
  serotypeQueryKeys,
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
 * UN FILTRE, DEUX NOTATIONS. Le filtre comprend un allele (« a*02 »,
 * « dqb1 02 01 ») ET un serotype (« DR15 », « B27 », « Cw7 », « DR2 ») : un
 * serotype reconnu ne montre que les alleles qui le portent, et une bande
 * rappelle le serotype avec un lien vers sa fiche.
 *
 * PERFORMANCE. Avec ~900 alleles 4-digit, les groupes sont REPLIES par defaut :
 * les pastilles 4-digit ne sont rendues qu'a l'ouverture d'un groupe. Un
 * filtre actif deplie les groupes restants s'ils sont peu nombreux.
 *
 * Le filtre « au-dessus du seuil » est un choix EXPLICITE du lecteur (il
 * part de « Tous ») ; il dit combien d'entites il retire.
 */

type Scope = "all" | "cited" | "marked";

export interface BrowserSerotype {
  id: string;
  label: string;
  kind: string;
  nAlleles: number;
}

/** Au-dela de ce nombre de groupes affiches, le filtre ne deplie rien tout seul. */
const AUTO_OPEN_MAX_GROUPS = 40;

function href(hla: string, organ: OrganSelection = ALL_ORGANS): string {
  return withOrgan(`/allele/${encodeURIComponent(hla)}`, organ);
}

/** Portee : « cités » = au moins un article dans la strate ; « marked » = au-dessus du seuil. */
function inScope(a: { nArticles: number; nMarked: number }, scope: Scope): boolean {
  if (scope === "all") return true;
  return scope === "cited" ? a.nArticles > 0 : a.nMarked > 0;
}

type Match = (a: TreeAllele) => boolean;

function keepAllele(a: TreeAllele, match: Match, scope: Scope): boolean {
  return match(a) && inScope(a, scope);
}

function filterLocus(
  l: TreeLocus,
  match: Match,
  scope: Scope,
): TreeLocus | null {
  const alleles: TreeTwoDigit[] = [];
  for (const a of l.alleles) {
    const children = a.children.filter((c) => keepAllele(c, match, scope));
    if (keepAllele(a, match, scope) || children.length > 0) {
      alleles.push({
        ...a,
        // Le parent correspond : on garde tous ses enfants filtres par le
        // seul critere de portee, pour montrer la famille complete.
        children: match(a)
          ? a.children.filter((c) => inScope(c, scope))
          : children,
      });
    }
  }
  const orphans = l.orphans.filter((o) => keepAllele(o, match, scope));
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

export function AlleleBrowser({
  tree,
  serotypes = [],
  organ = ALL_ORGANS,
}: {
  tree: AlleleTree;
  /** Referentiel serologique, pour reconnaitre « DR15 » dans le filtre. */
  serotypes?: BrowserSerotype[];
  /**
   * Strate des effectifs de l'arbre. Dans un organe, la portee par defaut est
   * « cités dans l'organe » (les ~1 000 entites d'un corpus entier n'ont pas
   * toutes un article dans une strate de 200). Les liens reportent l'organe.
   */
  organ?: OrganSelection;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>(organ === ALL_ORGANS ? "all" : "cited");
  // Ouverture manuelle d'un groupe ; absent = valeur par defaut (cf. autoOpen).
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const serotypeById = useMemo(
    () => new Map(serotypes.map((s) => [s.id.toUpperCase(), s])),
    [serotypes],
  );

  // Serotypes designes par la saisie : ils prennent le pas sur la lecture
  // « texte d'allele » (« A2 » est le serotype A2, pas le debut de A*24).
  const known = useMemo(
    () =>
      serotypeQueryKeys(query).flatMap((k) => {
        const s = serotypeById.get(k);
        return s ? [s] : [];
      }),
    [query, serotypeById],
  );

  const match: Match = useMemo(() => {
    if (known.length > 0) {
      const keys = new Set(known.map((s) => s.id.toUpperCase()));
      return (a) =>
        [...(a.serotypes ?? []), ...(a.broadSerotypes ?? [])].some((id) =>
          keys.has(id.toUpperCase()),
        );
    }
    return (a) => matchesAlleleQuery(a.hla, query);
  }, [known, query]);

  const filtered = useMemo(
    () =>
      tree.classes
        .map((c) => ({
          ...c,
          loci: c.loci
            .map((l) => filterLocus(l, match, scope))
            .filter((l): l is TreeLocus => l !== null),
        }))
        .filter((c) => c.loci.length > 0),
    [tree, match, scope],
  );
  const others = tree.others.filter((o) => keepAllele(o, match, scope));

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
  const shownGroups = filtered.reduce(
    (s, c) => s + c.loci.reduce((s2, l) => s2 + l.alleles.length, 0),
    0,
  );
  const autoOpen =
    query.trim().length > 0 && shownGroups <= AUTO_OPEN_MAX_GROUPS;
  const isOpen = (hla: string) => override[hla] ?? autoOpen;

  const setAll = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of filtered)
      for (const l of c.loci)
        for (const a of l.alleles) if (a.children.length > 0) next[a.hla] = open;
    setOverride(next);
  };

  // Entites ayant elles-memes au moins une co-occurrence marquee (les
  // 2-digit gardes pour le contexte d'un enfant marque ne comptent pas).
  const citedTotal = (() => {
    let n = 0;
    for (const c of tree.classes)
      for (const l of c.loci) {
        n += l.orphans.filter((o) => o.nArticles > 0).length;
        for (const a of l.alleles) {
          n += (a.nArticles > 0 ? 1 : 0) + a.children.filter((ch) => ch.nArticles > 0).length;
        }
      }
    return n + tree.others.filter((o) => o.nArticles > 0).length;
  })();
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
            onChange={(e) => {
              setQuery(e.target.value);
              setOverride({});
            }}
            placeholder="Filtrer : A*02, DQB1*02:01, DRB1… ou un sérotype (DR15, B27)"
            className="h-10 w-full rounded-lg bg-surface pl-9 pr-9 font-mono text-sm text-fg shadow-xs ring-1 ring-inset ring-line-strong placeholder:font-sans placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-primary/60"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOverride({});
              }}
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
            ...(organ !== ALL_ORGANS
              ? [
                  {
                    value: "cited" as const,
                    label: `Cités : ${organShortLabel(organ)}`,
                    count: citedTotal,
                  },
                ]
              : []),
            {
              value: "marked",
              label: "Au-dessus du seuil",
              count: markedTotal,
            },
          ]}
        />
      </div>

      {known.length > 0 ? (
        <ul className="space-y-2" aria-label="Sérotype reconnu">
          {known.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-l-[3px] border-primary bg-primary-soft px-4 py-2.5 text-sm text-primary-soft-fg"
            >
              <span>
                <strong>
                  {s.kind === "broad" ? "Famille large" : "Sérotype"} {s.label}
                </strong>{" "}
                : {plural(s.nAlleles, "allèle")} dans le corpus, listés
                ci-dessous.
              </span>
              <Link
                href={withOrgan(`/serotype/${encodeURIComponent(s.id)}`, organ)}
                className="link ml-auto font-medium"
              >
                Fiche du sérotype
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted" aria-live="polite">
          {shown === total
            ? `${plural(total, "entité HLA", "entités HLA")}.`
            : `${formatInt(shown)} sur ${plural(total, "entité HLA", "entités HLA")} affichées.`}
          {scope === "marked"
            ? " Filtre actif : seules les entités ayant au moins une co-occurrence au-dessus du seuil sont listées."
            : ""}
          {scope === "cited"
            ? ` Filtre actif : seules les entités citées dans au moins un article (${organLabel(organ)}) sont listées.`
            : ""}
        </p>
        {shownGroups > 0 ? (
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded-md px-2 py-1 font-medium text-primary hover:bg-primary-soft"
            >
              Tout déplier
            </button>
            <span aria-hidden="true" className="text-fg-faint">
              ·
            </span>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="rounded-md px-2 py-1 font-medium text-primary hover:bg-primary-soft"
            >
              Tout replier
            </button>
          </div>
        ) : null}
      </div>

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
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {c.loci.map((l) => (
              <LocusCard
                key={l.locus}
                locus={l}
                organ={organ}
                isOpen={isOpen}
                onToggle={(hla) =>
                  setOverride((o) => ({ ...o, [hla]: !isOpen(hla) }))
                }
              />
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
                  href={href(o.hla, organ)}
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

function LocusCard({
  locus,
  organ,
  isOpen,
  onToggle,
}: {
  locus: TreeLocus;
  organ: OrganSelection;
  isOpen: (hla: string) => boolean;
  onToggle: (hla: string) => void;
}) {
  const n4 = locus.alleles.reduce((s, a) => s + a.children.length, 0);
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
          {plural(locus.alleles.length, "groupe")} · {plural(n4 + locus.orphans.length, "allèle")} 4-digit
        </span>
      </header>
      <ul className="divide-y divide-line/70">
        {locus.alleles.map((a) => {
          const open = isOpen(a.hla);
          const listId = `kids-${a.hla.replace(/[^A-Za-z0-9]/g, "_")}`;
          return (
            <li key={a.hla} className="px-3 py-1.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={href(a.hla, organ)} className="group min-w-0">
                  <AlleleName
                    hla={a.hla}
                    className="text-sm font-semibold text-fg group-hover:text-primary group-hover:underline"
                  />
                </Link>
                {(a.serotypes ?? []).slice(0, 3).map((s) => (
                  <Link
                    key={s}
                    href={withOrgan(`/serotype/${encodeURIComponent(s)}`, organ)}
                    title={`Sérotype ${s}`}
                    className="rounded-full bg-surface-muted px-1.5 py-px text-2xs font-medium text-fg-muted ring-1 ring-inset ring-line hover:text-primary hover:ring-primary/40"
                  >
                    {s}
                  </Link>
                ))}
                <span className="ml-auto flex items-center gap-2">
                  <MarkedHint n={a.nMarked} />
                  <span className="tabular text-xs text-fg-subtle">
                    {formatInt(a.nArticles)} art.
                  </span>
                  {a.children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onToggle(a.hla)}
                      aria-expanded={open}
                      aria-controls={listId}
                      aria-label={`${open ? "Replier" : "Déplier"} les ${plural(a.children.length, "allèle")} 4-digit de ${a.hla}`}
                      className={cn(
                        "tabular inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-2xs font-medium ring-1 ring-inset transition-colors",
                        open
                          ? "bg-primary-soft text-primary-soft-fg ring-primary/20"
                          : "bg-surface-muted text-fg-muted ring-line hover:text-fg hover:ring-line-strong",
                      )}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "h-3 w-3 transition-transform",
                          open && "rotate-90",
                        )}
                      />
                      {a.children.length}
                    </button>
                  ) : null}
                </span>
              </div>
              {open && a.children.length > 0 ? (
                <ul id={listId} className="mt-1.5 flex flex-wrap gap-1">
                  {a.children.map((c) => (
                    <li key={c.hla}>
                      <Link
                        href={href(c.hla, organ)}
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
          );
        })}
        {locus.orphans.map((o) => (
          <li key={o.hla} className="flex items-center gap-2 px-4 py-2">
            <Link
              href={href(o.hla, organ)}
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
