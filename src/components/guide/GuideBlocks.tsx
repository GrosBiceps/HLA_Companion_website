import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SignalIndicator } from "@/components/SignalIndicator";
import { Badge, CategoryBadge } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Blocs de contenu du guide : syntaxe de recherche, anatomie d'une carte,
 * raccourcis, FAQ, glossaire. Serveur uniquement ; la FAQ repose sur
 * `<details>` (aucun JavaScript).
 *
 * ⚠ Aucune metrique brute ici (ni nom ni valeur) : le guide dit OU les
 * trouver (« Détail statistique ») et renvoie a /methode pour les definir.
 */

// ── Syntaxe de recherche ───────────────────────────────────────────────────

const SYNTAX: { query: string; mono?: boolean; result: string }[] = [
  {
    query: "HLA-DQB1*02:01",
    mono: true,
    result: "Un allèle exact, au format officiel (4 champs).",
  },
  {
    query: "DQB1 02 01",
    mono: true,
    result: "Le même allèle, sans ponctuation : espaces et séparateurs sont tolérés.",
  },
  {
    query: "A*02",
    mono: true,
    result: "Un groupe d'allèles (2 champs) : tous les A*02 et leurs sous-types.",
  },
  {
    query: "rejet humoral",
    result: "Une complication, par son nom clinique, en français courant.",
  },
  {
    query: "un nom d'auteur",
    result: "Un auteur du corpus : sa fiche liste ses articles.",
  },
];

export function SearchSyntax() {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        {SYNTAX.map((s) => (
          <li
            key={s.query}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
          >
            <code
              className={cn(
                "w-fit rounded-md bg-surface-sunken px-2 py-0.5 text-sm text-fg",
                s.mono ? "allele" : "font-sans",
              )}
            >
              {s.query}
            </code>
            <span className="text-sm text-fg-muted">{s.result}</span>
          </li>
        ))}
      </ul>
      <p className="max-w-prose text-sm leading-relaxed text-fg-muted">
        Les résultats se regroupent par type (allèle, complication, article,
        auteur) : lisez l&apos;étiquette à droite avant de valider. La recherche
        propose, elle ne tranche pas : un allèle absent de la liste n&apos;a
        simplement pas été mentionné dans le corpus.
      </p>
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 py-3 text-sm leading-relaxed text-fg-muted">
        <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
          <span>
            Sérotypes (par exemple <span className="allele">DR15</span>)
          </span>
          <Badge size="xs" tone="outline">
            à venir selon disponibilité
          </Badge>
        </p>
        {/* TODO(serotypes): lorsque la route /serotype existe, remplacer ce
            paragraphe par un lien vers /serotype et retirer le badge « à venir ». */}
        <p className="mt-1">
          La recherche par sérotype (ancienne nomenclature sérologique) est en
          cours d&apos;ajout. Tant qu&apos;elle n&apos;est pas disponible, cherchez
          l&apos;allèle correspondant.
        </p>
      </div>
    </div>
  );
}

// ── Raccourcis clavier ─────────────────────────────────────────────────────

export function Shortcuts() {
  const rows: { keys: ReactNode; what: string }[] = [
    {
      keys: <kbd className="kbd">/</kbd>,
      what: "Ouvre la recherche depuis n'importe quelle page.",
    },
    {
      keys: (
        <span className="inline-flex items-center gap-1">
          <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd>
          <span className="px-1 text-fg-subtle">ou</span>
          <kbd className="kbd">⌘</kbd>+<kbd className="kbd">K</kbd>
        </span>
      ),
      what: "Même effet, sous Windows/Linux ou macOS.",
    },
    {
      keys: (
        <span className="inline-flex items-center gap-1">
          <kbd className="kbd">↑</kbd>
          <kbd className="kbd">↓</kbd>
          <kbd className="kbd">Entrée</kbd>
        </span>
      ),
      what: "Parcourir les résultats et ouvrir la fiche choisie.",
    },
    {
      keys: <kbd className="kbd">Échap</kbd>,
      what: "Ferme la palette de recherche ou le tiroir de phrases.",
    },
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:p-5">
      {rows.map((r, i) => (
        <div key={i} className="contents">
          <dt className="flex items-center text-sm">{r.keys}</dt>
          <dd className="text-sm text-fg-muted sm:py-0.5">{r.what}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Anatomie d'une carte ───────────────────────────────────────────────────

function Anno({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-xs font-semibold text-primary-fg"
      >
        {n}
      </span>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="text-sm leading-relaxed text-fg-muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * Une carte de fiche, annotee. La maquette est factice et `aria-hidden` : le
 * texte des annotations porte l'information. Libelles generiques (pas de
 * cle technique, pas de valeur de metrique).
 */
export function CardAnatomy() {
  return (
    <div className="grid gap-6 rounded-xl border border-line bg-surface-muted p-4 sm:p-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
      <div
        aria-hidden="true"
        className="relative space-y-3 self-start rounded-xl border border-line border-l-[3px] border-l-signal-strong bg-surface p-4 shadow-card"
      >
        <p className="font-semibold leading-snug text-fg">Complication (exemple)</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary px-1.5 text-2xs font-semibold text-primary-fg">
            1
          </span>
          <SignalIndicator level="strong" />
          <CategoryBadge category="Rejet" />
        </div>
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <span className="rounded-full bg-primary px-1.5 text-2xs font-semibold text-primary-fg">
            2
          </span>
          <strong className="font-semibold text-fg">24 articles</strong> · dont 3 au
          sens négatif
        </p>
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <span className="rounded-full bg-primary px-1.5 text-2xs font-semibold text-primary-fg">
            3
          </span>
          Voir les 24 phrases
        </p>
        <p className="flex items-center gap-1.5 border-t border-line pt-2 text-xs text-fg-subtle">
          <span className="rounded-full bg-primary px-1.5 text-2xs font-semibold text-primary-fg">
            4
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
          Détail statistique
        </p>
      </div>
      <ol className="space-y-4">
        <Anno n={1} title="Le niveau de signal">
          Un libellé qualitatif (fort, net, modéré, faible, inverse), avec sa
          couleur et son filet à gauche. C&apos;est une forme de co-occurrence,
          pas un verdict.
        </Anno>
        <Anno n={2} title="Les articles, et les négatifs">
          Le nombre d&apos;articles distincts vient en premier. Les mentions au
          sens négatif (« pas de lien observé… ») sont comptées à part et ne sont
          jamais masquées.
        </Anno>
        <Anno n={3} title="Voir les phrases">
          L&apos;action la plus importante : elle ouvre les phrases sources,
          allèle surligné en bleu, complication en ambre, avec leur article.
        </Anno>
        <Anno n={4} title="« Détail statistique »">
          Un dépliant fermé par défaut, pour qui veut les mesures sous-jacentes.
          Il est réservé aux lecteurs avertis : les définitions et les limites
          sont dans la page{" "}
          <Link href="/methode" className="link">
            Méthode
          </Link>
          .
        </Anno>
      </ol>
    </div>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Pourquoi tant de signaux faibles ?",
    a: (
      <>
        Parce que la plupart des paires allèle × complication n&apos;apparaissent
        ensemble que dans une ou deux phrases, ce qui ne se distingue pas du
        hasard à l&apos;échelle du corpus. Elles sont affichées grisées plutôt
        que masquées : voir qu&apos;une paire existe, même faiblement, fait
        partie de la lecture honnête de la littérature.
      </>
    ),
  },
  {
    q: "Qu'est-ce qu'une co-occurrence ?",
    a: (
      <>
        Le fait qu&apos;un allèle et une complication soient mentionnés dans la{" "}
        <strong>même phrase</strong> d&apos;un titre ou d&apos;un résumé. Cela
        décrit ce que les auteurs écrivent côte à côte, pas ce qui se passe chez
        les patients : ce n&apos;est ni une association clinique, ni un effet
        causal.
      </>
    ),
  },
  {
    q: "Les données sont-elles réelles ?",
    a: (
      <>
        Pas encore. Le jeu actuel est <strong>synthétique</strong> : articles,
        auteurs et phrases sont fictifs, générés pour développer l&apos;interface
        (le bandeau en haut de page le rappelle). Il sera remplacé par les
        sorties réelles du pipeline lors de l&apos;import des fichiers CSV du
        corpus ; la procédure est documentée dans le dépôt.
      </>
    ),
  },
  {
    q: "Que signifie « signal inverse » ?",
    a: (
      <>
        Un allèle et une complication sont co-mentionnés <em>moins</em>{" "}
        souvent que le hasard ne le laisserait attendre. C&apos;est un signal
        d&apos;une autre nature (il n&apos;est pas « plus faible » que le
        faible), à vérifier dans les phrases avant toute lecture.
      </>
    ),
  },
  {
    q: "Environ une mention sur cinq est erronée : que faire ?",
    a: (
      <>
        Relire les phrases sources. L&apos;extraction est automatique et se
        trompe ; le chemin « Voir les phrases » est précisément l&apos;outil de
        contrôle. Le taux exact et ses limites sont rappelés dans l&apos;encart
        de cadrage ci-dessous.
      </>
    ),
  },
];

export function Faq() {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {FAQ.map(({ q, a }) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-[0.9375rem] font-medium text-fg hover:bg-surface-muted sm:px-5 [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="px-4 pb-4 text-sm leading-relaxed text-fg-muted sm:px-5">
            {a}
          </div>
        </details>
      ))}
    </div>
  );
}

// ── Glossaire ──────────────────────────────────────────────────────────────

const GLOSSARY: { term: string; def: string }[] = [
  {
    term: "Allèle",
    def: "Variante d'un gène HLA, nommée selon la nomenclature officielle (HLA-DQB1*02:01). Deux champs (A*02) désignent un groupe, quatre un allèle précis.",
  },
  {
    term: "Locus",
    def: "Le gène dont l'allèle est une variante (A, B, C, DRB1, DQB1, DPB1…). Les loci A, B, C forment la classe I ; DR, DQ, DP la classe II.",
  },
  {
    term: "Complication",
    def: "Événement clinique du suivi de greffe rénale repéré dans le texte (rejet, infection, perte du greffon…), regroupé en sept catégories.",
  },
  {
    term: "Co-occurrence",
    def: "Un allèle et une complication mentionnés dans la même phrase d'un titre ou d'un résumé.",
  },
  {
    term: "Corpus",
    def: "L'ensemble des articles PubMed lus, figé à une date et identifié par une version.",
  },
  {
    term: "Négation",
    def: "Mention où la phrase dit l'absence de relation (« pas de différence »). Comptée à part, jamais masquée.",
  },
  {
    term: "Niveau de signal",
    def: "Résumé qualitatif d'une paire (fort, net, modéré, faible, inverse) fondé sur son effectif d'articles et son écart au hasard.",
  },
  {
    term: "PMID",
    def: "Identifiant PubMed d'un article : il permet de retrouver la source en un clic.",
  },
];

export function Glossary() {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {GLOSSARY.map(({ term, def }) => (
        <div
          key={term}
          className="rounded-xl border border-line bg-surface p-4 shadow-xs"
        >
          <dt className="font-serif text-base font-semibold text-fg">{term}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-fg-muted">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
