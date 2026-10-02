/**
 * Concatenation de classes conditionnelles — equivalent minimal de `clsx`,
 * sans dependance. Les valeurs fausses (`false`, `null`, `undefined`, `""`)
 * sont ignorees.
 *
 * Pas de fusion intelligente des conflits Tailwind (`tailwind-merge`) : un
 * composant qui accepte `className` le place EN DERNIER, et l'appelant evite
 * de redefinir une propriete deja posee par la variante.
 */
export type ClassValue = string | false | null | undefined | 0;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
