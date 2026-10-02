"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, X } from "lucide-react";

/** Cle de memorisation du refus (par navigateur, jamais cote serveur). */
export const FIRST_VISIT_KEY = "hla-companion:guide-hint-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(FIRST_VISIT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(FIRST_VISIT_KEY, "1");
  } catch {
    /* stockage indisponible : le rappel reviendra a la prochaine visite. */
  }
}

/**
 * « Première visite ? Lire le guide » — rappel refermable de l'accueil.
 *
 * SANS DECALAGE DE MISE EN PAGE NI ECART D'HYDRATATION. Le rendu serveur et
 * le premier rendu client sont identiques (rien) ; le rappel n'apparait
 * qu'apres le montage, une fois le stockage lu. Il est en position FIXE (carte
 * flottante en bas de fenetre), donc il ne pousse aucun contenu.
 *
 * Sans stockage (navigation privee, acces bloque) : le rappel s'affiche et
 * se ferme pour la page courante ; il reviendra a la visite suivante, ce qui
 * est le comportement attendu d'un rappel et non une panne.
 */
export function FirstVisitHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Lecture d'un systeme externe (stockage) apres montage : l'ecart de
    // rendu serveur/client est precisement ce qu'on evite ici.
    setVisible(!readDismissed());
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <aside
      aria-label="Première visite"
      data-testid="first-visit-hint"
      className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md animate-fade-in rounded-2xl border border-primary/25 bg-surface p-4 shadow-overlay sm:left-auto sm:right-6 sm:mx-0 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
        >
          <BookOpenText className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-fg">Première visite ?</p>
          <p className="text-sm leading-snug text-fg-muted">
            Le guide dit quoi faire selon ce que vous cherchez, et comment lire
            un niveau de signal.
          </p>
          <Link
            href="/guide"
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary"
          >
            Lire le guide
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer ce rappel"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-fg/[0.06] hover:text-fg"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
