import { FlaskConical } from "lucide-react";

/**
 * Bandeau « données synthétiques » — alerte temporaire de prototype.
 *
 * Il est monte par `layout.tsx` DANS le bloc collant de l'en-tete : il reste
 * donc visible au defilement, sur toutes les routes. Teinte d'alerte pleine
 * (`bg-warn`), la seule surface saturee du site : rien d'autre ne doit
 * ressembler a ce bandeau.
 */
export function SyntheticBanner({ version }: { version: string }) {
  return (
    <div
      role="alert"
      className="relative z-50 bg-warn text-warn-fg"
    >
      <p className="mx-auto flex max-w-content items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium leading-snug sm:px-6 sm:text-[0.8125rem] lg:px-8">
        <FlaskConical aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" />
        <span>
          <strong className="font-bold tracking-wide">⚠ DONNÉES SYNTHÉTIQUES</strong>{" "}
          — jeu de démonstration (<span className="font-mono">{version}</span>).
          Les chiffres affichés sont fictifs et ne doivent pas être interprétés.
        </span>
      </p>
    </div>
  );
}
