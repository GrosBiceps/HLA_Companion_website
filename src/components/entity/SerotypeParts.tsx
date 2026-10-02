import Link from "next/link";
import { AlleleName } from "@/components/ui/AlleleName";
import { cn } from "@/lib/cn";
import { formatInt, plural } from "@/lib/format";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";
import type {
  AlleleSerotype,
  SerotypeKind,
  SerotypeMember,
} from "@/lib/types";

/**
 * Briques d'affichage des serotypes : pastille-lien (fiche allele, index) et
 * liste des alleles d'un serotype (fiche serotype). Server Components.
 *
 * Un serotype est une SPECIFICITE reconnue par des anticorps ; un allele est
 * une sequence. La correspondance entre les deux est une table de reference,
 * pas une mesure du corpus (docs/SEROTYPES.md) : les effectifs affiches ici
 * sont, eux, ceux du corpus.
 */

export const KIND_LABELS: Record<SerotypeKind, string> = {
  specific: "Sérotype",
  broad: "Famille large",
  associated: "Sérotype associé",
  cellular: "Spécificité DPw",
};

export const KIND_HINTS: Record<SerotypeKind, string> = {
  specific: "Spécificité sérologique",
  broad: "Famille large, regroupant des spécificités plus fines",
  associated:
    "Spécificité portée par un autre gène que DRB1 (DRB3, DRB4 ou DRB5)",
  cellular: "Spécificité DP définie par typage cellulaire, historique",
};

export function serotypeHref(serotypeId: string): string {
  return `/serotype/${encodeURIComponent(serotypeId)}`;
}

/** Pastille cliquable vers la fiche d'un serotype. */
export function SerotypeBadge({
  serotypeId,
  kind = "specific",
  partial = false,
  className,
  organ = ALL_ORGANS,
}: {
  /** Strate reportee sur le lien. */
  organ?: OrganSelection;
  serotypeId: string;
  kind?: SerotypeKind;
  /** Vrai si seuls certains alleles du groupe portent ce serotype. */
  partial?: boolean;
  className?: string;
}) {
  const title = partial
    ? `${serotypeId} : porté par certains allèles de ce groupe seulement`
    : `${KIND_LABELS[kind]} ${serotypeId}`;
  return (
    <Link
      href={withOrgan(serotypeHref(serotypeId), organ)}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        partial
          ? "bg-surface text-fg-muted outline outline-1 -outline-offset-1 outline-dashed outline-fg/30 hover:text-fg"
          : kind === "broad"
            ? "bg-surface text-fg-muted ring-1 ring-inset ring-line-strong hover:text-fg"
            : "bg-primary-soft text-primary-soft-fg ring-1 ring-inset ring-primary/20 hover:ring-primary/50",
        className,
      )}
    >
      {partial ? <span aria-hidden="true">≈</span> : null}
      {serotypeId}
    </Link>
  );
}

/** Badges de tous les serotypes d'un allele ; rien si aucun. */
export function SerotypeBadges({
  serotypes,
  className,
  organ = ALL_ORGANS,
}: {
  serotypes: AlleleSerotype[];
  className?: string;
  organ?: OrganSelection;
}) {
  if (serotypes.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {serotypes.map((s) => (
        <li key={s.serotypeId}>
          <SerotypeBadge
            serotypeId={s.serotypeId}
            kind={s.kind}
            partial={s.partial}
            organ={organ}
          />
        </li>
      ))}
    </ul>
  );
}

function href(hla: string, organ: OrganSelection = ALL_ORGANS): string {
  return withOrgan(`/allele/${encodeURIComponent(hla)}`, organ);
}

function Marked({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span
      title={`${n} co-occurrence${n > 1 ? "s" : ""} au-dessus du seuil statistique`}
      className="tabular rounded-full bg-signal-strong/10 px-1.5 text-2xs font-medium text-signal-strong"
    >
      {n} ▲
    </span>
  );
}

interface MemberGroup {
  key: string;
  group: SerotypeMember | null;
  children: SerotypeMember[];
}

/** Range les membres par groupe 2-digit : le groupe (s'il est membre) et ses 4-digit. */
export function groupMembers(members: SerotypeMember[]): MemberGroup[] {
  const groups = new Map<string, MemberGroup>();
  const get = (key: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, group: null, children: [] };
      groups.set(key, g);
    }
    return g;
  };
  for (const m of members) {
    if (m.resolution === "2-digit") get(m.hla).group = m;
    else get(m.parentHla ?? m.hla).children.push(m);
  }
  return [...groups.values()].sort((a, b) =>
    a.key.localeCompare(b.key, "en", { numeric: true }),
  );
}

/**
 * Alleles d'un serotype, groupes 2-digit et alleles 4-digit imbriques, chacun
 * lie a sa fiche, avec son effectif d'articles et le nombre de ses
 * co-occurrences au-dessus du seuil.
 */
export function SerotypeMembers({
  members,
  organ = ALL_ORGANS,
}: {
  members: SerotypeMember[];
  /** Strate des effectifs ; reportee sur les liens. */
  organ?: OrganSelection;
}) {
  const groups = groupMembers(members);
  return (
    <div className="space-y-3">
      {groups.map(({ key, group, children }) => {
        const sorted = [...children].sort((a, b) =>
          a.hla.localeCompare(b.hla, "en", { numeric: true }),
        );
        return (
          <article
            key={key}
            className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs"
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-muted/60 px-4 py-2.5">
              <Link href={href(key, organ)} className="group min-w-0">
                <AlleleName
                  hla={key}
                  className="text-sm font-semibold text-fg group-hover:text-primary group-hover:underline"
                />
              </Link>
              {group ? (
                <>
                  <span className="tabular text-xs text-fg-subtle">
                    {plural(group.nArticles, "article")}
                  </span>
                  <Marked n={group.nMarked} />
                </>
              ) : (
                <span className="text-2xs text-fg-subtle">
                  groupe 2-digit : seuls les allèles listés portent ce
                  sérotype
                </span>
              )}
              <span className="ml-auto tabular text-2xs text-fg-subtle">
                {plural(sorted.length, "allèle")} 4-digit
              </span>
            </header>
            {sorted.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5 px-4 py-3">
                {sorted.map((m) => (
                  <li key={m.hla}>
                    <Link
                      href={href(m.hla, organ)}
                      title={`${m.hla} — ${plural(m.nArticles, "article")}${
                        m.nMarked > 0
                          ? `, ${m.nMarked} co-occurrence${m.nMarked > 1 ? "s" : ""} au-dessus du seuil`
                          : ""
                      }`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-inset transition-colors",
                        m.nMarked > 0
                          ? "bg-primary-soft text-primary-soft-fg ring-primary/15 hover:ring-primary/40"
                          : "bg-surface-muted text-fg-muted ring-line hover:text-fg hover:ring-line-strong",
                      )}
                    >
                      <span className="allele">
                        {m.hla.replace(/^HLA-[A-Z0-9]+\*/, "*")}
                      </span>
                      <span className="tabular text-2xs opacity-70">
                        {formatInt(m.nArticles)}
                      </span>
                      {m.nMarked > 0 ? (
                        <span aria-hidden="true" className="text-2xs">
                          ▲
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
