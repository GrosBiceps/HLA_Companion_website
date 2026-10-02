import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { getCorpusVersion } from "@/lib/db";
import { getOrgans } from "@/lib/queries";
import { SyntheticBanner } from "@/components/SyntheticBanner";
import { GlobalFramingReminder } from "@/components/GlobalFramingReminder";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";

/**
 * Typographie (voir docs/DESIGN_SYSTEM.md) :
 *  - Inter          : interface et texte courant (`font-sans`) ;
 *  - Source Serif 4 : titres de page et de section (`font-serif`) — registre
 *                     de la publication scientifique ;
 *  - JetBrains Mono : noms d'alleles, PMID, versions (`font-mono`, `.allele`).
 * Polices auto-hebergees par next/font au build : aucune requete tierce a
 * l'execution.
 */
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1017" },
  ],
};

/**
 * ⚠ La description est le SEUL texte de cadrage qui atteint quelqu'un qui n'a
 * pas vu l'encart epistemique : c'est ce qu'affichent les moteurs de recherche
 * et les apercus de lien. Elle ne peut donc pas employer le vocabulaire que
 * l'encart existe pour refuter — elle dit "co-occurrences dans la
 * litterature", jamais "associations entre alleles et complications".
 */
export const metadata: Metadata = {
  title: "Compagnon bibliométrique HLA",
  description:
    "Exploration des co-occurrences textuelles entre allèles HLA et complications de la transplantation d'organes et de cellules souches (rein, foie, cœur, poumon, GCSH, pancréas, intestin) dans la littérature indexée. Ce ne sont pas des associations cliniques.",
};

/**
 * Layout racine — Server Component. C'est ici que la version du corpus est
 * lue (acces natif SQLite : impossible cote client), puis le bandeau
 * d'avertissement est monte si le jeu de donnees est synthetique.
 *
 * CADRAGE GLOBAL. `GlobalFramingReminder` est monte ICI, et non page par page,
 * parce qu'un cadrage par route est opt-in et echoue en mode ouvert : la
 * premiere route qui oublie de le porter expedie des chiffres sans cadre. Une
 * fiche atteinte par URL directe — /allele/HLA-DQB1*02:01 colle dans la barre
 * d'adresse, sans passer par l'accueil — porte donc le rappel par
 * construction. Les fiches ajoutent leur propre cadrage par-dessus ; celui-ci
 * est la garantie, pas la totalite du propos.
 *
 * ORDRE DES BANDEAUX. Le bandeau « donnees synthetiques » est en premier et
 * colle en haut avec l'en-tete (un seul bloc `sticky`) : c'est une alerte
 * temporaire de prototype, et tant qu'elle tient, elle prime — elle reste
 * visible au defilement. Le rappel de cadrage suit sous l'en-tete, en teinte
 * discrete — il est permanent et ne doit pas crier.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const corpus = getCorpusVersion();
  const organs = getOrgans();

  return (
    <html
      lang="fr"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
        >
          Aller au contenu
        </a>
        <div className="sticky top-0 z-50">
          {corpus.isSynthetic ? (
            <SyntheticBanner version={corpus.version} />
          ) : null}
          <SiteHeader organs={organs} totalArticles={corpus.nArticles} />
        </div>
        <GlobalFramingReminder />
        <main
          id="contenu"
          className="mx-auto w-full max-w-content flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
        >
          {children}
        </main>
        <SiteFooter corpus={corpus} />
      </body>
    </html>
  );
}
