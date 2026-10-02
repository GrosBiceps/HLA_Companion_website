"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { formatInt, plural } from "@/lib/format";
import { compactAllele, serotypeKeys } from "@/lib/hla-query";
import { hlaClassColor } from "@/lib/theme";
import {
  ALL_ORGANS,
  organShortLabel,
  withOrgan,
  type OrganSelection,
} from "@/lib/organ";
import type { SerotypeKind } from "@/lib/types";

/**
 * Index navigable des serotypes — Client Component (filtre en direct).
 *
 * Les donnees arrivent toutes construites du serveur : ce composant ne lit pas
 * la base, il filtre. Le filtre comprend DEUX notations : un serotype
 * (« DR15 », « dr 15 », « B27 », « Cw7 ») et un allele (« DRB1*15 », « A*02 »,
 * « dqb1 03 02 ») — taper un allele montre le ou les serotypes qui le portent.
 */

export interface SerotypeCard {
  id: string;
  label: string;
  locus: string;
  kind: SerotypeKind;
  broad: string | null;
  nAlleles: number;
  nArticles: number;
  /** Alleles listes explicitement (sans « HLA- »), pour l'apercu et le filtre. */
  direct: string[];
}

export interface SerotypeLocusSection {
  locus: string;
  title: string;
  hlaClass: "I" | "II";
  cards: SerotypeCard[];
}

function matches(card: SerotypeCard, query: string): boolean {
  const q = query.trim();
  if (q.length === 0) return true;
  const keys = serotypeKeys(q);
  const id = card.id.toUpperCase();
  if (keys.some((k) => id.startsWith(k))) return true;
  const compact = compactAllele(q);
  return (
    compact.length > 0 &&
    card.direct.some((a) => compactAllele(a).startsWith(compact))
  );
}

const KIND_TAG: Partial<Record<SerotypeKind, string>> = {
  broad: "famille large",
  associated: "associé",
  cellular: "DPw",
};

function Card({ card, organ }: { card: SerotypeCard; organ: OrganSelection }) {
  const shown = card.direct.slice(0, 3);
  return (
    <Link
      href={withOrgan(`/serotype/${encodeURIComponent(card.id)}`, organ)}
      className={cn(
        "group flex min-w-0 flex-col gap-1 rounded-xl border bg-surface px-3.5 py-2.5 shadow-xs transition hover:-translate-y-px hover:border-line-strong hover:shadow-raised",
        card.kind === "broad" ? "border-dashed border-line-strong" : "border-line",
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className="font-serif text-xl font-semibold leading-none text-fg group-hover:text-primary">
          {card.label}
        </span>
        {KIND_TAG[card.kind] ? (
          <span className="text-2xs uppercase tracking-wide text-fg-subtle">
            {KIND_TAG[card.kind]}
          </span>
        ) : null}
        <span className="tabular ml-auto text-xs text-fg-subtle">
          {formatInt(card.nArticles)} art.
        </span>
      </span>
      <span className="flex flex-wrap gap-x-2 text-xs text-fg-muted">
        {shown.length > 0 ? (
          shown.map((a) => (
            <span key={a} className="allele">
              {a}
            </span>
          ))
        ) : (
          <span className="text-fg-subtle">union des spécificités fines</span>
        )}
        {card.direct.length > shown.length ? (
          <span className="text-fg-subtle">+{card.direct.length - shown.length}</span>
        ) : null}
      </span>
      <span className="text-2xs text-fg-subtle">
        {plural(card.nAlleles, "allèle")} dans le corpus
      </span>
    </Link>
  );
}

function LocusSection({
  section,
  cards,
  organ,
}: {
  section: SerotypeLocusSection;
  cards: SerotypeCard[];
  organ: OrganSelection;
}) {
  const ids = new Set(cards.map((c) => c.id));
  // Familles larges (dont au moins un membre est visible), puis specificites seules.
  const families = cards.filter((c) => c.kind === "broad");
  const childrenOf = (id: string) => cards.filter((c) => c.broad === id);
  const standalone = cards.filter(
    (c) => c.kind !== "broad" && !(c.broad && ids.has(c.broad)),
  );
  return (
    <section
      id={`locus-${section.locus}`}
      aria-label={section.title}
      className="scroll-mt-40 space-y-3"
    >
      <h2 className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-fg">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-full"
          style={{ background: hlaClassColor(section.hlaClass).css }}
        />
        {section.title}
        <span className="tabular text-sm font-normal text-fg-subtle">
          ({cards.length})
        </span>
      </h2>

      {families.map((fam) => {
        const kids = childrenOf(fam.id);
        return (
          <div
            key={fam.id}
            className="space-y-2 rounded-2xl bg-surface-muted/60 p-3 ring-1 ring-inset ring-line"
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Card card={fam} organ={organ} />
              {kids.map((k) => (
                <Card key={k.id} card={k} organ={organ} />
              ))}
            </div>
          </div>
        );
      })}

      {standalone.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {standalone.map((c) => (
            <Card key={c.id} card={c} organ={organ} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type Sort = "name" | "articles";
type Scope = "all" | "cited";

/**
 * `organ` : strate des effectifs des cartes (« art. » = articles de l'organe).
 * Dans un organe, la portee par defaut est « cites dans l'organe » ; le tri
 * « Articles » classe chaque locus du plus au moins cite DANS la strate.
 * Les liens reportent l'organe.
 */
export function SerotypeBrowser({
  sections,
  organ = ALL_ORGANS,
}: {
  sections: SerotypeLocusSection[];
  organ?: OrganSelection;
}) {
  const [query, setQuery] = useState("");
  const [locus, setLocus] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [scope, setScope] = useState<Scope>(organ === ALL_ORGANS ? "all" : "cited");

  const filtered = useMemo(
    () =>
      sections
        .filter((s) => locus === "all" || s.locus === locus)
        .map((s) => {
          let cards = s.cards.filter(
            (c) => matches(c, query) && (scope === "all" || c.nArticles > 0),
          );
          if (sort === "articles") {
            cards = [...cards].sort((a, b) => b.nArticles - a.nArticles);
          }
          return { section: s, cards };
        })
        .filter((x) => x.cards.length > 0),
    [sections, query, locus, sort, scope],
  );
  const total = sections.reduce((n, s) => n + s.cards.length, 0);
  const shown = filtered.reduce((n, x) => n + x.cards.length, 0);
  const citedTotal = sections.reduce(
    (n, s) => n + s.cards.filter((c) => c.nArticles > 0).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Filtrer les sérotypes</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer : DR15, B27, Cw7, DQ2 ou un allèle (DRB1*15, A*02)…"
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
        <SegmentedControl<string>
          ariaLabel="Locus"
          value={locus}
          onChange={setLocus}
          options={[
            { value: "all", label: "Tous" },
            ...sections.map((s) => ({ value: s.locus, label: s.locus })),
          ]}
        />
        <SegmentedControl<Sort>
          ariaLabel="Tri"
          value={sort}
          onChange={setSort}
          options={[
            { value: "name", label: "Nomenclature" },
            {
              value: "articles",
              label:
                organ === ALL_ORGANS
                  ? "Plus cités"
                  : `Plus cités : ${organShortLabel(organ)}`,
            },
          ]}
        />
        {organ !== ALL_ORGANS ? (
          <SegmentedControl<Scope>
            ariaLabel="Portée"
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "Tous", count: total },
              {
                value: "cited",
                label: `Cités : ${organShortLabel(organ)}`,
                count: citedTotal,
              },
            ]}
          />
        ) : null}
      </div>

      <p className="text-xs text-fg-muted" aria-live="polite">
        {shown === total
          ? `${plural(total, "spécificité")}.`
          : `${formatInt(shown)} sur ${plural(total, "spécificité")} affichées.`}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-muted">
          Aucun sérotype ne correspond à « {query} ».
        </p>
      ) : null}

      {filtered.map(({ section, cards }) => (
        <LocusSection key={section.locus} section={section} cards={cards} organ={organ} />
      ))}
    </div>
  );
}
