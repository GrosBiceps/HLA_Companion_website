"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import {
  ALL_ORGANS,
  ALL_ORGANS_LABEL,
  organLabel,
  organShortLabel,
  withOrgan,
  type OrganSelection,
} from "@/lib/organ";
import type { OrganInfo } from "@/lib/types";
import { OrganMark } from "./OrganMark";

/**
 * Selecteur d'organe de l'en-tete — menu deroulant compact.
 *
 * La strate est dans l'URL (`?organe=coeur`) : choisir un organe navigue vers
 * la meme page avec le parametre pose (ou retire pour « tous les organes »),
 * les autres parametres etant conserves. Les liens de navigation, de recherche
 * et des fiches reportent ce parametre : le choix suit l'utilisateur.
 *
 * `/carte-v1` est la carte reelle de l'etude anterieure, propre au REIN : le
 * selecteur y est desactive (il ne change rien a cette page) et le dit.
 *
 * Accessibilite : bouton `aria-haspopup="listbox"`, liste `role="listbox"`,
 * fleches haut/bas, Debut/Fin, Entree, Echap (rend le focus au bouton).
 */
export function OrganSelector({
  organ: selected,
  organs,
  totalArticles,
}: {
  /** Strate courante (lue dans l'URL par l'en-tete). */
  organ: OrganSelection;
  organs: readonly OrganInfo[];
  totalArticles: number;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const fixedKidney = pathname === "/carte-v1" || pathname.startsWith("/carte-v1/");

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  const options: { key: OrganSelection; label: string; n: number }[] = [
    { key: ALL_ORGANS, label: ALL_ORGANS_LABEL, n: totalArticles },
    ...organs.map((o) => ({ key: o.key as OrganSelection, label: o.label, n: o.nArticles })),
  ];

  const choose = useCallback(
    (organ: OrganSelection) => {
      setOpen(false);
      buttonRef.current?.focus();
      if (organ === selected) return;
      // Les autres parametres de l'URL (centre du graphe, resolution…) sont
      // conserves : on les lit au moment du clic.
      router.push(withOrgan(`${pathname}${window.location.search}`, organ));
    },
    [pathname, router, selected],
  );

  // Fermeture : clic ou toucher a l'exterieur, Echap.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A l'ouverture, le focus va a l'option courante.
  useEffect(() => {
    if (!open) return;
    const at = Math.max(0, options.findIndex((o) => o.key === selected));
    optionRefs.current[at]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const refs = optionRefs.current.filter(Boolean) as HTMLButtonElement[];
    const at = refs.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % refs.length;
    else if (e.key === "ArrowUp") next = (at - 1 + refs.length) % refs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = refs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      refs[next].focus();
    }
  };

  const shown: OrganSelection = fixedKidney ? "kidney" : selected;
  const buttonLabel = fixedKidney ? "Rein" : organShortLabel(selected);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !fixedKidney && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-disabled={fixedKidney || undefined}
        aria-label={
          fixedKidney
            ? "Organe : rein (la carte v1 est propre au rein)"
            : `Organe : ${organLabel(selected)}. Changer d'organe`
        }
        title={
          fixedKidney
            ? "La carte v1 est propre au rein : le sélecteur d'organe ne s'y applique pas."
            : "Filtrer le site par organe"
        }
        className={cn(
          "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium ring-1 ring-inset transition-colors",
          fixedKidney
            ? "cursor-not-allowed bg-surface-muted text-fg-subtle ring-line"
            : selected === ALL_ORGANS
              ? "bg-surface text-fg-muted ring-line hover:bg-surface-muted hover:text-fg"
              : "bg-primary-soft text-primary-soft-fg ring-primary/30 hover:ring-primary/50",
        )}
      >
        <OrganMark organ={shown} className="h-3.5 w-3.5" />
        <span className="max-w-[7.5rem] truncate">
          {selected === ALL_ORGANS && !fixedKidney ? (
            <>
              <span className="lg:hidden">Tous</span>
              <span className="hidden lg:inline">{ALL_ORGANS_LABEL}</span>
            </>
          ) : (
            buttonLabel
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-[60] mt-1.5 w-[18.5rem] max-w-[calc(100vw-1.5rem)] animate-pop-in rounded-xl border border-line bg-surface p-1.5 shadow-overlay"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-2xs leading-snug text-fg-subtle">
            Les statistiques sont recalculées sur les articles de l&apos;organe
            choisi.
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="Organe"
            onKeyDown={onListKey}
            className="space-y-px"
          >
            {options.map((o, i) => {
              const active = o.key === selected;
              return (
                <button
                  key={o.key}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(o.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary-soft font-medium text-primary-soft-fg"
                      : "text-fg hover:bg-surface-muted",
                  )}
                >
                  <OrganMark organ={o.key} className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
                  <span className="tabular shrink-0 text-xs text-fg-subtle">
                    {formatInt(o.n)}
                  </span>
                  {active ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
