/**
 * Lecture tolerante d'une saisie de recherche HLA — module PUR (aucun acces
 * base), partage par la recherche serveur et les filtres client.
 *
 * Il accepte toutes les graphies courantes d'un meme objet :
 *
 *   allele   « HLA-DQB1*02:01 », « dqb1 02 01 », « DQB1*0201 », « dqb10201 »,
 *            « A*02 », « a02 », « b27 », « a*2 », « DRB1*15: »
 *   locus    « DRB1 », « drb », « dq »
 *   serotype « DR15 », « DR 15 », « dr-15 », « A2 », « B27 », « Cw7 », « DQ2 »
 *
 * `parseAlleleQuery` ne dit PAS si l'allele existe : il decoupe la saisie en
 * (locus, champ 1, champ 2). La base tranche ensuite. Les graphies ambigues
 * (« A2 » est a la fois le serotype A2 et le groupe A*02) donnent lieu a
 * DEUX lectures, que la recherche presente toutes deux.
 */

/** Loci alleliques reconnus, du plus long au plus court (« drb1 » avant « a »). */
const GENE_LOCI = [
  "DRB1",
  "DRB3",
  "DRB4",
  "DRB5",
  "DQA1",
  "DQB1",
  "DPA1",
  "DPB1",
  "A",
  "B",
  "C",
] as const;

export interface AlleleQuery {
  locus: string;
  /** Premier champ, sur deux chiffres (« 2 » devient « 02 »), ou null. */
  group: string | null;
  /** Second champ saisi, ou null. */
  field: string | null;
  /** Vrai si le second champ est incomplet (« 0 » dans « A*02:0 »). */
  fieldPartial: boolean;
  /** Vrai si la saisie contient `*` ou `:` ou un zero de tete : lecture allelique sure. */
  explicit: boolean;
}

/** Retire le prefixe « HLA », les espaces de tete et la casse. */
function clean(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\p{C}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/^hla[\s_-]*/, "");
}

/**
 * Cle de comparaison d'un serotype : sans espace ni separateur, en majuscules.
 * « dr 15 », « DR-15 », « Dr15 » donnent « DR15 ».
 */
export function normalizeSerotypeKey(raw: string): string {
  return clean(raw).replace(/[\s._*:-]+/g, "").toUpperCase();
}

/**
 * Alias de serotype : « C7 » designe Cw7, « DP4 » designe DPw4 (les
 * specificites C et DP s'ecrivent classiquement avec un « w »).
 */
export function serotypeKeys(raw: string): string[] {
  const key = normalizeSerotypeKey(raw);
  if (!/^[A-Z]{1,3}\d{0,3}$/.test(key)) return [];
  const keys = [key];
  const m = /^(C|DP)(\d+)$/.exec(key);
  if (m) keys.push(`${m[1]}W${m[2]}`);
  return keys;
}

/**
 * Decoupe une saisie en lecture allelique. Retourne null si elle ne ressemble
 * pas a un allele ou a un locus (« rejet », « 12345678 »).
 */
export function parseAlleleQuery(raw: string): AlleleQuery | null {
  const s = clean(raw);
  if (s.length === 0 || s.length > 24) return null;

  // Le locus est le plus long prefixe de GENE_LOCI (« drb1 » avant « a »)
  // dont le reste est vide ou commence par un separateur / un chiffre.
  let locus: string | null = null;
  let rest = "";
  for (const candidate of GENE_LOCI) {
    const lower = candidate.toLowerCase();
    if (!s.startsWith(lower)) continue;
    const tail = s.slice(lower.length);
    // « drb15 » : locus DRB1 puis « 5 » ; « abmr » : jamais un locus.
    if (tail.length > 0 && !/^[\s*:._-]*\d/.test(tail) && !/^[\s*:._-]+$/.test(tail)) {
      continue;
    }
    locus = candidate;
    rest = tail;
    break;
  }
  if (!locus) return null;

  const explicitSep = /[*:]/.test(rest);
  const stripped = rest.replace(/^[\s*:._-]+/, "");
  if (stripped.length === 0) {
    return { locus, group: null, field: null, fieldPartial: false, explicit: explicitSep };
  }

  // Au-dela de deux champs (« 02:01:01:01 »), les champs suivants sont ignores.
  const parts = stripped
    .split(/[\s*:._-]+/)
    .filter((p) => p.length > 0)
    .slice(0, 2);
  if (parts.some((p) => !/^\d+$/.test(p))) return null;

  let first = parts[0];
  let second: string | null = parts[1] ?? null;

  // Chiffres colles : « 0201 » -> 02, 01 ; « 027 » -> 02, 7 ; « 15 » -> 15.
  if (parts.length === 1 && first.length >= 3) {
    if (first.length > 4) return null;
    second = first.slice(2);
    first = first.slice(0, 2);
  }
  if (first.length > 3) return null;

  const group = first.length === 1 ? `0${first}` : first;
  const leadingZero = first.length >= 2 && first.startsWith("0");
  return {
    locus,
    group,
    field: second,
    fieldPartial: second !== null && second.length < 2,
    explicit:
      explicitSep ||
      leadingZero ||
      second !== null ||
      locus.length > 1, // « drb1… », « dqb1… » ne sont jamais des serotypes
  };
}

/**
 * Forme canonique « HLA-<locus>*<groupe>[:<champ>] » d'une saisie complete,
 * ou null si elle est incomplete ou n'est pas un allele.
 */
export function canonicalAlleleKey(raw: string): string | null {
  const q = parseAlleleQuery(raw);
  if (!q || q.group === null || q.fieldPartial) return null;
  return q.field === null
    ? `HLA-${q.locus}*${q.group}`
    : `HLA-${q.locus}*${q.group}:${q.field.padStart(2, "0")}`;
}

/** Libelle compact d'un allele sans prefixe, pour les comparaisons. */
export function compactAllele(hla: string): string {
  return hla
    .toLowerCase()
    .replace(/^hla-/, "")
    .replace(/[\s*:_-]+/g, "");
}
