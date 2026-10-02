/**
 * Organes — vocabulaire et aides d'URL. Importable cote serveur comme cote
 * client (aucune dependance a la base).
 *
 * ⚠ MIROIR de `scripts/labels.py` (ORGANS, ALL_ORGANS) : les deux doivent
 * rester synchronises, `src/__tests__/organ-vocabulary.test.ts` les compare.
 *
 * TROIS NOMS POUR UN ORGANE, A NE PAS CONFONDRE :
 *  - la CLE (`heart`) : stockee en base, jamais affichee ;
 *  - le LIBELLE (`Cœur`) : ce que lit l'utilisateur ;
 *  - le SLUG (`coeur`) : le parametre d'URL `?organe=coeur` (francais, sans
 *    accent), qui rend une vue partageable.
 *
 * LA STRATE `all`. « Tous les organes » n'est pas un organe : c'est la strate
 * calculee sur l'ensemble du corpus (sentinelle `ALL_ORGANS`). Elle n'a pas de
 * slug : son URL est celle SANS parametre `organe`.
 *
 * L'URL EST LA SEULE SOURCE DE VERITE (pas de cookie qui change le rendu d'un
 * lien partage) : toute page serveur lit `?organe=` de ses `searchParams`, et
 * tout lien interne le reporte avec `withOrgan`.
 */

/** Sentinelle de strate : le corpus entier. */
export const ALL_ORGANS = "all" as const;

export type OrganKey =
  | "kidney"
  | "liver"
  | "heart"
  | "lung"
  | "hsct"
  | "pancreas"
  | "intestine";

/** Une strate : « tous les organes » ou un organe. */
export type OrganSelection = typeof ALL_ORGANS | OrganKey;

export interface OrganMeta {
  key: OrganKey;
  /** Libelle complet, accentue. */
  label: string;
  /** Libelle court (puces, en-tete). */
  shortLabel: string;
  /** Parametre d'URL `?organe=`. */
  slug: string;
}

/** Les sept organes, dans l'ordre d'affichage. */
export const ORGANS: readonly OrganMeta[] = [
  { key: "kidney", label: "Rein", shortLabel: "Rein", slug: "rein" },
  { key: "liver", label: "Foie", shortLabel: "Foie", slug: "foie" },
  { key: "heart", label: "Cœur", shortLabel: "Cœur", slug: "coeur" },
  { key: "lung", label: "Poumon", shortLabel: "Poumon", slug: "poumon" },
  {
    key: "hsct",
    label: "Cellules souches hématopoïétiques (GCSH)",
    shortLabel: "GCSH",
    slug: "gcsh",
  },
  {
    key: "pancreas",
    label: "Pancréas (dont pancréas-rein)",
    shortLabel: "Pancréas",
    slug: "pancreas",
  },
  {
    key: "intestine",
    label: "Intestin",
    shortLabel: "Intestin",
    slug: "intestin",
  },
];

export const ORGAN_KEYS: readonly OrganKey[] = ORGANS.map((o) => o.key);

/** Nom du parametre d'URL. */
export const ORGAN_PARAM = "organe";

export const ALL_ORGANS_LABEL = "Tous les organes";
export const ALL_ORGANS_SHORT = "Tous";

const BY_KEY = new Map<string, OrganMeta>(ORGANS.map((o) => [o.key, o]));
const BY_SLUG = new Map<string, OrganMeta>(ORGANS.map((o) => [o.slug, o]));

export function isOrganKey(value: unknown): value is OrganKey {
  return typeof value === "string" && BY_KEY.has(value);
}

export function isOrganSelection(value: unknown): value is OrganSelection {
  return value === ALL_ORGANS || isOrganKey(value);
}

/** Metadonnees d'un organe, ou `null` pour la strate `all`. */
export function organMeta(selection: OrganSelection): OrganMeta | null {
  return selection === ALL_ORGANS ? null : (BY_KEY.get(selection) ?? null);
}

/** Libelle affichable d'une strate (« Tous les organes », « Cœur »…). */
export function organLabel(selection: OrganSelection): string {
  return organMeta(selection)?.label ?? ALL_ORGANS_LABEL;
}

/** Libelle court d'une strate (« Tous », « GCSH »…). */
export function organShortLabel(selection: OrganSelection): string {
  return organMeta(selection)?.shortLabel ?? ALL_ORGANS_SHORT;
}

/** Slug d'URL d'un organe ; `null` pour « tous les organes ». */
export function organSlug(selection: OrganSelection): string | null {
  return organMeta(selection)?.slug ?? null;
}

// --------------------------------------------------------------------------
// Lecture et ecriture du parametre d'URL
// --------------------------------------------------------------------------

/** Minuscules, sans accents, « œ » replie en « oe ». */
export function foldText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Lit la valeur du parametre `organe` : slug (`coeur`), cle (`heart`) ou
 * alias de « tous » (`tous`, `all`). Insensible a la casse et aux accents. Une
 * valeur inconnue, vide ou multiple retombe sur « tous les organes » — jamais
 * une erreur : un lien ancien ne doit pas casser une page.
 */
export function parseOrganParam(
  raw: string | string[] | null | undefined,
): OrganSelection {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return ALL_ORGANS;
  const folded = foldText(value);
  return (BY_SLUG.get(folded) ?? BY_KEY.get(folded))?.key ?? ALL_ORGANS;
}

/** Valeur serialisee du parametre pour une strate (`null` = pas de parametre). */
export function serializeOrgan(selection: OrganSelection): string | null {
  return organSlug(selection);
}

/** Organe d'un objet `searchParams` Next (ou d'un `URLSearchParams`). */
export function organFromSearchParams(
  sp:
    | { get(name: string): string | null }
    | Record<string, string | string[] | undefined>
    | null
    | undefined,
): OrganSelection {
  if (!sp) return ALL_ORGANS;
  // `URLSearchParams`, `ReadonlyURLSearchParams` (Next) : tout ce qui sait `get`.
  if (typeof (sp as { get?: unknown }).get === "function") {
    return parseOrganParam((sp as { get(name: string): string | null }).get(ORGAN_PARAM));
  }
  return parseOrganParam((sp as Record<string, string | string[] | undefined>)[ORGAN_PARAM]);
}

/**
 * Reporte la strate courante sur un lien INTERNE : ajoute `?organe=slug`
 * (ou le remplace), ou le retire pour « tous les organes ». Conserve les
 * autres parametres, leur ordre et l'ancre. Les liens externes, `mailto:`,
 * les ancres seules et les routes d'API sont rendus tels quels.
 *
 * C'est LA fonction a utiliser pour tout lien interne d'une vue qui depend de
 * l'organe : un lien construit a la main perdrait la selection.
 */
export function withOrgan(href: string, organ: OrganSelection): string {
  if (!href || href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;
  if (!href.startsWith("/") || href.startsWith("/api/")) return href;

  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const rawQuery = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);

  // Chaine, pas URLSearchParams : les autres parametres sont conserves OCTET
  // POUR OCTET (ordre et encodage — `HLA-DQB1*02%3A01` reste tel quel).
  const kept = rawQuery
    .split("&")
    .filter((part) => part !== "" && part.split("=")[0] !== ORGAN_PARAM);
  const slug = serializeOrgan(organ);
  if (slug) kept.push(`${ORGAN_PARAM}=${slug}`);

  const query = kept.join("&");
  return `${path}${query ? `?${query}` : ""}${hash}`;
}

/** Retire le parametre `organe` d'un href (inverse de `withOrgan`). */
export function withoutOrgan(href: string): string {
  return withOrgan(href, ALL_ORGANS);
}

// --------------------------------------------------------------------------
// Mot d'organe saisi dans la recherche
// --------------------------------------------------------------------------

/** Mots reconnus comme un organe (formes repliees : minuscules, sans accents). */
const ORGAN_WORDS: Record<string, OrganKey> = {
  rein: "kidney",
  reins: "kidney",
  kidney: "kidney",
  foie: "liver",
  liver: "liver",
  hepatique: "liver",
  coeur: "heart",
  heart: "heart",
  cardiaque: "heart",
  poumon: "lung",
  poumons: "lung",
  lung: "lung",
  pulmonaire: "lung",
  gcsh: "hsct",
  csh: "hsct",
  hsct: "hsct",
  hct: "hsct",
  allogreffe: "hsct",
  pancreas: "pancreas",
  intestin: "intestine",
  intestins: "intestine",
  intestine: "intestine",
};

/**
 * Cherche un mot d'organe dans une saisie de recherche (« DR15 coeur »,
 * « foie », « GCSH GVH ») et le retire : le reste est la vraie requete.
 * Seul le premier mot d'organe est extrait.
 */
export function extractOrganHint(query: string): {
  organ: OrganKey | null;
  rest: string;
} {
  const tokens = (query ?? "").split(/\s+/).filter(Boolean);
  const at = tokens.findIndex((t) => Object.hasOwn(ORGAN_WORDS, foldText(t)));
  if (at === -1) return { organ: null, rest: tokens.join(" ") };
  const organ = ORGAN_WORDS[foldText(tokens[at])];
  const rest = tokens.filter((_, i) => i !== at).join(" ");
  return { organ, rest };
}

// --------------------------------------------------------------------------
// Pages serveur
// --------------------------------------------------------------------------

/** `searchParams` d'une page Next 16 : une promesse, optionnelle ici (tests). */
export type PageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/**
 * Strate d'une page serveur, lue dans ses `searchParams` (`?organe=coeur`).
 * `searchParams` est optionnel : un rendu direct (tests) vaut « tous les
 * organes ».
 */
export async function organFromPage(
  searchParams?: PageSearchParams,
): Promise<OrganSelection> {
  return organFromSearchParams(searchParams ? await searchParams : undefined);
}
