/**
 * Construction des URL de l'explorateur de graphe — source unique, pure,
 * importable cote serveur comme cote client.
 *
 * ENCODAGE. Les cles HLA contiennent `*` et `:` (« HLA-DQB1*02:01 »).
 * `URLSearchParams` serialise en application/x-www-form-urlencoded : `:` est
 * percent-encode (`%3A`), `*` reste tel quel (caractere sur), et toute la
 * chaine fait l'aller-retour sans perte via `searchParams.get`, cote client
 * comme cote serveur (Next livre `searchParams` deja decode). Une
 * concatenation manuelle (`?center=${hla}`) casserait des qu'une cle porte
 * `&`, `#`, `+` ou `%`. `src/__tests__/graph-url.test.ts` verrouille ces
 * cas.
 */

import { ALL_ORGANS, ORGAN_PARAM, organSlug, withOrgan, type OrganSelection } from "./organ";
import type { SignalLevel } from "./types";

export const GRAPH_DEPTHS = [1, 2, 3] as const;
export type GraphDepth = (typeof GRAPH_DEPTHS)[number];

export interface GraphUrlState {
  center: string;
  depth?: number;
  /** Filtre serveur historique (avant parcours). Optionnel. */
  minSignal?: SignalLevel | "";
  /** Strate d'organe (`?organe=coeur`) ; absente pour « tous les organes ». */
  organ?: OrganSelection;
}

/** `/graph?center=…&depth=…` — chaine relative, prete pour `router.push`. */
export function graphHref({
  center,
  depth,
  minSignal,
  organ = ALL_ORGANS,
}: GraphUrlState): string {
  const params = new URLSearchParams();
  params.set("center", center);
  if (depth !== undefined) params.set("depth", String(clampDepth(depth)));
  if (minSignal) params.set("minSignal", minSignal);
  const slug = organSlug(organ);
  if (slug) params.set(ORGAN_PARAM, slug);
  return `/graph?${params.toString()}`;
}

/** Profondeur bornee a [1, 3] ; une valeur illisible vaut 1. */
export function clampDepth(raw: unknown): GraphDepth {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), 3) as GraphDepth;
}

/** Lien vers la fiche d'un noeud (allele ou complication). */
export function entityHref(
  type: "hla" | "outcome",
  id: string,
  organ: OrganSelection = ALL_ORGANS,
): string {
  const base =
    type === "hla"
      ? `/allele/${encodeURIComponent(id)}`
      : `/complication/${encodeURIComponent(id)}`;
  return withOrgan(base, organ);
}
