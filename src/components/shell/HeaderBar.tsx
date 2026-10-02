"use client";

import { SearchCommand } from "@/components/SearchBar";
import { OrganSelector } from "@/components/organ/OrganSelector";
import { useOrganSelection } from "@/components/organ/useOrganSelection";
import type { OrganSelection } from "@/lib/organ";
import type { OrganInfo } from "@/lib/types";
import { Logo } from "./Logo";
import { MobileNav, NavLinks } from "./NavLinks";

export interface HeaderBarProps {
  organs: readonly OrganInfo[];
  totalArticles: number;
}

/**
 * Contenu de l'en-tete, PRESENTATIONNEL : la strate (`organ`) lui est donnee,
 * il ne lit pas l'URL lui-meme. C'est ce qui permet de le rendre aussi comme
 * repli de `Suspense` (cf. `SiteHeader`) sans declencher `useSearchParams`.
 */
export function HeaderContent({
  organ,
  organs,
  totalArticles,
}: HeaderBarProps & { organ: OrganSelection }) {
  return (
    <div className="mx-auto flex h-[var(--header-h)] max-w-[90rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
      <Logo organ={organ} />
      <div className="ml-2 hidden xl:block xl:ml-6">
        <NavLinks organ={organ} />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <OrganSelector organ={organ} organs={organs} totalArticles={totalArticles} />
        <SearchCommand organ={organ} triggerClassName="max-2xl:w-9 max-2xl:justify-center max-2xl:px-0 max-2xl:[&>span]:hidden 2xl:w-48" />
        <MobileNav organ={organ} />
      </div>
    </div>
  );
}

/** Variante qui lit la strate dans l'URL (`?organe=`), cote client. */
export function HeaderWithOrgan(props: HeaderBarProps) {
  const organ = useOrganSelection();
  return <HeaderContent organ={organ} {...props} />;
}
