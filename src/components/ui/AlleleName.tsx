import Link from "next/link";
import { cn } from "@/lib/cn";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";

/**
 * Nom d'allele en notation IPD-IMGT (« HLA-DQB1*02:01 »), en chasse fixe.
 *
 * Le prefixe « HLA- » est attenue : l'oeil lit d'abord le locus et les
 * champs, qui portent l'information. Le texte rendu reste EXACTEMENT la cle
 * (`textContent === hla`), pour la recherche dans la page et le copier-coller.
 *
 * Avec `href`, le nom devient un lien vers la fiche (`/allele/<cle encodee>`
 * si `href === true`).
 */
export function AlleleName({
  hla,
  href,
  className,
  organ = ALL_ORGANS,
}: {
  hla: string;
  href?: string | true;
  className?: string;
  /** Strate reportee sur le lien `href === true` (fiche de l'allele). */
  organ?: OrganSelection;
}) {
  const hasPrefix = hla.startsWith("HLA-");
  const body = (
    <>
      {hasPrefix ? <span className="opacity-60">HLA-</span> : null}
      {hasPrefix ? hla.slice(4) : hla}
    </>
  );
  const classes = cn("allele", className);

  if (href) {
    return (
      <Link
        href={
          href === true
            ? withOrgan(`/allele/${encodeURIComponent(hla)}`, organ)
            : href
        }
        className={cn(
          classes,
          "text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary",
        )}
      >
        {body}
      </Link>
    );
  }
  return <span className={classes}>{body}</span>;
}
