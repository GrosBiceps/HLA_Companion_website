import Link from "next/link";
import { Layers } from "lucide-react";
import { formatInt } from "@/lib/format";
import {
  ALL_ORGANS,
  organLabel,
  withOrgan,
  type OrganSelection,
} from "@/lib/organ";
import { OrganChip } from "./OrganChip";

/**
 * Rappel de STRATE — « Vue : Cœur · 798 articles ».
 *
 * Quand un organe est selectionne, tous les chiffres de la page sont recalcules
 * sur ses seuls articles, avec SON denominateur. Cette ligne le dit, sous le
 * titre, et propose de revenir a « tous les organes ». Pour « tous les
 * organes » elle ne s'affiche pas (c'est la vue par defaut).
 *
 * `baseHref` : la route courante (avec ses autres parametres), pour le lien de
 * retour a « tous les organes ».
 */
export function OrganScopeNote({
  organ,
  nArticles,
  nTotal,
  baseHref,
  children,
}: {
  organ: OrganSelection;
  /** Articles de la strate. */
  nArticles?: number;
  /** Articles du corpus entier. */
  nTotal?: number;
  baseHref: string;
  children?: React.ReactNode;
}) {
  if (organ === ALL_ORGANS) return null;
  return (
    <div
      role="note"
      aria-label={`Strate affichée : ${organLabel(organ)}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg-muted shadow-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-fg">
        <Layers aria-hidden="true" className="h-4 w-4 text-fg-subtle" />
        Vue par organe
      </span>
      <OrganChip organ={organ} full selected />
      {nArticles !== undefined ? (
        <span className="tabular">
          {formatInt(nArticles)} article{nArticles > 1 ? "s" : ""}
          {nTotal !== undefined ? ` sur ${formatInt(nTotal)}` : ""}
        </span>
      ) : null}
      <span className="text-xs text-fg-subtle">
        Statistiques recalculées sur ces seuls articles.
      </span>
      {children}
      <Link
        href={withOrgan(baseHref, ALL_ORGANS)}
        className="link ml-auto text-xs"
      >
        Tous les organes
      </Link>
    </div>
  );
}
