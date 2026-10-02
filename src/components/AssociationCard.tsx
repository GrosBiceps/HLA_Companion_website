"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Quote } from "lucide-react";
import { SentenceDrawer } from "@/components/SentenceDrawer";
import { SignalIndicator } from "@/components/SignalIndicator";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { ALL_ORGANS, organLabel, type OrganSelection } from "@/lib/organ";
import { SIGNAL_CLASSES } from "@/lib/theme";
import type { AssociationRow } from "@/lib/types";

/**
 * Carte d'une paire (allele, complication) — l'unite de lecture de la fiche.
 *
 * HIERARCHIE D'INFORMATION. Elle est le coeur de la conception du site et
 * chaque niveau est defendu par un test :
 *
 *  1. LE LIBELLE CLINIQUE, jamais la cle du pipeline. `graft_loss` est un
 *     identifiant interne ; l'ecran dit « Perte du greffon ». La cle n'est pas
 *     seulement laide : affichee, elle donne au chiffre l'autorite d'une sortie
 *     de machine.
 *  2. LE NOMBRE D'ARTICLES, en clair et en premier plan. C'est la seule
 *     quantite que l'utilisateur peut verifier lui-meme, en allant lire les
 *     phrases. Elle est rendue en UN SEUL noeud de texte (« 18 articles »)
 *     pour rester lisible telle quelle.
 *  3. LES MENTIONS NEGATIVES, jamais masquees. Quatre articles sur dix-huit
 *     disant que la co-occurrence n'est PAS observee changent entierement la
 *     lecture des dix-huit. Les cacher fabriquerait un signal.
 *  4. LE NON-SIGNIFICATIF, grise mais present. Une absence de signal est une
 *     information ; filtrer ces lignes laisserait croire que tout ce qui est
 *     affiche est marquant.
 *  5. LES METRIQUES, derriere un <details> referme. NPMI, OR, IC et FDR ne
 *     sont pas caches par pudeur : sortis de leur contexte ils se lisent comme
 *     un verdict, alors qu'ils quantifient une co-occurrence de mots dans des
 *     resumes. Qui les veut les deplie, et les trouve avec leur mise en garde.
 *
 * Aucun terme causal n'apparait dans le texte visible : la carte decrit des
 * CO-MENTIONS, pas une relation clinique.
 *
 * STYLE. Filet gauche a la couleur du signal (repere de balayage), barre de
 * repartition affirmees/niees (deux effectifs verifiables, pas une metrique),
 * bouton principal « Voir les N phrases » : le chemin de verification est
 * l'action la plus visible de la carte.
 */

/**
 * Formatage court d'une valeur, ou tiret si la colonne est absente.
 * Virgule decimale : l'interface est francaise de bout en bout, y compris
 * dans le depliant technique.
 */
function num(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits).replace(".", ",");
}

/** Notation scientifique pour les p-valeurs corrigees, souvent tres petites. */
function sci(value: number | null): string {
  return value === null ? "—" : value.toExponential(1);
}

export function AssociationCard({
  association,
  title,
  organ = ALL_ORGANS,
}: {
  association: AssociationRow;
  /** Strate des chiffres de la carte (rappelee dans le detail statistique). */
  organ?: OrganSelection;
  /**
   * Titre de la carte. Par defaut le LIBELLE CLINIQUE de la complication
   * (fiche allele). La fiche complication passe le nom de l'allele, puisque
   * la complication y est deja le sujet de la page. Jamais la cle technique.
   */
  title?: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    hla,
    outcome,
    label,
    nCooccurrence,
    nNegated,
    signalLevel,
    isSignificant,
    firstYear,
    npmi,
    oddsRatio,
    orCiLow,
    orCiHigh,
    fdr,
    fdrTwoSided,
    nUniverse,
  } = association;

  const muted = !isSignificant;
  const nAffirmed = Math.max(nCooccurrence - nNegated, 0);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border border-line p-4 sm:p-5",
        muted ? "bg-surface/60" : "bg-surface shadow-card",
      )}
    >
      {/*
        Filet de signal a gauche : repere de balayage dans une longue liste.
        Absent pour le non-significatif, qui reste lisible mais sans relief.
      */}
      {!muted ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            SIGNAL_CLASSES[signalLevel].bg,
          )}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3
          className={cn(
            "min-w-0 text-[0.975rem] font-semibold leading-snug",
            muted ? "text-fg-muted" : "text-fg",
          )}
        >
          {title ?? label}
        </h3>
        <SignalIndicator level={signalLevel} />
      </div>

      {/* Le compte d'articles : un seul noeud de texte, en clair. */}
      <p
        className={cn(
          "mt-2 text-sm leading-relaxed",
          muted ? "text-fg-subtle" : "text-fg-muted",
        )}
      >
        <strong
          className={cn(
            "tabular font-semibold",
            muted ? "text-fg-muted" : "text-fg",
          )}
        >{`${nCooccurrence} article${nCooccurrence > 1 ? "s" : ""}`}</strong>{" "}
        co-mentionnent cet allèle et cette complication
        {firstYear !== null ? ` (depuis ${firstYear})` : ""}.
      </p>

      {/*
        Repartition affirmees / niees : le meme effectif, decoupe. Purement
        visuelle (aria-hidden) : le texte ci-dessous porte les chiffres.
      */}
      {nCooccurrence > 0 ? (
        <div
          aria-hidden="true"
          className="mt-3 flex h-1.5 max-w-xs gap-px overflow-hidden rounded-full bg-fg/10"
        >
          <span
            className={muted ? "bg-fg-faint" : "bg-fg-subtle"}
            style={{ width: `${(nAffirmed / nCooccurrence) * 100}%` }}
          />
          {nNegated > 0 ? (
            <span
              className="bg-warn"
              style={{ width: `${(nNegated / nCooccurrence) * 100}%` }}
            />
          ) : null}
        </div>
      ) : null}

      {/* Les mentions negatives ne sont jamais repliees ni omises. */}
      {nNegated > 0 ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-warn-soft-fg">
          <span
            aria-hidden="true"
            className="mt-[6px] h-2 w-2 shrink-0 rounded-sm bg-warn"
          />
          <span>
            <strong className="font-semibold">{`dont ${nNegated} au sens négatif`}</strong>{" "}
            — la phrase source y nie la co-occurrence.
          </span>
        </p>
      ) : null}

      {/*
        La glose du signal inverse, et non son libelle : celui-ci est deja
        porte par l'indicateur, et le repeter donnerait deux elements portant
        le meme texte — ambigu pour une recherche par texte comme pour une
        lecture d'ecran.
      */}
      {signalLevel === "inverse" ? (
        <p className="mt-3 rounded-lg bg-signal-inverse/10 px-3 py-2 text-sm text-fg">
          Co-mentions moins fréquentes qu&apos;attendu si les mentions étaient
          réparties au hasard dans le texte : piste de protection, à confirmer
          en lisant les sources.
        </p>
      ) : null}

      {!isSignificant ? (
        <p className="mt-2 text-sm text-fg-subtle">
          Sous le seuil statistique du corpus : cette co-occurrence n&apos;est
          pas distinguable du hasard. Elle reste affichée, pas masquée.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-line pt-3">
        {/*
          LE CHEMIN DE VERIFICATION. Ce bouton est ce qui fait du compte
          ci-dessus une quantite verifiable plutot qu'une affirmation : il
          ouvre les phrases sources qui l'ont produit. Le libelle clinique est
          transmis tel quel au tiroir — celui-ci ne le re-derive pas, pour
          qu'il n'existe qu'une seule source de verite par libelle.
        */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={buttonClasses(muted ? "secondary" : "primary", "sm")}
        >
          <Quote aria-hidden="true" className="h-3.5 w-3.5" />
          {`Voir le${nCooccurrence > 1 ? "s" : ""} ${nCooccurrence} phrase${nCooccurrence > 1 ? "s" : ""}`}
        </button>

        {/*
          Repli ferme par defaut : le lecteur rencontre d'abord un effectif
          verifiable, et ne voit les metriques que s'il va les chercher.
        */}
        <details className="group/details min-w-0 flex-1 basis-60">
          <summary className="inline-flex h-8 cursor-pointer select-none items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-subtle hover:text-fg">
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 transition-transform group-open/details:rotate-90"
            />
            Détail statistique
          </summary>
          <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-3 text-xs text-fg-muted">
            <p>
              Ces valeurs quantifient une co-occurrence de termes dans des
              résumés, pas une relation observée chez des patients.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-fg-subtle">Strate</dt>
              <dd className="text-fg">
                {organLabel(organ)}
                {nUniverse !== null
                  ? ` — calculé sur ${formatInt(nUniverse)} articles`
                  : ""}
              </dd>
              <dt className="text-fg-subtle">NPMI</dt>
              <dd className="tabular font-mono text-fg">{num(npmi)}</dd>
              <dt className="text-fg-subtle">Odds ratio</dt>
              <dd className="tabular font-mono text-fg">{num(oddsRatio, 1)}</dd>
              <dt className="text-fg-subtle">IC 95 %</dt>
              <dd className="tabular font-mono text-fg">
                {orCiLow === null || orCiHigh === null
                  ? "—"
                  : `${num(orCiLow, 1)} – ${num(orCiHigh, 1)}`}
              </dd>
              <dt className="text-fg-subtle">FDR (unilatéral)</dt>
              <dd className="tabular font-mono text-fg">{sci(fdr)}</dd>
              <dt className="text-fg-subtle">FDR (bilatéral)</dt>
              <dd className="tabular font-mono text-fg">{sci(fdrTwoSided)}</dd>
            </dl>
          </div>
        </details>
      </div>

      {drawerOpen ? (
        <SentenceDrawer
          hla={hla}
          outcome={outcome}
          label={label}
          organ={organ}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </article>
  );
}
