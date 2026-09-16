import { getCorpusVersion } from "@/lib/db";

/**
 * Page d'accueil provisoire — remplacee par la recherche et les fiches
 * allele dans les taches suivantes. Elle sert ici de point d'entree minimal
 * pour que le scaffolding soit verifiable par `next build`.
 */
export default function HomePage() {
  const corpus = getCorpusVersion();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Compagnon bibliométrique HLA</h1>
      <p className="text-slate-700">
        Corpus <strong>{corpus.version}</strong> (univers {corpus.universe}) —{" "}
        {corpus.nArticles} articles indexés.
      </p>
      <p className="text-sm text-slate-500">
        L&apos;interface d&apos;exploration est en cours de construction.
      </p>
    </div>
  );
}
