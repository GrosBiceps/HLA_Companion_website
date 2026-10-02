"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { HighlightedSentence } from "@/components/HighlightedSentence";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonText } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import {
  ALL_ORGANS,
  ORGAN_PARAM,
  organSlug,
  withOrgan,
  type OrganSelection,
} from "@/lib/organ";
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
function articleHref(pmid: string, organ: OrganSelection): string {
  return withOrgan(`/article/${encodeURIComponent(pmid)}`, organ);
}

/** Badge de polarite — deux styles nettement distincts, pas deux nuances. */
function PolarityBadge({ polarity }: { polarity: PairMention["polarity"] }) {
  const negated = polarity === "negated";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold tracking-wider ring-1 ring-inset",
        negated
          ? "bg-warn-soft text-warn-soft-fg ring-warn-line"
          : "bg-success-soft text-success-soft-fg ring-success-line",
      )}
    >
      {negated ? "⚠ NÉGATIVE" : "✓ POSITIVE"}
    </span>
  );
}

function MentionCard({
  mention,
  organ,
}: {
  mention: PairMention;
  organ: OrganSelection;
}) {
  const negated = mention.polarity === "negated";
  return (
    <li
      className={cn(
        "rounded-xl border bg-surface p-4 shadow-xs",
        negated ? "border-warn-line" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PolarityBadge polarity={mention.polarity} />
        <span className="tabular text-xs font-medium text-fg-subtle">
          {mention.year}
        </span>
      </div>

      <blockquote className="mt-3 border-l-2 border-line-strong pl-3 font-serif text-[0.95rem] leading-relaxed text-fg">
        «{" "}
        <HighlightedSentence
          sentence={mention.sentence}
          hlaSpan={mention.hlaSpan}
          outcomeSpan={mention.outcomeSpan}
        />{" "}
        »
      </blockquote>

      {negated ? (
        <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
          {mention.negationTrigger ? (
            <p>
              ⓘ Négation détectée : «&nbsp;{mention.negationTrigger}&nbsp;»
            </p>
          ) : (
            <p>ⓘ Négation détectée par le pipeline.</p>
          )}
          <p className="mt-0.5 opacity-90">{POLARITY_CAVEAT}</p>
        </div>
      ) : null}

      {/* Reference bibliographique : ce que le type PairMention porte
          reellement (titre, revue, annee, citations) — pas d'auteurs dans le
          schema, le titre tient donc lieu d'identification de l'article. */}
      <div className="mt-3 border-t border-line pt-3 text-xs text-fg-muted">
        <p className="text-[0.8125rem] font-medium leading-snug text-fg">
          {mention.title}
        </p>
        <p className="mt-0.5 italic">
          {mention.journal ? `${mention.journal}, ` : ""}
          {mention.year}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-2xs text-fg-subtle ring-1 ring-inset ring-line">
            PMID {mention.pmid}
          </span>
          {mention.citedBy !== null ? (
            <span className="text-fg-subtle">cité {mention.citedBy} fois</span>
          ) : null}
          <span className="ml-auto flex items-center gap-3">
            <a
              href={pubmedHref(mention.pmid)}
              target="_blank"
              rel="noopener noreferrer"
              className="link inline-flex items-center gap-0.5"
            >
              PubMed
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
            <Link href={articleHref(mention.pmid, organ)} className="link">
              Fiche article
            </Link>
          </span>
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
  organ = ALL_ORGANS,
}: {
  /** Strate : seules les phrases des articles de l'organe sont chargees. */
  organ?: OrganSelection;
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
    const slug = organSlug(organ);
    if (slug) params.set(ORGAN_PARAM, slug);

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
  }, [hla, outcome, organ]);

  /** Echap ferme le tiroir : un panneau modal doit se quitter au clavier. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
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

  const tabs: SegmentOption<Tab>[] = [
    { value: "toutes", label: "Toutes", count: sorted.length },
    { value: "positives", label: "Positives", count: nPositive },
    { value: "negatives", label: "Négatives", count: nNegated },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in justify-end bg-fg/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Phrases sources : ${hla} × ${label}`}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-2xl animate-slide-in-right flex-col overflow-y-auto border-l border-line bg-canvas shadow-overlay"
      >
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="eyebrow">Phrases sources</p>
              {/* Libelle clinique recu en prop — la cle technique n'apparait pas. */}
              <h2 className="text-lg font-semibold leading-snug text-fg">
                <span className="allele">{hla}</span>
                <span className="mx-1.5 font-normal text-fg-faint">×</span>
                {label}
              </h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Fermer le tiroir"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted ring-1 ring-inset ring-line hover:bg-surface-muted hover:text-fg"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-sm text-fg-muted">
            {mentions === null
              ? failed
                ? "Chargement impossible."
                : "Chargement…"
              : `${sorted.length} mention${sorted.length > 1 ? "s" : ""} · ` +
                `${nPositive} positive${nPositive > 1 ? "s" : ""} · ` +
                `${nNegated} négative${nNegated > 1 ? "s" : ""}`}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              ariaLabel="Filtrer par polarité"
              options={tabs}
              value={tab}
              onChange={setTab}
            />
            <span className="text-xs text-fg-subtle">
              Tri : année décroissante
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-mark-hla ring-1 ring-inset ring-mark-hla-fg/30" />
              Segment repéré comme allèle
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-mark-outcome ring-1 ring-inset ring-mark-outcome-fg/30" />
              Segment repéré comme complication
            </span>
          </div>
        </header>

        <div className="flex-1 px-4 py-4 sm:px-6">
          {failed ? (
            <p className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">
              Les phrases sources n&apos;ont pas pu être chargées. Ce
              n&apos;est pas un résultat sur le corpus : c&apos;est une panne
              d&apos;accès. Réessayez.
            </p>
          ) : mentions === null ? (
            <div aria-hidden="true" className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <SkeletonText lines={3} />
                </div>
              ))}
              <p className="sr-only">Chargement des phrases…</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-sm text-fg-muted">
              Aucune phrase dans cette sélection.
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((mention) => (
                <MentionCard
                  key={mention.pairMentionId}
                  mention={mention}
                  organ={organ}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-line bg-surface/95 px-4 py-3 text-center backdrop-blur sm:px-6">
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
            className="cursor-not-allowed text-xs font-medium text-fg-subtle"
          >
            ⚠ Extraction automatique — signaler une erreur
          </button>
        </footer>
      </section>
    </div>
  );
}
