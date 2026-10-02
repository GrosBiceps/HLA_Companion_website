import type { ReactNode } from "react";
import { AlertTriangle, BookOpenText, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Composants de retour : encart (Callout), etat vide (EmptyState), squelette
 * de chargement (Skeleton), infobulle CSS (Tooltip).
 */

// ── Callout ────────────────────────────────────────────────────────────────

/**
 * Encart de texte, filet a gauche.
 *
 * `tone` :
 *  - `framing` : cadrage de lecture (« Comment lire cette fiche »). C'est le
 *    ton par defaut des rappels epistemiques de page : encre, sobre, lisible ;
 *  - `info`    : precision neutre ;
 *  - `warn`    : filtre actif, troncature, donnee a manier avec prudence ;
 *  - `danger`  : panne (le corpus n'a pas pu etre consulte).
 *
 * `role` n'est pas pose par defaut : un encart permanent n'est pas une
 * alerte. Passer `role="alert"` pour un etat survenu (erreur, peremption).
 */
export type CalloutTone = "framing" | "info" | "warn" | "danger";

const CALLOUT: Record<
  CalloutTone,
  { box: string; icon: ReactNode; title: string }
> = {
  framing: {
    box: "border-primary/60 bg-primary-soft/60 text-fg",
    icon: <BookOpenText className="h-4 w-4 text-primary" />,
    title: "text-fg",
  },
  info: {
    box: "border-line-strong bg-surface-muted text-fg-muted",
    icon: <Info className="h-4 w-4 text-fg-subtle" />,
    title: "text-fg",
  },
  warn: {
    box: "border-warn bg-warn-soft text-warn-soft-fg",
    icon: <AlertTriangle className="h-4 w-4" />,
    title: "text-warn-soft-fg",
  },
  danger: {
    box: "border-danger bg-danger-soft text-danger-soft-fg",
    icon: <OctagonAlert className="h-4 w-4" />,
    title: "text-danger-soft-fg",
  },
};

export function Callout({
  tone = "info",
  title,
  icon,
  hideIcon = false,
  className,
  children,
  role,
  "aria-label": ariaLabel,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  icon?: ReactNode;
  hideIcon?: boolean;
  className?: string;
  children?: ReactNode;
  role?: string;
  "aria-label"?: string;
}) {
  const t = CALLOUT[tone];
  const Tag = ariaLabel ? "section" : "div";
  return (
    <Tag
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "flex gap-3 rounded-lg border-l-[3px] px-4 py-3 text-sm leading-relaxed",
        t.box,
        className,
      )}
    >
      {hideIcon ? null : (
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {icon ?? t.icon}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        {title ? <p className={cn("font-semibold", t.title)}>{title}</p> : null}
        {children}
      </div>
    </Tag>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────

/**
 * Etat vide. ⚠ Le texte doit dire ce que l'absence SIGNIFIE : « aucune
 * co-mention dans ce corpus » est un etat de la litterature extraite, pas un
 * resultat clinique — et une panne n'est jamais un etat vide (utiliser
 * `Callout tone="danger"`).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-fg-subtle [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </span>
      ) : null}
      <p className="font-medium text-fg">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

/** Bloc de chargement anime. Donner la taille par `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-shimmer rounded-md bg-[length:800px_100%]",
        "bg-[linear-gradient(90deg,rgb(var(--surface-muted))_0%,rgb(var(--surface-sunken))_40%,rgb(var(--surface-muted))_80%)]",
        className,
      )}
    />
  );
}

/** Plusieurs lignes de texte factices, la derniere plus courte. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <span className={cn("block space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </span>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────

/**
 * Infobulle CSS pure (survol + focus clavier), sans JS : utilisable dans un
 * Server Component. Le declencheur doit etre focalisable si l'infobulle
 * porte une information utile au clavier (sinon passer `focusable`).
 *
 * ⚠ Ne jamais y mettre une metrique brute : l'infobulle se lit hors de tout
 * contexte.
 */
export function Tooltip({
  content,
  side = "top",
  focusable = false,
  className,
  children,
}: {
  content: ReactNode;
  side?: "top" | "bottom";
  focusable?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn("group/tt relative inline-flex", className)}
      tabIndex={focusable ? 0 : undefined}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-fg px-2.5 py-1.5 text-xs font-normal normal-case leading-snug tracking-normal text-canvas opacity-0 shadow-raised transition-opacity duration-150",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {content}
      </span>
    </span>
  );
}
