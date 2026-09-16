import type { Metadata } from "next";
import "./globals.css";
import { getCorpusVersion } from "@/lib/db";
import { SyntheticBanner } from "@/components/SyntheticBanner";

export const metadata: Metadata = {
  title: "Compagnon bibliométrique HLA",
  description:
    "Exploration des associations entre allèles HLA et complications de la transplantation rénale, dans la littérature indexée.",
};

/**
 * Layout racine — Server Component. C'est ici que la version du corpus est
 * lue (acces natif SQLite : impossible cote client), puis le bandeau
 * d'avertissement est monte si le jeu de donnees est synthetique.
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
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
