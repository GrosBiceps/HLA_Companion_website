"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HighlightedSentence } from "@/components/HighlightedSentence";
import type { PairMention } from "@/lib/types";

/**
 * Tiroir de phrases — LA VUE LA PLUS IMPORTANTE DU SITE (spec §5.4).
 *
 * C'est elle qui rend le garde-fou epistemique structurel et non declaratif :
 * tout nombre agrege de la fiche allele se remonte en deux clics jusqu'aux
 * phrases reelles qui l'ont produit. Un site qui affiche « 18 articles » sans
 * ce chemin demande qu'on le croie ; celui-ci se fait verifier.
 *
 * ⚠ Ce composant n'importe NI `db.ts` NI `queries.ts` (module natif
 * `better-sqlite3`) : il passe par le Route Handler `/api/mentions`.
 *
 * LE LIBELLE CLINIQUE EST RECU EN PROP, jamais re-derive ici. La carte appelante
 * le tient deja de la requete (jointure sur `outcomes`), et une seconde source
 * de verite pour le meme libelle finit toujours par diverger. La cle technique
 * (`DSA`, `graft_loss`) ne sert qu'a interroger l'API — elle n'est jamais rendue.
 *
 * LES NEGATIONS NE SONT JAMAIS MASQUEES. L'onglet par defaut est « Toutes » et
 * il montre tout. « Negatives » est un filtre EN PLUS, pas le mecanisme par
 * lequel on cacherait les phrases genantes par defaut.
 */

/** Filtre actif. « toutes » est le defaut, et le reste. */
type Tab = "toutes" | "positives" | "negatives";

/**
 * Mise en garde de la spec sur la polarite, kappa = 0,44. Formulation EXACTE :
 * elle dit « accord modere », pas « fiable ». Elle est rendue sur CHAQUE
 * mention negative, pas une fois en tete du tiroir : une mise en garde globale
 * se lit une fois puis s'oublie, alors qu'elle doit accompagner chaque phrase
 * dont la negation pourrait avoir ete mal detectee.
 */
const POLARITY_CAVEAT = "Détection automatique — accord modéré, à vérifier";

function pubmedHref(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
}

/**
 * Fiche article interne. La route `/article/[pmid]` est construite a la tache 8
 * du plan ; on pose le lien des maintenant avec le motif definitif, comme le
 * fait deja `SearchBar.hrefFor`. Un lien vers une route planifiee n'est pas un
 * lien mort : c'est le meme href qui fonctionnera sans retouche.
 */
function articleHref(pmid: string): string {
  return `/article/${encodeURIComponent(pmid)}`;
}

/** Badge de polarite — deux styles nettement distincts, pas deux nuances. */
function PolarityBadge({ polarity }: { polarity: PairMention["polarity"] }) {
  const negated = polarity === "negated";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs
                  font-semibold uppercase tracking-wide ${
                    negated
                      ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                      : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300"
                  }`}
    >
      {negated ? "⚠ NÉGATIVE" : "✓ POSITIVE"}
    </span>
  );
}

function MentionCard({ mention }: { mention: PairMention }) {
  return (
    <li className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PolarityBadge polarity={mention.polarity} />
        <span className="text-sm font-medium text-slate-600">
          {mention.year}
        </span>
      </div>

      <blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-sm
                             text-slate-900">
        «{" "}
        <HighlightedSentence
          sentence={mention.sentence}
          hlaSpan={mention.hlaSpan}
          outcomeSpan={mention.outcomeSpan}
        />{" "}
        »
      </blockquote>

      {mention.polarity === "negated" ? (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3
                        py-2 text-xs text-amber-900">
          {mention.negationTrigger ? (
            <p>
              ⓘ Négation détectée : «&nbsp;{mention.negationTrigger}&nbsp;»
            </p>
          ) : (
            <p>ⓘ Négation détectée par le pipeline.</p>
          )}
          <p className="mt-0.5">{POLARITY_CAVEAT}</p>
        </div>
      ) : null}

      {/* Reference bibliographique : ce que le type PairMention porte
          reellement (titre, revue, annee, citations) — pas d'auteurs dans le
          schema, le titre tient donc lieu d'identification de l'article. */}
      <div className="mt-3 border-t border-slate-200 pt-2 text-xs
                      text-slate-700">
        <p className="font-medium text-slate-900">{mention.title}</p>
        <p className="mt-0.5">
          {mention.journal ? `${mention.journal}, ` : ""}
          {mention.year}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono">PMID {mention.pmid}</span>
          {mention.citedBy !== null ? (
            <span>
              cité {mention.citedBy} fois
            </span>
          ) : null}
          <a
            href={pubmedHref(mention.pmid)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2
                       hover:text-slate-900"
          >
            PubMed ↗
          </a>
          <Link
            href={articleHref(mention.pmid)}
            className="font-medium underline underline-offset-2
                       hover:text-slate-900"
          >
            Fiche article
          </Link>
        </div>
      </div>
    </li>
  );
}

export function SentenceDrawer({
  hla,
  outcome,
  label,
  onClose,
}: {
  hla: string;
  /** Cle technique : sert a interroger l'API, n'est JAMAIS affichee. */
  outcome: string;
  /** Libelle clinique, deja resolu par l'appelant. */
  label: string;
  onClose: () => void;
}) {
  const [mentions, setMentions] = useState<PairMention[] | null>(null);
  /**
   * Etat d'erreur DISTINCT de la liste vide, comme dans SearchBar : « aucune
   * phrase » est une affirmation sur le corpus, « echec de chargement » un
   * aveu de panne. Les confondre ferait mentir le site.
   */
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("toutes");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ hla, outcome });

    fetch(`/api/mentions?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { mentions?: PairMention[] }) => {
        if (cancelled) return;
        setMentions(Array.isArray(data.mentions) ? data.mentions : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hla, outcome]);

  /** Echap ferme le tiroir : un panneau modal doit se quitter au clavier. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const all = mentions ?? [];
  // Tri par annee decroissante. `getPairMentions` trie deja ainsi cote SQL ;
  // on le refait ici pour que l'ordre affiche ne depende pas d'un detail de la
  // requete, et reste stable a effectif egal (pair_mention_id en second).
  const sorted = [...all].sort(
    (a, b) => b.year - a.year || a.pairMentionId - b.pairMentionId,
  );
  const nPositive = sorted.filter((m) => m.polarity === "positive").length;
  const nNegated = sorted.filter((m) => m.polarity === "negated").length;

  const visible =
    tab === "positives"
      ? sorted.filter((m) => m.polarity === "positive")
      : tab === "negatives"
        ? sorted.filter((m) => m.polarity === "negated")
        : sorted;

  const tabs: { key: Tab; text: string }[] = [
    { key: "toutes", text: `Toutes ${sorted.length}` },
    { key: "positives", text: `Positives ${nPositive}` },
    { key: "negatives", text: `Négatives ${nNegated}` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Phrases sources : ${hla} × ${label}`}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto
                   bg-slate-50 shadow-xl"
      >
        <header className="sticky top-0 z-10 border-b border-slate-300
                           bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            {/* Libelle clinique recu en prop — la cle technique n'apparait pas. */}
            <h2 className="text-base font-semibold text-slate-900">
              {hla} × {label}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Fermer le tiroir"
              className="rounded border border-slate-300 px-2 py-0.5 text-sm
                         text-slate-700 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>

          <p className="mt-1 text-sm text-slate-700">
            {mentions === null
              ? failed
                ? "Chargement impossible."
                : "Chargement…"
              : `${sorted.length} mention${sorted.length > 1 ? "s" : ""} · ` +
                `${nPositive} positive${nPositive > 1 ? "s" : ""} · ` +
                `${nNegated} négative${nNegated > 1 ? "s" : ""}`}
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between
                          gap-2">
            <div className="flex flex-wrap gap-1" role="group"
                 aria-label="Filtrer par polarité">
              {tabs.map(({ key, text }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    tab === key
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 " +
                        "hover:bg-slate-100"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-600">
              Tri : année décroissante
            </span>
          </div>
        </header>

        <div className="flex-1 px-4 py-3">
          {failed ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3
                          text-sm text-red-900">
              Les phrases sources n&apos;ont pas pu être chargées. Ce
              n&apos;est pas un résultat sur le corpus : c&apos;est une panne
              d&apos;accès. Réessayez.
            </p>
          ) : mentions === null ? (
            <p className="text-sm text-slate-600">Chargement des phrases…</p>
          ) : visible.length === 0 ? (
            <p className="rounded-md border border-slate-300 bg-white px-4 py-3
                          text-sm text-slate-700">
              Aucune phrase dans cette sélection.
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((mention) => (
                <MentionCard key={mention.pairMentionId} mention={mention} />
              ))}
            </ul>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-slate-300 bg-white
                           px-4 py-3 text-center">
          {/*
            Signalement : en prototype local, la spec prevoit une ecriture dans
            un fichier JSON. Aucun point d'ecriture n'existe encore (la base est
            ouverte en lecture seule et aucune route d'ecriture n'est au plan) ;
            le bouton est donc explicitement inerte, avec un titre qui le dit,
            plutot qu'un bouton d'apparence active qui avalerait le signalement.
            Meme choix que la tache 6 pour le lien « voir les phrases ».
          */}
          <button
            type="button"
            disabled
            title="Le signalement d'erreur n'est pas encore relié : prévu pour
                   une prochaine version"
            className="text-xs font-medium text-slate-500
                       cursor-not-allowed"
          >
            ⚠ Extraction automatique — signaler une erreur
          </button>
        </footer>
      </section>
    </div>
  );
}
