/**
 * Primitives d'interface du Compagnon HLA — voir docs/DESIGN_SYSTEM.md.
 *
 * Toutes sont des Server Components, sauf `SegmentedControl` ("use client").
 */
export { Card, CardHeader, cardClasses } from "./Card";
export { Badge, CategoryBadge, HlaClassBadge, type BadgeTone } from "./Badge";
export {
  Button,
  LinkButton,
  buttonClasses,
  type ButtonVariant,
  type ButtonSize,
} from "./Button";
export { PageHeader, Section, Container } from "./Section";
export { StatTile } from "./StatTile";
export {
  Callout,
  EmptyState,
  Skeleton,
  SkeletonText,
  Tooltip,
  type CalloutTone,
} from "./Feedback";
export { SegmentedControl, type SegmentOption } from "./SegmentedControl";
export { AlleleName } from "./AlleleName";
