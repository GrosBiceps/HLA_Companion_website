import Link from "next/link";

/**
 * Rappel de cadrage GLOBAL — une ligne, sur toutes les routes.
 *
 * POURQUOI DANS LE LAYOUT ET PAS DANS CHAQUE PAGE. Le cadrage par route est
 * opt-in : il echoue en mode ouvert. Chaque nouvelle route doit penser a le
 * porter, et celle qui oublie expedie des chiffres sans cadre — sans que rien
 * ne le signale. Monte dans `layout.tsx`, le rappel est la par construction,
 * y compris sur un acces direct par URL a /allele/... , qui est precisement le
 * chemin que l'ordre de la page d'accueil ne peut pas garantir.
 *
 * POURQUOI UNE LIGNE ET PAS L'ENCART. `EpistemicNotice` est l'expose complet :
 * ce qu'on mesure, le dementi, le taux d'erreur, les metriques. Le reproduire
 * partout le userait — un pave identique sur chaque page se lit une fois puis
 * devient decor. Ce rappel-ci est subordonne par construction : une ligne,
 * petite, en teinte discrete, sans titre ni cadre epais, et il RENVOIE a
 * l'expose au lieu de le resumer.
 *
 * COHABITATION AVEC L'ENCART SUR L'ACCUEIL. Les deux sont a l'ecran ensemble,
 * et se lisent dans cet ordre : d'abord la ligne (un bandeau de contexte, au
 * meme rang visuel que la version du corpus), puis l'encart (le propos). La
 * ligne ne redit pas les phrases de l'encart — elle pose le vocabulaire
 * (« co-occurrences textuelles », « pas des associations cliniques ») que
 * l'encart developpe ensuite. Elle est en tete de <body>, hors du <main>, donc
 * lue comme un attribut du site et non comme un paragraphe de la page.
 *
 * VOCABULAIRE. Aucun terme causal : la ligne qui refute la lecture causale ne
 * peut pas l'employer. Elle dit ce que sont les chiffres (des co-occurrences
 * dans le texte) et ce qu'ils ne sont pas.
 */
export function GlobalFramingReminder() {
  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <p className="mx-auto max-w-5xl px-4 py-1.5 text-xs text-slate-600">
        Co-occurrences textuelles dans la littérature indexée — pas des
        associations cliniques.{" "}
        <Link
          href="/methodologie"
          className="underline underline-offset-2 hover:text-slate-900"
        >
          En savoir plus
        </Link>
      </p>
    </div>
  );
}
