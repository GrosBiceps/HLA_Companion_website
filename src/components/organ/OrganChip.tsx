import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  ALL_ORGANS,
  ORGANS,
  organLabel,
  organShortLabel,
  withOrgan,
  type OrganKey,
  type OrganSelection,
} from "@/lib/organ";
import { formatInt } from "@/lib/format";
import { OrganMark } from "./OrganMark";

/**
 * Puce d'organe : forme + couleur + LIBELLE (jamais la couleur seule).
 *
 * Sans `href`, c'est une etiquette ; avec `href`, un lien (cliquer une puce
 * d'organe selectionne cet organe). `selected` marque la strate courante
 * (`aria-current`).
 */
export function OrganChip({
  organ,
  href,
  selected = false,
  count,
  full = false,
  size = "sm",
  className,
}: {
  organ: OrganSelection;
  href?: string;
  selected?: boolean;
  /** Effectif a afficher apres le libelle (articles de la strate). */
  count?: number;
  /** Libelle complet plutot que court. */
  full?: boolean;
  size?: "xs" | "sm";
  className?: string;
}) {
  const label = full ? organLabel(organ) : organShortLabel(organ);
  const classes = cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset transition-colors",
    size === "xs" ? "px-1.5 py-px text-2xs" : "px-2.5 py-1 text-xs",
    selected
      ? "bg-primary-soft text-primary-soft-fg ring-primary/40"
      : "bg-surface text-fg-muted ring-line",
    href && !selected && "hover:bg-surface-muted hover:text-fg hover:ring-line-strong",
    className,
  );
  const body = (
    <>
      <OrganMark organ={organ} />
      <span>{label}</span>
      {count !== undefined ? (
        <span className="tabular font-normal text-fg-subtle">{formatInt(count)}</span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        aria-current={selected ? "true" : undefined}
        title={organLabel(organ)}
        className={classes}
      >
        {body}
      </Link>
    );
  }
  return (
    <span title={organLabel(organ)} className={classes}>
      {body}
    </span>
  );
}

/**
 * Organes d'un article ou d'un auteur : petites puces, l'organe principal en
 * tete. Chaque puce est un lien vers la vue de cet organe si `hrefFor` est
 * fourni.
 */
export function OrganBadges({
  organs,
  hrefFor,
  selected = ALL_ORGANS,
  className,
}: {
  organs: readonly OrganKey[];
  hrefFor?: (organ: OrganKey) => string;
  selected?: OrganSelection;
  className?: string;
}) {
  if (organs.length === 0) return null;
  return (
    <ul aria-label="Organes" className={cn("flex flex-wrap items-center gap-1", className)}>
      {organs.map((organ) => (
        <li key={organ}>
          <OrganChip
            organ={organ}
            size="xs"
            href={hrefFor?.(organ)}
            selected={selected === organ}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Bandeau « Trier par organe » : « Tous » puis un lien par organe, avec les
 * effectifs de la page courante. `baseHref` est la route (et ses autres
 * parametres) ; la strate y est posee par `withOrgan`.
 */
export function OrganStrip({
  baseHref,
  selected,
  counts,
  allCount,
  label = "Trier par organe",
  hint,
  stratum,
  children,
  className,
}: {
  baseHref: string;
  selected: OrganSelection;
  /** Effectif par organe (articles, entites…), dans la cle de l'organe. */
  counts?: Partial<Record<OrganKey, number>>;
  /** Effectif de « tous les organes ». */
  allCount?: number;
  label?: string;
  hint?: string;
  /**
   * Denominateurs de la strate affichee (articles de l'organe / du corpus) :
   * rappeles sous les puces quand un organe est selectionne.
   */
  stratum?: { nArticles?: number; nTotal?: number };
  /** Complement sous les puces (interrupteur, precision) — organe choisi seulement. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("space-y-1.5", className)}>
      <p className="eyebrow">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        <li>
          <OrganChip
            organ={ALL_ORGANS}
            href={withOrgan(baseHref, ALL_ORGANS)}
            selected={selected === ALL_ORGANS}
            count={allCount}
          />
        </li>
        {ORGANS.map((o) => (
          <li key={o.key}>
            <OrganChip
              organ={o.key}
              href={withOrgan(baseHref, o.key)}
              selected={selected === o.key}
              count={counts?.[o.key]}
            />
          </li>
        ))}
      </ul>
      {hint ? <p className="text-2xs text-fg-subtle">{hint}</p> : null}
      {selected !== ALL_ORGANS ? (
        <p
          role="note"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-fg-muted"
        >
          <span className="font-medium text-fg">
            Strate : {organLabel(selected)}
          </span>
          {stratum?.nArticles !== undefined ? (
            <span className="tabular">
              {formatInt(stratum.nArticles)} article{stratum.nArticles > 1 ? "s" : ""}
              {stratum.nTotal !== undefined ? ` sur ${formatInt(stratum.nTotal)}` : ""}
            </span>
          ) : null}
          <span className="text-fg-subtle">
            · statistiques recalculées sur ces seuls articles.
          </span>
          {children}
        </p>
      ) : null}
    </nav>
  );
}
