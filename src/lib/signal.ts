/**
 * Rendu visuel des niveaux de signal.
 *
 * Ce module est la COUCHE D'AFFICHAGE de `SignalLevel` ; `labels.ts` en porte
 * la semantique (libelle + glose) et le calcul (`computeSignalLevel`). Ici on
 * ne decide rien : on choisit des pastilles, un libelle court et une teinte.
 *
 * TROIS INTERDITS, tenus par `src/__tests__/signal.test.ts` :
 *
 *  1. Aucun vocabulaire causal dans le libelle ("associé", "lié", "risque",
 *     "prédit", "cause"). Un niveau de signal decrit la FORME d'une
 *     co-occurrence dans le texte, pas une relation entre un allele et une
 *     complication chez un patient.
 *  2. Aucun nom ni valeur de metrique (NPMI, FDR, odds ratio, p=...). Le
 *     lecteur voit une force qualitative ; les chiffres restent derriere le
 *     depliant « Détail statistique » de la carte, ou ils sont lisibles avec
 *     leur contexte plutot que brandis comme une conclusion.
 *  3. Cinq niveaux, tous couverts : un niveau manquant produirait un rendu
 *     vide la ou l'utilisateur attend une lecture.
 *
 * `tone` est une classe de TEXTE lisible (contraste AA) ; la couleur de
 * l'echelle elle-meme (remplissages, traits) est dans `theme.ts`
 * (`SIGNAL_COLORS`, `SIGNAL_CLASSES`).
 *
 * `inverse` a sa propre teinte (orange) plutot qu'une place sur l'echelle
 * bleue : ce n'est pas un signal plus faible que `weak`, c'est un signal
 * d'une AUTRE NATURE — une co-occurrence moins frequente qu'attendue. Le
 * confondre visuellement avec le bas de l'echelle le rendrait invisible.
 */

import type { SignalLevel } from "./types";

export interface SignalDisplay {
  dots: string;
  label: string;
  tone: string;
}

/**
 * TYPE DE L'EXPORT. `Record<SignalLevel, SignalDisplay>` serait le type le plus
 * etroit, mais il interdit l'indexation par une `string` : le test du brief
 * boucle sur `Object.keys(...)` et sur une liste litterale de niveaux, ce qui
 * produit des `string`. On declare donc la table comme indexable par `string`
 * ET retournant `SignalDisplay`, tout en gardant les cinq membres obligatoires
 * — un niveau oublie reste une erreur de compilation, et le `satisfies`
 * ci-dessous interdit en plus une cle qui ne serait pas un `SignalLevel`.
 */
export const SIGNAL_DISPLAY: Record<SignalLevel, SignalDisplay> &
  Record<string, SignalDisplay> = {
  inverse: { dots: "◐", label: "Signal inverse", tone: "text-signal-inverse" },
  strong: { dots: "●●●●", label: "Signal fort", tone: "text-signal-strong" },
  clear: { dots: "●●●○", label: "Signal net", tone: "text-signal-clear" },
  moderate: { dots: "●●○○", label: "Signal modéré", tone: "text-fg-muted" },
  weak: { dots: "○○○○", label: "Signal faible", tone: "text-fg-subtle" },
} satisfies Record<SignalLevel, SignalDisplay>;
