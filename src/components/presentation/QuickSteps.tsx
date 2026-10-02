import { ArrowRight, MousePointerClick, Quote, Search } from "lucide-react";
import { SignalIndicator } from "@/components/SignalIndicator";
import { LinkButton } from "@/components/ui";
import type { SignalLevel } from "@/lib/types";

const STEPS = [
  { icon: Search, title: "Cherchez", text: "un allèle, une complication ou un auteur." },
  {
    icon: MousePointerClick,
    title: "Lisez le niveau de signal",
    text: "et le nombre d'articles, négatifs compris.",
  },
  {
    icon: Quote,
    title: "Ouvrez les phrases sources",
    text: "pour vérifier ce que disent vraiment les articles.",
  },
];

const LEVELS: SignalLevel[] = ["strong", "clear", "moderate", "weak", "inverse"];

/**
 * Bandeau compact « 1 · 2 · 3 » de l'accueil : le geste de lecture en trois
 * lignes, une legende des niveaux sur une ligne, et le bouton vers le guide
 * complet (`/guide`), ou vivent l'exemple, la legende detaillee et la FAQ.
 * Le contenu long n'est PAS reproduit ici.
 */
export function QuickSteps() {
  return (
    <section
      aria-labelledby="demarche-titre"
      className="space-y-5 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-1">
          <p className="eyebrow">Comment ça marche</p>
          <h2
            id="demarche-titre"
            className="font-serif text-xl font-semibold tracking-tight text-fg sm:text-2xl"
          >
            Trois gestes, jusqu&apos;aux phrases sources
          </h2>
        </div>
        <LinkButton href="/guide" variant="primary" size="lg">
          Ouvrir le guide complet
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </LinkButton>
      </div>

      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-xl bg-surface-muted p-3.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-sm font-semibold text-primary-fg">
              {i + 1}
            </span>
            <p className="text-sm leading-snug text-fg-muted">
              <strong className="flex items-center gap-1.5 font-semibold text-fg">
                {title}
                <Icon aria-hidden="true" className="h-3.5 w-3.5 text-fg-subtle" />
              </strong>
              {text}
            </p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <span className="eyebrow">Niveaux de signal</span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {LEVELS.map((level) => (
            <li key={level}>
              <SignalIndicator level={level} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
