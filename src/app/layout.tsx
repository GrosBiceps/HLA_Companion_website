import type { Metadata } from "next";
import "./globals.css";
import { getCorpusVersion } from "@/lib/db";
import { SyntheticBanner } from "@/components/SyntheticBanner";
import { GlobalFramingReminder } from "@/components/GlobalFramingReminder";

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
    "Exploration des co-occurrences textuelles entre allèles HLA et complications de la transplantation rénale dans la littérature indexée. Ce ne sont pas des associations cliniques.",
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
 * ORDRE DES DEUX BANDEAUX. Le bandeau « donnees synthetiques » est en premier
 * et colle en haut (`sticky`) : c'est une alerte temporaire de prototype, et
 * tant qu'elle tient, elle prime. Le rappel de cadrage suit, en teinte
 * discrete — il est permanent et ne doit pas crier.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const corpus = getCorpusVersion();

  return (
    <html lang="fr">
      <body>
        {corpus.isSynthetic ? <SyntheticBanner version={corpus.version} /> : null}
        <GlobalFramingReminder />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
