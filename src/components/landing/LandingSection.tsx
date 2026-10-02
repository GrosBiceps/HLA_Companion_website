import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Section de l'accueil — variante plus aeree de `Section` (`@/components/ui`) :
 * numero d'ordre, titre serif plus grand, chapo. Specifique a la page
 * d'accueil, qui se lit comme un sommaire ; les fiches gardent `Section`.
 */
export function LandingSection({
  id,
  index,
  eyebrow,
  title,
  lead,
  actions,
  className,
  children,
}: {
  id: string;
  index?: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const titleId = `${id}-titre`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("scroll-mt-28 space-y-6", className)}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-3xl space-y-2">
          <p className="eyebrow flex items-center gap-2">
            {index ? (
              <>
                <span className="tabular text-primary">{index}</span>
                <span aria-hidden="true" className="h-px w-6 bg-line-strong" />
              </>
            ) : null}
            {eyebrow}
          </p>
          <h2
            id={titleId}
            className="font-serif text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-[1.75rem]"
          >
            {title}
          </h2>
          {lead ? (
            <p className="max-w-prose text-[0.9375rem] leading-relaxed text-fg-muted">
              {lead}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
