/**
 * Formatage francais des effectifs — module pur, importable partout.
 *
 * Les fiches n'affichent que des COMPTES (articles, phrases, annees) : ces
 * aides garantissent un accord singulier/pluriel correct (« 1 article »,
 * « 2 articles ») et un separateur de milliers francais (espace fine
 * insecable), sans dependre de la locale de la machine qui rend la page.
 */

/** Entier au format francais : 3000 -> « 3 000 » (espace fine insecable). */
export function formatInt(n: number): string {
  const sign = n < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(n)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * « n mot(s) » avec accord. `plural` par defaut : `singular + "s"`.
 * En francais, 0 et 1 prennent le singulier (« 0 article »).
 */
export function plural(
  n: number,
  singular: string,
  pluralForm?: string,
): string {
  const word = Math.abs(n) >= 2 ? (pluralForm ?? `${singular}s`) : singular;
  return `${formatInt(n)} ${word}`;
}

/** Periode « 1998–2026 », ou une annee seule, ou null si aucune. */
export function yearSpan(
  first: number | null | undefined,
  last: number | null | undefined,
): string | null {
  if (first == null || last == null) return null;
  return first === last ? `${first}` : `${first}–${last}`;
}

/**
 * Ancre HTML d'une ligne de co-occurrence (`#co-<cle>`), stable et sure : les
 * cles HLA contiennent `*` et `:`, remplaces par `_`. Partagee par le
 * graphique de profil (liens) et les cartes/lignes (cibles).
 */
export function coAnchor(key: string): string {
  return `co-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/**
 * Ancre d'une categorie clinique sur l'index `/complication`
 * (« Fonction du greffon » -> `cat-fonction-du-greffon`).
 */
export function categoryAnchor(category: string): string {
  return `cat-${category
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** Premiere et derniere annee non nulles d'une serie annuelle. */
export function activeYears(
  series: { year: number; n: number }[],
): { first: number; last: number } | null {
  const active = series.filter((p) => p.n > 0);
  if (active.length === 0) return null;
  return { first: active[0].year, last: active[active.length - 1].year };
}
