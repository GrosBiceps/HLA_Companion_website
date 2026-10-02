"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  CornerDownLeft,
  Dna,
  FileText,
  Layers,
  Loader2,
  Search,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { EntityType, SearchHit } from "@/lib/types";

/**
 * Recherche avec autocompletion — Client Components.
 *
 * Deux presentations, une seule logique (`useCorpusSearch`) :
 *  - `SearchBar`     : champ EN LIGNE, panneau de resultats dans le flux
 *                      (accueil) ;
 *  - `SearchCommand` : declencheur d'en-tete + palette de commande modale,
 *                      ouverte par « / » ou Ctrl/⌘-K, depuis toute page.
 *
 * ⚠ Ce module n'importe NI `db.ts` NI `queries.ts` : ces modules sont
 * serveur-uniquement (module natif `better-sqlite3`). Il interroge le Route
 * Handler `/api/search`, qui les enveloppe.
 *
 * Debounce de 200 ms : la frappe d'un allele ("HLA-DQB1*02:01") produirait
 * autrement une requete par caractere.
 */

const DEBOUNCE_MS = 200;

const ENTITY_LABELS: Record<EntityType, string> = {
  allele: "Allèle",
  serotype: "Sérotype",
  outcome: "Complication",
  article: "Article",
  author: "Auteur",
};

/** Intitule de groupe, au pluriel, affiche au-dessus de chaque bloc de resultats. */
const GROUP_LABELS: Record<EntityType, string> = {
  allele: "Allèles",
  serotype: "Sérotypes",
  outcome: "Complications",
  article: "Articles",
  author: "Auteurs",
};

const ENTITY_ICONS: Record<EntityType, typeof Dna> = {
  allele: Dna,
  serotype: Layers,
  outcome: Stethoscope,
  article: FileText,
  author: UserRound,
};

/**
 * Route de la fiche correspondant a un resultat.
 * ⚠ `src/__tests__/routes.test.ts` relit CE fichier et verifie chaque
 * prefixe de route emis ci-dessous contre l'arborescence de `src/app`.
 */
function hrefFor(hit: SearchHit): string {
  switch (hit.entityType) {
    case "allele":
      return `/allele/${encodeURIComponent(hit.entityId)}`;
    case "serotype":
      return `/serotype/${encodeURIComponent(hit.entityId)}`;
    case "outcome":
      return `/complication/${encodeURIComponent(hit.entityId)}`;
    case "article":
      return `/article/${encodeURIComponent(hit.entityId)}`;
    case "author":
      return `/auteur/${encodeURIComponent(hit.entityId)}`;
  }
}

/**
 * Interrogation de `/api/search`, avec annulation de la requete en vol.
 *
 * L'etat d'erreur est DISTINCT du resultat vide. Confondre les deux ferait
 * dire au site "aucune entree du corpus ne correspond" — une affirmation de
 * fait sur le contenu du corpus — alors qu'il vient d'echouer a le consulter
 * et n'en sait rien. C'est exactement le mode de defaillance que ce projet
 * existe pour eviter.
 */
function useCorpusSearch(query: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // Conserve la requete en vol pour l'annuler : sans cela, une reponse lente
  // pour "HLA" pourrait ecraser la reponse rapide pour "HLA-DQ".
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      abortRef.current?.abort();
      setHits([]);
      setPending(false);
      setFailed(false);
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
        .then((res) => {
          // Un statut non-2xx n'est pas un corpus vide : on le fait remonter
          // au .catch pour qu'il devienne un etat d'erreur explicite.
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: { hits?: SearchHit[] }) => {
          setHits(data.hits ?? []);
          setFailed(false);
          setPending(false);
        })
        .catch(() => {
          // Une annulation n'est pas une erreur : la requete suivante prend
          // la main et remettra `pending` a jour.
          if (!controller.signal.aborted) {
            setHits([]);
            setFailed(true);
            setPending(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { hits, pending, failed };
}

/** Navigation clavier dans la liste : fleches, Entree. */
function useActiveIndex(hits: SearchHit[], onPick: (hit: SearchHit) => void) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [hits]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (hits.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % hits.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + hits.length) % hits.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const hit = hits[active];
        if (hit) onPick(hit);
      }
    },
    [hits, active, onPick],
  );

  return { active, setActive, onKeyDown };
}

/** Ligne d'etat + liste de resultats, partagee par les deux presentations. */
function SearchResults({
  listId,
  hits,
  pending,
  failed,
  active,
  onHover,
  onNavigate,
}: {
  listId: string;
  hits: SearchHit[];
  pending: boolean;
  failed: boolean;
  active: number;
  onHover: (index: number) => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <p
        aria-live="polite"
        className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-fg-subtle"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        {pending
          ? "Recherche en cours…"
          : failed
            ? "Recherche indisponible"
            : `${hits.length} résultat${hits.length > 1 ? "s" : ""}`}
      </p>

      {!pending && failed ? (
        <p role="alert" className="px-4 py-3 text-sm text-warn-soft-fg">
          La recherche est momentanément indisponible. Ce n&apos;est pas un
          résultat sur le corpus : la requête n&apos;a pas abouti.
        </p>
      ) : null}

      {!pending && !failed && hits.length === 0 ? (
        <p className="px-4 py-3 text-sm text-fg-muted">
          Aucune entrée du corpus ne correspond à cette recherche.
        </p>
      ) : null}

      <ul id={listId} role="listbox" aria-label="Résultats" className="p-1.5">
        {hits.map((hit, index) => {
          const Icon = ENTITY_ICONS[hit.entityType];
          const selected = index === active;
          const child = hit.childOf !== undefined;
          const startsGroup = index === 0 || hits[index - 1].entityType !== hit.entityType;
          return (
            <Fragment key={`${hit.entityType}:${hit.entityId}`}>
              {startsGroup ? (
                <li
                  role="presentation"
                  className="eyebrow px-2.5 pb-1 pt-2.5 first:pt-1"
                >
                  {GROUP_LABELS[hit.entityType]}
                </li>
              ) : null}
              <li
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
              >
                <Link
                  href={hrefFor(hit)}
                  tabIndex={-1}
                  onMouseMove={() => onHover(index)}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg pr-2.5 text-sm", child ? "py-1" : "py-2",
                    child ? "pl-8" : "pl-2.5",
                    selected ? "bg-primary-soft text-fg" : "text-fg hover:bg-surface-muted",
                  )}
                >
                  {child ? (
                    <span
                      aria-hidden="true"
                      className="-ml-4 mr-[-0.25rem] h-4 w-3 shrink-0 rounded-bl-md border-b border-l border-line-strong"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
                        selected
                          ? "bg-surface text-primary ring-primary/20"
                          : "bg-surface-muted text-fg-subtle ring-line",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate",
                        hit.entityType === "allele" && "allele",
                        hit.entityType === "serotype" && "font-semibold",
                      )}
                    >
                      {hit.label}
                    </span>
                    {hit.detail ? (
                      <span className="block truncate text-2xs text-fg-subtle">
                        {hit.detail}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-medium text-fg-subtle ring-1 ring-inset ring-line">
                    {hit.badge ?? ENTITY_LABELS[hit.entityType]}
                  </span>
                  {selected ? (
                    <CornerDownLeft
                      aria-hidden="true"
                      className="hidden h-3.5 w-3.5 text-fg-subtle sm:block"
                    />
                  ) : null}
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </>
  );
}

const PLACEHOLDER =
  "Allèle (A*02, DQB1*02:01), sérotype (DR15, B27), complication, article…";

/**
 * Champ de recherche EN LIGNE.
 *
 * Le panneau de resultats est DANS LE FLUX, pas en `absolute` : il pousse le
 * contenu vers le bas au lieu de le recouvrir. En position absolue il
 * peignait par-dessus le cadrage epistemique, et un utilisateur qui tapait
 * des l'arrivee pouvait rejoindre une fiche allele sans avoir lu une ligne
 * du cadrage. Combine a l'ordre de page.tsx (encart AVANT la recherche), le
 * cadrage ne peut plus etre recouvert ni depasse.
 */
export function SearchBar({ className }: { className?: string } = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { hits, pending, failed } = useCorpusSearch(query);
  const listId = useId();
  const pick = useCallback((hit: SearchHit) => router.push(hrefFor(hit)), [router]);
  const { active, setActive, onKeyDown } = useActiveIndex(hits, pick);

  const showPanel = query.trim().length > 0;

  return (
    <div className={className}>
      <label htmlFor="search-input" className="sr-only">
        Rechercher un allèle, une complication, un article ou un auteur
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          id="search-input"
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            hits.length > 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDER}
          className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-4
                     text-base text-fg shadow-xs outline-none transition
                     placeholder:text-fg-faint focus:border-primary
                     focus:ring-4 focus:ring-primary/15"
        />
      </div>

      {showPanel ? (
        <div
          role="region"
          aria-label="Résultats de recherche"
          className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-line bg-surface shadow-raised"
        >
          <SearchResults
            listId={listId}
            hits={hits}
            pending={pending}
            failed={failed}
            active={active}
            onHover={setActive}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Vrai si la touche est frappee dans un champ de saisie. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/** Pages d'index proposees quand la palette est vide. */
const QUICK_LINKS = [
  { href: "/allele", label: "Index des allèles" },
  { href: "/serotype", label: "Index des sérotypes" },
  { href: "/complication", label: "Complications" },
];

/** Exemples proposes quand la palette est vide (ils remplissent le champ). */
const EXAMPLES = ["A*02", "DQB1*02:01", "DR15", "B27", "Cw7", "DRB1", "Rejet"];

/**
 * Palette de recherche — declencheur d'en-tete + dialogue modal.
 *
 * Raccourcis : « / » (hors champ de saisie) ou Ctrl/⌘-K. Echap ferme.
 * La palette rappelle le cadrage en pied : elle mene a des fiches, et doit
 * dire ce que leurs chiffres sont.
 *
 * Le declencheur est double : bouton-icone sous `sm`, faux champ au-dela.
 * Un SEUL composant doit etre monte par page (il ecoute les raccourcis).
 */
export function SearchCommand({
  triggerClassName,
}: {
  /** Classes du declencheur large (>= sm), typiquement sa largeur. */
  triggerClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { hits, pending, failed } = useCorpusSearch(open ? query : "");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const pick = useCallback(
    (hit: SearchHit) => {
      close();
      router.push(hrefFor(hit));
    },
    [close, router],
  );
  const { active, setActive, onKeyDown } = useActiveIndex(hits, pick);

  // Raccourcis globaux.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((o) => !o);
      } else if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Fermeture a chaque changement de page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Focus + verrouillage du defilement pendant l'ouverture.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Rechercher dans le corpus"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-fg/[0.06] hover:text-fg sm:hidden"
      >
        <Search className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface-muted/70 pl-3 pr-1.5 text-sm text-fg-subtle shadow-xs transition hover:border-line-strong hover:bg-surface hover:text-fg-muted sm:flex",
          triggerClassName,
        )}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1 truncate text-left">Rechercher…</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex animate-fade-in items-start justify-center bg-fg/30 px-3 pt-[10vh] backdrop-blur-[2px] sm:px-4"
          onMouseDown={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recherche dans le corpus"
            onMouseDown={(e) => e.stopPropagation()}
            className="flex max-h-[75vh] w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-fg-subtle" />
              <label htmlFor="command-search-input" className="sr-only">
                Rechercher un allèle, une complication, un article ou un auteur
              </label>
              <input
                ref={inputRef}
                id="command-search-input"
                type="search"
                role="combobox"
                aria-expanded={query.trim().length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  hits.length > 0 ? `${listId}-${active}` : undefined
                }
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={PLACEHOLDER}
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-faint [&::-webkit-search-cancel-button]:hidden"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Fermer la recherche"
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-fg-subtle hover:bg-fg/[0.06] hover:text-fg"
              >
                <kbd className="kbd hidden sm:inline-flex">Échap</kbd>
                <X className="h-4 w-4 sm:hidden" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {query.trim().length > 0 ? (
                <SearchResults
                  listId={listId}
                  hits={hits}
                  pending={pending}
                  failed={failed}
                  active={active}
                  onHover={setActive}
                  onNavigate={close}
                />
              ) : (
                <div className="space-y-3 px-4 py-4">
                  <p className="eyebrow">Exemples</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setQuery(example);
                          inputRef.current?.focus();
                        }}
                        className={cn(
                          "rounded-full bg-surface-muted px-3 py-1 text-xs text-fg-muted ring-1 ring-inset ring-line hover:bg-primary-soft hover:text-primary-soft-fg",
                          /[*:]|^[A-Z]{2,4}\d?$/.test(example) && "allele",
                        )}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <p className="eyebrow pt-2">Parcourir</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {QUICK_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={close}
                        className="rounded-full px-3 py-1 text-fg-muted ring-1 ring-inset ring-line hover:bg-primary-soft hover:text-primary-soft-fg"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  <p className="text-2xs leading-relaxed text-fg-subtle">
                    Tolère la casse, les espaces et l&apos;absence de « * » ou
                    de « : » : « a02 », « DQB1 02 01 », « dr 15 » fonctionnent.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted/60 px-4 py-2 text-2xs text-fg-subtle">
              <span>
                Co-occurrences textuelles — pas des associations cliniques.
              </span>
              <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                <kbd className="kbd">↑</kbd>
                <kbd className="kbd">↓</kbd>
                naviguer
                <kbd className="kbd ml-1.5">↵</kbd>
                ouvrir
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
