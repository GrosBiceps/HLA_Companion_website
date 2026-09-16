"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EntityType, SearchHit } from "@/lib/types";

/**
 * Recherche avec autocompletion — Client Component.
 *
 * ⚠ Ce composant n'importe NI `db.ts` NI `queries.ts` : ces modules sont
 * serveur-uniquement (module natif `better-sqlite3`). Il interroge le Route
 * Handler `/api/search`, qui les enveloppe.
 *
 * Debounce de 200 ms : la frappe d'un allele ("HLA-DQB1*02:01") produirait
 * autrement une requete par caractere.
 */

const DEBOUNCE_MS = 200;

const ENTITY_LABELS: Record<EntityType, string> = {
  allele: "Allèle",
  outcome: "Complication",
  article: "Article",
  author: "Auteur",
};

/** Route de la fiche correspondant a un resultat. */
function hrefFor(hit: SearchHit): string {
  switch (hit.entityType) {
    case "allele":
      return `/allele/${encodeURIComponent(hit.entityId)}`;
    case "outcome":
      return `/complication/${encodeURIComponent(hit.entityId)}`;
    case "article":
      return `/article/${encodeURIComponent(hit.entityId)}`;
    case "author":
      return `/auteur/${encodeURIComponent(hit.entityId)}`;
  }
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, setPending] = useState(false);

  // Conserve la requete en vol pour l'annuler : sans cela, une reponse lente
  // pour "HLA" pourrait ecraser la reponse rapide pour "HLA-DQ".
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      abortRef.current?.abort();
      setHits([]);
      setPending(false);
      return;
    }

    setPending(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { hits: [] }))
        .then((data: { hits?: SearchHit[] }) => {
          setHits(data.hits ?? []);
          setPending(false);
        })
        .catch(() => {
          // Une annulation n'est pas une erreur : la requete suivante prend
          // la main et remettra `pending` a jour.
          if (!controller.signal.aborted) {
            setHits([]);
            setPending(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const showPanel = query.trim().length > 0;

  return (
    <div className="relative">
      <label htmlFor="search-input" className="sr-only">
        Rechercher un allèle, une complication, un article ou un auteur
      </label>
      <input
        id="search-input"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un allèle, une complication, un article, un auteur…"
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-3
                   text-base text-slate-900 shadow-sm outline-none
                   focus:border-slate-800 focus:ring-2 focus:ring-slate-200"
      />

      {showPanel ? (
        <div
          role="region"
          aria-live="polite"
          aria-label="Résultats de recherche"
          className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto
                     rounded-md border border-slate-300 bg-white shadow-lg"
        >
          <p className="border-b border-slate-200 px-4 py-2 text-xs
                        text-slate-600">
            {pending
              ? "Recherche en cours…"
              : `${hits.length} résultat${hits.length > 1 ? "s" : ""}`}
          </p>

          {!pending && hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-600">
              Aucune entrée du corpus ne correspond à cette recherche.
            </p>
          ) : null}

          <ul>
            {hits.map((hit) => (
              <li key={`${hit.entityType}:${hit.entityId}`}>
                <Link
                  href={hrefFor(hit)}
                  className="flex items-baseline justify-between gap-3 px-4 py-2
                             text-sm hover:bg-slate-100"
                >
                  <span className="text-slate-900">{hit.label}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5
                                   text-xs text-slate-600">
                    {ENTITY_LABELS[hit.entityType]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
