import Link from "next/link";

/**
 * Marque du site. Le pictogramme reprend la grammaire du graphe : un CERCLE
 * (allele HLA) et un CARRE (complication) relies par un trait — une
 * co-occurrence, rien de plus.
 */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--primary))" />
      <path
        d="M11 20.5 L21 11.5"
        stroke="rgb(var(--primary-fg))"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="0.1 3.2"
      />
      <circle cx="10.5" cy="21" r="4.25" fill="rgb(var(--primary-fg))" />
      <rect
        x="17.25"
        y="7.25"
        width="7.5"
        height="7.5"
        rx="1.5"
        fill="rgb(var(--accent))"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 rounded-lg"
      aria-label="Compagnon bibliométrique HLA — accueil"
    >
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap font-serif text-[1.05rem] font-semibold tracking-tight text-fg">
          Compagnon HLA
        </span>
        <span className="mt-1 hidden whitespace-nowrap text-2xs font-medium uppercase tracking-[0.14em] text-fg-subtle sm:block lg:hidden xl:block">
          Bibliométrie · Greffe rénale
        </span>
      </span>
    </Link>
  );
}
