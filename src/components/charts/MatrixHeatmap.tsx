"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { SIGNAL_LABELS } from "@/lib/labels";
import { categoryColor, categoryDisplay, hlaClassColor, SIGNAL_COLORS } from "@/lib/theme";
import { articlesLabel, cellScale, SIGNAL_READING_ORDER } from "@/lib/viz-encoding";
import {
  buildMatrixView,
  MATRIX_SORTS,
  type ClientMatrix,
  type MatrixRowView,
  type MatrixSort,
} from "@/lib/matrix";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SignalIndicator } from "@/components/SignalIndicator";
import { FilterChips } from "./FilterChips";
import { SignalSwatch } from "./SignalSwatch";
import { cn } from "@/lib/cn";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";
import type { SignalLevel } from "@/lib/types";

/**
 * Heatmap allele × complication — Client Component.
 *
 * Les donnees sont lues et nettoyees COTE SERVEUR (`/matrice/page.tsx`,
 * `toClientMatrix` : aucune metrique brute n'arrive ici). Ce composant ne
 * fait que l'interaction : tri, filtre de niveau, infobulle, mise en
 * evidence de la ligne et de la colonne survolees.
 *
 * ENCODAGE.
 *  - couleur de case = NIVEAU DE SIGNAL (qualitatif, `SIGNAL_COLORS`) ;
 *  - taille de case  = EFFECTIF D'ARTICLES (aire ~ effectif) ;
 *  - case vide       = point discret : jamais co-mentionnes ;
 *  - case filtree    = contour pointille : existe, masquee par le lecteur.
 *
 * PERFORMANCE. Le corps du tableau (jusqu'a ~2 000 cases en 4-digit) est
 * memoise : le survol ne re-rend que l'infobulle et une regle CSS de mise en
 * evidence (selecteurs `data-r` / `data-c`), jamais les cases.
 */

const ALL_LEVELS = new Set<SignalLevel>(SIGNAL_READING_ORDER);

interface TipState {
  r: number;
  c: number;
  x: number;
  y: number;
  below: boolean;
}

export function MatrixHeatmap({ matrix }: { matrix: ClientMatrix }) {
  const router = useRouter();
  // Strate de la matrice : reportee sur tous les liens et changements de vue.
  const organ = matrix.organ ?? ALL_ORGANS;
  const [isPending, startTransition] = useTransition();
  const [sort, setSort] = useState<MatrixSort>("locus");
  const [levels, setLevels] = useState<Set<SignalLevel>>(() => new Set(ALL_LEVELS));
  const [hideEmpty, setHideEmpty] = useState(false);
  const [tip, setTip] = useState<TipState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const view = useMemo(
    () => buildMatrixView(matrix, { sort, levels, hideEmptyRows: hideEmpty }),
    [matrix, sort, levels, hideEmpty],
  );

  const flatRows = useMemo(
    () => view.rowGroups.flatMap((g) => g.rows),
    [view],
  );
  const maxMentions = useMemo(
    () => Math.max(1, ...matrix.alleles.map((a) => a.nMentions)),
    [matrix],
  );

  const filtersActive = levels.size < ALL_LEVELS.size;
  const nCols = view.columns.length;

  const toggleLevel = (l: SignalLevel) =>
    setLevels((s) => {
      const next = new Set(s);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  // ── Corps du tableau, memoise ──
  const body = useMemo(() => {
    let r = -1;
    return view.rowGroups.map((group) => (
      <tbody key={group.key}>
        <tr>
          <th
            scope="rowgroup"
            colSpan={nCols + 1}
            className="sticky left-0 z-10 bg-surface-muted px-3 pb-1 pt-3 text-left"
          >
            <span className="sticky left-3 inline-flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
              {group.hlaClass ? (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ background: hlaClassColor(group.hlaClass).css }}
                />
              ) : null}
              {group.label}
              <span className="tabular font-normal normal-case tracking-normal">
                ({group.rows.length})
              </span>
            </span>
          </th>
        </tr>
        {group.rows.map((row) => {
          r += 1;
          return (
            <MatrixRow
              key={row.allele.hla}
              row={row}
              r={r}
              columns={view.columns}
              maxCount={view.maxCount}
              maxMentions={maxMentions}
              organ={organ}
            />
          );
        })}
      </tbody>
    ));
  }, [view, nCols, maxMentions, organ]);

  // ── Infobulle (delegation d'evenements) ──
  const showTipFor = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.("[data-c][data-r]") as
      | HTMLElement
      | null;
    if (!el || !el.dataset.cell) {
      setTip(null);
      return;
    }
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    const rect = el.getBoundingClientRect();
    const below = rect.top < 220;
    setTip((t) =>
      t && t.r === r && t.c === c
        ? t
        : {
            r,
            c,
            x: rect.left + rect.width / 2,
            y: below ? rect.bottom + 8 : rect.top - 8,
            below,
          },
    );
  };

  const tipRow = tip ? flatRows[tip.r] : undefined;
  const tipSlot = tip && tipRow ? tipRow.slots[tip.c] : undefined;
  const tipOutcome = tip ? view.columns[tip.c] : undefined;

  const highlightCss = tip
    ? `.mx th[data-c="${tip.c}"],.mx tr[data-row="${tip.r}"]>th{background-color:color-mix(in srgb,rgb(var(--primary)) 9%,rgb(var(--surface)))}` +
      `.mx td[data-c="${tip.c}"],.mx tr[data-row="${tip.r}"]>td{background-color:rgb(var(--primary)/0.045)}`
    : "";

  return (
    <div className="space-y-4">
      {/* -------- Commandes -------- */}
      <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-2.5">
            <span className="eyebrow">Résolution</span>
            <SegmentedControl
              ariaLabel="Résolution des allèles"
              options={[
                { value: "2-digit" as const, label: "2 chiffres" },
                { value: "4-digit" as const, label: "4 chiffres" },
              ]}
              value={matrix.resolution}
              onChange={(v) =>
                startTransition(() => {
                  router.push(
                    withOrgan(
                      v === "2-digit" ? "/matrice" : "/matrice?resolution=4-digit",
                      organ,
                    ),
                    { scroll: false },
                  );
                })
              }
            />
          </div>
          {matrix.resolution === "4-digit" && (matrix.loci?.length ?? 0) > 1 ? (
            <div className="flex items-center gap-2.5">
              <span className="eyebrow">Locus</span>
              <SegmentedControl
                ariaLabel="Locus affiché"
                options={(matrix.loci ?? []).map((l) => ({
                  value: l.locus,
                  label: l.locus,
                  count: l.n,
                }))}
                value={matrix.locus ?? ""}
                onChange={(v) =>
                  startTransition(() => {
                    router.push(
                      withOrgan(
                        `/matrice?resolution=4-digit&locus=${encodeURIComponent(v)}`,
                        organ,
                      ),
                      { scroll: false },
                    );
                  })
                }
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2.5">
            <span className="eyebrow">Tri</span>
            <SegmentedControl
              ariaLabel="Ordre des lignes"
              options={MATRIX_SORTS}
              value={sort}
              onChange={setSort}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--primary))]"
            />
            Masquer les allèles sans case visible
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
          <span className="eyebrow">Signal</span>
          <FilterChips
            ariaLabel="Filtrer les cases par niveau de signal"
            options={SIGNAL_READING_ORDER.map((level) => ({
              value: level,
              label: SIGNAL_DISPLAY[level].label,
              title: SIGNAL_LABELS[level].description,
              count: view.levelCounts[level],
              swatch: <SignalSwatch level={level} variant="cell" size={12} scale={0.8} />,
            }))}
            selected={levels}
            onToggle={toggleLevel}
          />
        </div>
      </div>

      {filtersActive && (
        <p className="rounded-lg border-l-[3px] border-warn bg-warn-soft px-4 py-2.5 text-sm text-warn-soft-fg">
          Filtre actif : les cases des niveaux décochés sont réduites à un
          contour pointillé. Elles restent présentes dans le corpus.{" "}
          <button
            type="button"
            onClick={() => setLevels(new Set(ALL_LEVELS))}
            className="font-medium underline underline-offset-2"
          >
            Tout réafficher
          </button>
        </p>
      )}

      <p className="tabular text-xs text-fg-subtle" aria-live="polite">
        {view.nRows} allèles
        {matrix.locus ? ` du locus ${matrix.locus}` : ""} × {nCols} complications ·{" "}
        {matrix.cells.length} paires co-mentionnées sur{" "}
        {matrix.alleles.length * nCols} croisements possibles
        {view.nHiddenRows > 0 ? ` · ${view.nHiddenRows} allèles masqués` : ""}
      </p>

      {/* -------- Grille -------- */}
      <div
        ref={scrollRef}
        onScroll={() => setTip(null)}
        className={cn(
          "mx relative isolate max-h-[78vh] overflow-auto overscroll-contain rounded-xl border border-line bg-surface shadow-card transition-opacity",
          isPending && "opacity-60",
        )}
        onPointerOver={(e) => showTipFor(e.target)}
        onPointerLeave={() => setTip(null)}
        onFocusCapture={(e) => showTipFor(e.target)}
        onBlurCapture={() => setTip(null)}
      >
        {highlightCss ? <style>{highlightCss}</style> : null}
        <table className="border-separate border-spacing-0 text-xs [--cell:24px] sm:[--cell:28px] xl:[--cell:31px]">
          <caption className="sr-only">
            Matrice des co-mentions entre allèles HLA ({matrix.resolution === "2-digit" ? "2 chiffres" : "4 chiffres"})
            et complications. Chaque case non vide renvoie à la fiche de
            l&apos;allèle ; son libellé indique le niveau de signal et le
            nombre d&apos;articles.
          </caption>
          <thead>
            <tr>
              <th
                rowSpan={2}
                scope="col"
                className="sticky left-0 top-0 z-[80] min-w-[7rem] border-b border-r border-line bg-surface px-2 pb-2 sm:px-3 text-left align-bottom sm:min-w-[10rem]"
              >
                <span className="eyebrow block">Allèle ↓</span>
                <span className="eyebrow block">Complication →</span>
              </th>
              {view.columnGroups.map((g) => (
                <th
                  key={g.category}
                  colSpan={g.span}
                  scope="colgroup"
                  title={g.label}
                  className="sticky top-0 z-20 h-7 bg-surface px-px pt-1.5 align-top"
                >
                  <span
                    aria-hidden="true"
                    className="block h-1 rounded-full"
                    style={{ background: categoryColor(g.category).css }}
                  />
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-left text-2xs font-semibold leading-tight",
                      g.label.length * 6 > g.span * 24 && "sr-only",
                    )}
                    style={{ color: categoryColor(g.category).css }}
                  >
                    {g.label}
                  </span>
                </th>
              ))}
              <th rowSpan={2} aria-hidden="true" className="sticky top-0 z-20 w-24 border-b border-line bg-surface" />
            </tr>
            <tr>
              {view.columns.map((o, c) => (
                <th
                  key={o.outcome}
                  scope="col"
                  data-c={c}
                  className="sticky top-7 h-[150px] border-b border-line bg-surface p-0 align-bottom"
                  style={{ width: "var(--cell)", minWidth: "var(--cell)", zIndex: 20 + nCols - c }}
                >
                  <div className="relative h-[150px] w-full">
                    <Link
                      href={withOrgan(`/complication/${encodeURIComponent(o.outcome)}`, organ)}
                      title={`${o.label} — ${categoryDisplay(o.category)}`}
                      className="absolute bottom-2 left-1/2 block w-max max-w-[170px] origin-left -rotate-[58deg] truncate whitespace-nowrap text-2xs text-fg-muted hover:text-primary"
                    >
                      {o.label}
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {body}
        </table>
      </div>

      {/* -------- Infobulle -------- */}
      {tip && tipRow && tipOutcome && tipSlot !== undefined && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-max max-w-[17rem] -translate-x-1/2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-raised backdrop-blur"
          style={{
            left: Math.min(Math.max(tip.x, 140), (typeof window !== "undefined" ? window.innerWidth : 1000) - 140),
            top: tip.y,
            transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
          }}
        >
          <p className="allele font-semibold text-fg">{tipRow.allele.hla}</p>
          <p className="text-fg-muted">× {tipOutcome.label}</p>
          <p className="mb-1.5 text-2xs text-fg-subtle">
            {categoryDisplay(tipOutcome.category)}
          </p>
          {tipSlot === null ? (
            <p className="text-fg-subtle">
              Jamais co-mentionnés dans le corpus.
            </p>
          ) : (
            <div className="space-y-1">
              <SignalIndicator level={tipSlot.cell.signalLevel} />
              <p className="text-fg">
                <strong className="tabular">{articlesLabel(tipSlot.cell.nCooccurrence)}</strong>{" "}
                mentionnent les deux termes
              </p>
              {tipSlot.cell.nNegated > 0 && (
                <p className="text-warn-soft-fg">
                  dont {tipSlot.cell.nNegated} mention
                  {tipSlot.cell.nNegated > 1 ? "s" : ""} niée
                  {tipSlot.cell.nNegated > 1 ? "s" : ""}
                </p>
              )}
              {!tipSlot.visible && (
                <p className="text-fg-subtle">Masquée par le filtre de signal.</p>
              )}
              <p className="border-t border-line pt-1 text-2xs text-fg-subtle">
                Cliquer pour ouvrir la fiche de l&apos;allèle
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function MatrixRow({
  row,
  r,
  columns,
  maxCount,
  maxMentions,
  organ,
}: {
  organ: OrganSelection;
  row: MatrixRowView;
  r: number;
  columns: ClientMatrix["outcomes"];
  maxCount: number;
  maxMentions: number;
}) {
  const href = withOrgan(`/allele/${encodeURIComponent(row.allele.hla)}`, organ);
  const bar = Math.max(4, Math.round((row.allele.nMentions / maxMentions) * 100));
  return (
    <tr data-row={r}>
      <th
        scope="row"
        className="sticky left-0 z-10 border-r border-line bg-surface px-2 py-0 text-left font-normal sm:px-3"
      >
        <Link href={href} className="group block py-[3px]" title={`${row.allele.nMentions} mentions dans ${organ === ALL_ORGANS ? "le corpus" : "la strate"}`}>
          <span className="allele block text-[0.75rem] leading-tight text-fg group-hover:text-primary">
            {row.allele.hla}
          </span>
          <span aria-hidden="true" className="mt-0.5 block h-[3px] w-16 rounded-full bg-fg/[0.07]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${bar}%`, background: hlaClassColor(row.allele.hlaClass).css }}
            />
          </span>
        </Link>
      </th>
      {row.slots.map((slot, c) => {
        const outcome = columns[c];
        const base = "border-b border-l border-line/40 p-0";
        const size = { width: "var(--cell)", height: "var(--cell)", minWidth: "var(--cell)" };
        if (slot === null) {
          return (
            <td key={c} data-r={r} data-c={c} data-cell="empty" className={base} style={size}>
              <span className="flex h-full w-full items-center justify-center" aria-hidden="true">
                <span className="h-[3px] w-[3px] rounded-full bg-fg/15" />
              </span>
            </td>
          );
        }
        const { cell, visible } = slot;
        const scale = cellScale(cell.nCooccurrence, maxCount);
        const label = `${row.allele.hla} et ${outcome.label} : ${SIGNAL_DISPLAY[cell.signalLevel].label}, ${articlesLabel(cell.nCooccurrence)}${visible ? "" : " (masquée par le filtre)"}`;
        return (
          <td key={c} data-r={r} data-c={c} data-cell="1" className={base} style={size}>
            <Link
              href={href}
              aria-label={label}
              className="flex h-full w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {visible ? (
                <span
                  className="block rounded-[3px] shadow-[inset_0_0_0_1px_rgb(var(--fg)/0.08)]"
                  style={{
                    width: `${scale * 82}%`,
                    height: `${scale * 82}%`,
                    background: SIGNAL_COLORS[cell.signalLevel].css,
                    opacity: cell.signalLevel === "weak" ? 0.6 : 1,
                  }}
                />
              ) : (
                <span
                  className="block rounded-[3px] border border-dashed border-fg/25"
                  style={{ width: `${scale * 82}%`, height: `${scale * 82}%` }}
                />
              )}
            </Link>
          </td>
        );
      })}
    </tr>
  );
}
