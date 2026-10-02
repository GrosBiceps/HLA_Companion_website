import type { Metadata } from "next";
import { ListTree } from "lucide-react";
import { getCorpusVersion } from "@/lib/db";
import { EpistemicNotice } from "@/components/EpistemicNotice";
import { Callout, LinkButton, PageHeader } from "@/components/ui";
import { LandingSection } from "@/components/landing/LandingSection";
import {
  ReadingSteps,
  SignalLegend,
} from "@/components/guide/ReadingGuide";
import { getReadingExample } from "@/components/guide/readingExample";
import { TaskCards } from "@/components/guide/TaskCards";
import {
  CardAnatomy,
  Faq,
  Glossary,
  SearchSyntax,
  Shortcuts,
} from "@/components/guide/GuideBlocks";

/**
 * Guide d'utilisation — « que voulez-vous faire ? ».
 *
 * Page de mode d'emploi, separee de l'accueil (qui reste centre sur la
 * recherche). Le contenu « comment lire le site » (les trois etapes et la
 * legende des niveaux) vit ICI, dans `components/guide/ReadingGuide.tsx`, et
 * nulle part ailleurs : l'accueil n'en garde qu'un resume de trois lignes et
 * un lien.
 *
 * Aucune metrique brute (ni nom ni valeur) : la page renvoie a /methode. Le
 * cadrage epistemique complet (`EpistemicNotice`) clot le guide, et un rappel
 * court l'ouvre.
 */
export const metadata: Metadata = {
  title: "Guide d'utilisation — comment lire le site",
  description:
    "Mode d'emploi du compagnon : que faire selon votre besoin, comment lire " +
    "un niveau de signal, la syntaxe de recherche, la FAQ et le glossaire.",
};

const TOC = [
  { id: "taches", label: "Que voulez-vous faire ?" },
  { id: "lire", label: "Lire une fiche en deux clics" },
  { id: "signaux", label: "Les cinq niveaux de signal" },
  { id: "carte", label: "Lire une carte" },
  { id: "recherche", label: "Chercher efficacement" },
  { id: "faq", label: "Questions fréquentes" },
  { id: "glossaire", label: "Glossaire" },
  { id: "cadrage", label: "Ce que le site ne dit pas" },
];

function TocList({ className }: { className?: string }) {
  return (
    <ol className={className}>
      {TOC.map((t, i) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className="group flex items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
          >
            <span className="tabular w-5 text-2xs text-fg-subtle group-hover:text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            {t.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function GuidePage() {
  const corpus = getCorpusVersion();
  const example = getReadingExample();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Mode d'emploi"
        title="Guide d'utilisation"
        description="Dites ce que vous cherchez : chaque carte ci-dessous vous emmène directement au bon endroit. Le reste de la page explique comment lire ce que vous y trouverez."
        actions={
          <LinkButton href="/#recherche" variant="primary" size="lg">
            Lancer une recherche
          </LinkButton>
        }
      />

      <Callout tone="framing" title="Ce que vous allez lire">
        <p>
          Le site cartographie ce que la littérature{" "}
          <strong>écrit</strong> : des <strong>co-occurrences textuelles</strong>{" "}
          entre allèles HLA et complications de la greffe rénale. Ce ne sont pas
          des associations cliniques ni causales.
        </p>
      </Callout>

      {/* Sommaire mobile : dépliant, sans JavaScript. */}
      <details className="group rounded-xl border border-line bg-surface shadow-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
          <ListTree aria-hidden="true" className="h-4 w-4 text-primary" />
          Sommaire de la page
        </summary>
        <nav aria-label="Sommaire du guide" className="border-t border-line p-2">
          <TocList />
        </nav>
      </details>

      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <nav
            aria-label="Sommaire du guide"
            className="sticky top-36 space-y-2"
          >
            <p className="eyebrow px-2.5">Sur cette page</p>
            <TocList className="space-y-0.5 border-l border-line" />
          </nav>
        </aside>

        <div className="min-w-0 space-y-16 sm:space-y-20">
          <LandingSection
            id="taches"
            index="01"
            eyebrow="Par où commencer"
            title="Que voulez-vous faire ?"
            lead="Choisissez la situation qui vous ressemble : la carte vous conduit à la bonne page, déjà prête à l'emploi."
          >
            <TaskCards />
          </LandingSection>

          <LandingSection
            id="lire"
            index="02"
            eyebrow="Le geste central"
            title="De l'allèle aux phrases sources, en deux clics"
            lead="Chaque chiffre du site est traçable jusqu'aux phrases qui le produisent. C'est le geste de lecture central : un signal ne vaut que ce que valent ses sources."
          >
            <ReadingSteps example={example} />
          </LandingSection>

          <LandingSection
            id="signaux"
            index="03"
            eyebrow="Légende"
            title="Les cinq niveaux de signal"
            lead="Un niveau qualitatif résume l'effectif d'articles et l'écart au hasard. Il n'est jamais un score et ne s'interprète pas seul."
          >
            <SignalLegend example={example} />
          </LandingSection>

          <LandingSection
            id="carte"
            index="04"
            eyebrow="Anatomie"
            title="Lire une carte de complication"
            lead="Sur la fiche d'un allèle, chaque complication co-mentionnée est une carte. Quatre éléments, dans cet ordre de lecture."
          >
            <CardAnatomy />
          </LandingSection>

          <LandingSection
            id="recherche"
            index="05"
            eyebrow="Recherche"
            title="Chercher efficacement"
            lead="Un seul champ pour les allèles, les complications, les articles et les auteurs. Quelques formes qui marchent :"
          >
            <div className="space-y-6">
              <SearchSyntax />
              <Shortcuts />
            </div>
          </LandingSection>

          <LandingSection
            id="faq"
            index="06"
            eyebrow="FAQ"
            title="Questions fréquentes"
          >
            <Faq />
          </LandingSection>

          <LandingSection
            id="glossaire"
            index="07"
            eyebrow="Vocabulaire"
            title="Glossaire"
          >
            <Glossary />
          </LandingSection>

          <LandingSection
            id="cadrage"
            index="08"
            eyebrow="Cadrage épistémique"
            title="Ce que le site ne dit pas"
            lead="À relire avant d'utiliser un chiffre, où que ce soit sur le site."
          >
            <div className="space-y-4">
              <EpistemicNotice corpusVersion={corpus.version} />
              <LinkButton href="/methode" variant="secondary">
                Lire la méthode complète
              </LinkButton>
            </div>
          </LandingSection>
        </div>
      </div>
    </div>
  );
}
