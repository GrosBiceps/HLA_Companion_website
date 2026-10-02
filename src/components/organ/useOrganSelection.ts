"use client";

import * as navigation from "next/navigation";
import { organFromSearchParams, type OrganSelection } from "@/lib/organ";

/**
 * Strate courante, lue dans l'URL (`?organe=coeur`) cote client.
 *
 * L'URL est la SEULE source de verite (cf. `lib/organ.ts`). Hors contexte
 * Next (rendu isole, tests dont le mock de `next/navigation` n'expose pas
 * `useSearchParams`), on retombe sur « tous les organes » — jamais une erreur.
 *
 * L'acces par l'espace de noms (`navigation.useSearchParams`) est voulu : il
 * permet ce repli sans importer un nom que le mock n'exporte pas.
 */
export function useOrganSelection(): OrganSelection {
  let params: { get(name: string): string | null } | null = null;
  try {
    params = navigation.useSearchParams();
  } catch {
    params = null;
  }
  return organFromSearchParams(params);
}
