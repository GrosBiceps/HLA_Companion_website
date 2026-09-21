"use client";

import { useState } from "react";
import { SentenceDrawer } from "@/components/SentenceDrawer";
import { SignalIndicator } from "@/components/SignalIndicator";
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
}: {
  association: AssociationRow;
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
  } = association;

  const muted = !isSignificant;

  return (
    <article
      className={`rounded-lg border bg-white p-4 ${
        muted ? "border-slate-200 opacity-70" : "border-slate-300"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className={`text-base font-semibold ${
            muted ? "text-slate-500" : "text-slate-900"
          }`}
        >
          {label}
        </h3>
        <SignalIndicator level={signalLevel} />
      </div>

      {/* Le compte d'articles : un seul noeud de texte, en clair. */}
      <p
        className={`mt-2 text-sm ${muted ? "text-slate-500" : "text-slate-800"}`}
      >
        <strong className="font-semibold">{`${nCooccurrence} article${nCooccurrence > 1 ? "s" : ""}`}</strong>{" "}
        co-mentionnent cet allèle et cette complication
        {firstYear !== null ? ` (depuis ${firstYear})` : ""}.
      </p>

      {/* Les mentions negatives ne sont jamais repliees ni omises. */}
      {nNegated > 0 ? (
        <p className="mt-1 text-sm font-medium text-amber-900">
          {`dont ${nNegated} au sens négatif`} — la phrase source y nie la
          co-occurrence.
        </p>
      ) : null}

      {/*
        La glose du signal inverse, et non son libelle : celui-ci est deja
        porte par l'indicateur, et le repeter donnerait deux elements portant
        le meme texte — ambigu pour une recherche par texte comme pour une
        lecture d'ecran.
      */}
      {signalLevel === "inverse" ? (
        <p className="mt-1 text-sm text-violet-800">
          Co-mentions moins fréquentes qu&apos;attendu si les mentions étaient
          réparties au hasard dans le texte : piste de protection, à confirmer
          en lisant les sources.
        </p>
      ) : null}

      {!isSignificant ? (
        <p className="mt-1 text-sm text-slate-500">
          Sous le seuil statistique du corpus : cette co-occurrence n&apos;est
          pas distinguable du hasard. Elle reste affichée, pas masquée.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-4">
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
          className="text-sm font-medium text-slate-900 underline
                     underline-offset-2 hover:text-slate-600"
        >
          {`Voir le${nCooccurrence > 1 ? "s" : ""} ${nCooccurrence} phrase${nCooccurrence > 1 ? "s" : ""}`}
        </button>
      </div>

      {drawerOpen ? (
        <SentenceDrawer
          hla={hla}
          outcome={outcome}
          label={label}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}

      {/*
        Repli ferme par defaut : le lecteur rencontre d'abord un effectif
        verifiable, et ne voit les metriques que s'il va les chercher.
      */}
      <details className="mt-3 border-t border-slate-200 pt-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase
                            tracking-wide text-slate-600">
          Détail statistique
        </summary>
        <div className="mt-2 space-y-1 text-xs text-slate-700">
          <p>
            Ces valeurs quantifient une co-occurrence de termes dans des
            résumés, pas une relation observée chez des patients.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-slate-600">NPMI</dt>
            <dd className="font-mono">{num(npmi)}</dd>
            <dt className="text-slate-600">Odds ratio</dt>
            <dd className="font-mono">{num(oddsRatio, 1)}</dd>
            <dt className="text-slate-600">IC 95 %</dt>
            <dd className="font-mono">
              {orCiLow === null || orCiHigh === null
                ? "—"
                : `${num(orCiLow, 1)} – ${num(orCiHigh, 1)}`}
            </dd>
            <dt className="text-slate-600">FDR (unilatéral)</dt>
            <dd className="font-mono">{sci(fdr)}</dd>
            <dt className="text-slate-600">FDR (bilatéral)</dt>
            <dd className="font-mono">{sci(fdrTwoSided)}</dd>
          </dl>
        </div>
      </details>
    </article>
  );
}
