"use client";

import { useState } from "react";
import { Quote } from "lucide-react";
import { SentenceDrawer } from "@/components/SentenceDrawer";
import { SignalIndicator } from "@/components/SignalIndicator";
import { AlleleName } from "@/components/ui/AlleleName";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { coAnchor, plural } from "@/lib/format";
import { ALL_ORGANS, type OrganSelection } from "@/lib/organ";
import type { AssociationRow } from "@/lib/types";

/**
 * Liste compacte des co-occurrences SOUS LE SEUIL statistique.
 *
 * REGLE D10 DE LA SPEC : le non-significatif est GRISE, PAS MASQUE. Une
 * complication de reference avec une centaine d'alleles sous le seuil ne
 * peut pas les rendre en cartes completes sans noyer les lignes marquees ;
 * elles sont donc rendues ici en lignes denses, toujours visibles, grisees,
 * avec leurs mentions negatives et — surtout — le MEME chemin de
 * verification que les cartes : un bouton qui ouvre le tiroir de phrases.
 * Deux clics vers la source, comme partout ailleurs (spec § 3).
 *
 * Aucune metrique ici : ni NPMI, ni FDR, ni OR. Seulement l'effectif, les
 * negations et le niveau qualitatif.
 *
 * `show` choisit l'entite nommee sur chaque ligne : la complication (fiche
 * allele) ou l'allele (fiche complication).
 */
export function CompactAssociationList({
  rows,
  show,
  organ = ALL_ORGANS,
}: {
  rows: AssociationRow[];
  show: "outcome" | "hla";
  /** Strate : reportee sur les liens, et bornant les phrases du tiroir. */
  organ?: OrganSelection;
}) {
  const [open, setOpen] = useState<AssociationRow | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-surface/60">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-xs text-fg-subtle sm:px-4">
          <SignalIndicator level="weak" variant="plain" />
          <span>
            {plural(rows.length, "ligne")} sous le seuil statistique — non
            distinguables du hasard, affichées quand même.
          </span>
        </p>
        <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
          {rows.map((row) => (
            <li
              key={`${row.hla}:${row.outcome}`}
              id={show === "outcome" ? coAnchor(row.outcome) : undefined}
              className="flex min-w-0 scroll-mt-40 items-center gap-2 bg-surface px-3 py-1.5 sm:pl-4"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                {show === "outcome" ? (
                  row.label
                ) : (
                  <AlleleName hla={row.hla} href organ={organ} className="text-sm" />
                )}
              </span>
              <span className="tabular shrink-0 text-xs text-fg-subtle">
                {plural(row.nCooccurrence, "article")}
              </span>
              {row.nNegated > 0 ? (
                <span
                  title={`dont ${row.nNegated} au sens négatif`}
                  className="tabular shrink-0 rounded-full bg-warn-soft px-1.5 py-px text-2xs font-medium text-warn-soft-fg ring-1 ring-inset ring-warn-line"
                >
                  {`${row.nNegated} nég.`}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(row)}
                aria-label={`Voir le${row.nCooccurrence > 1 ? "s" : ""} ${row.nCooccurrence} phrase${row.nCooccurrence > 1 ? "s" : ""}`}
                className={cn(buttonClasses("ghost", "sm"), "shrink-0 px-2")}
              >
                <Quote aria-hidden="true" className="h-3.5 w-3.5" />
                Phrases
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-3 py-1.5 text-2xs text-fg-subtle sm:px-4">
          « nég. » : mentions au sens négatif (la phrase nie la co-occurrence),
          jamais retirées du total.
        </p>
      </div>
      {open ? (
        <SentenceDrawer
          hla={open.hla}
          outcome={open.outcome}
          label={open.label}
          organ={organ}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
