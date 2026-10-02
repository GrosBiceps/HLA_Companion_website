/**
 * Composants de visualisation reutilisables — voir docs/VISUALISATIONS.md.
 *
 * `Legend`, `SignalSwatch`, `ColorScale` sont des Server Components (aucun
 * etat). `NetworkView` et `FilterChips` sont des Client Components : les
 * importer directement depuis leur fichier dans un composant "use client".
 */
export {
  Legend,
  LegendGroup,
  LegendItem,
  NodeSwatch,
  EdgeSwatch,
} from "./Legend";
export { SignalSwatch, CellSizeScale } from "./SignalSwatch";
export { SignalScale, CategoryScale } from "./ColorScale";
