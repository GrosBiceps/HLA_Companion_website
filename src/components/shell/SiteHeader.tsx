import { SearchCommand } from "@/components/SearchBar";
import { Logo } from "./Logo";
import { MobileNav, NavLinks } from "./NavLinks";

/**
 * En-tete du site — logo, navigation, palette de recherche.
 *
 * Il n'est PAS collant par lui-meme : `layout.tsx` l'enveloppe avec le
 * bandeau « données synthétiques » dans un seul bloc `sticky`, pour que le
 * bandeau reste visible au defilement sans que les deux se chevauchent.
 */
export function SiteHeader() {
  return (
    <header className="relative border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-[var(--header-h)] max-w-content items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />
        <div className="ml-2 hidden lg:block xl:ml-6">
          <NavLinks />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <SearchCommand triggerClassName="w-48 2xl:w-60" />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
