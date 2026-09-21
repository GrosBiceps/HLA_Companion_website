import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AssociationCard } from "@/components/AssociationCard";
import { SIGNAL_LABELS, SIGNAL_LEVELS } from "@/lib/labels";
import { getAssociationsForOutcome, getOutcome } from "@/lib/queries";
import type { AssociationRow, SignalLevel } from "@/lib/types";

/**
 * Fiche complication — NAVIGATION INVERSE de la fiche allele.
 *
 * LIBELLE CLINIQUE, JAMAIS LA CLE. L'URL porte la cle technique
 * (`/outcome/graft_loss`) parce qu'elle doit etre stable ; l'ECRAN ne la
 * montre nulle part. L'entete affiche « Perte du greffon », le <title> aussi.
 * Une cle affichee donnerait au chiffre l'autorite d'une sortie de machine.
 *
 * REGROUPEMENT PAR FORCE DE SIGNAL, et non par classe HLA. La fiche allele
 * groupe par categorie clinique parce que la categorie est le referentiel qui
 * organise les complications. Ici l'axe symetrique serait `hla_class` (I / II
 * / unknown) — mais il est a la fois trop grossier (deux groupes utiles) et
 * muet pour le lecteur : savoir qu'un allele est de classe II ne l'aide pas a
 * trier ce qu'il doit lire d'abord. Le groupement retenu est donc la force du
 * signal, qui est exactement la question posee sur cette page : « avec quels
 * alleles cette complication est-elle le plus souvent co-mentionnee ? ». Les
 * groupes suivent SIGNAL_LEVELS, `inverse` en tete.
 *
 * CE QUI N'EST PAS REIMPLEMENTE. AssociationCard porte deja l'indicateur de
 * signal, la remontee des negations, le grisage du non significatif, le
 * repliement des metriques et le tiroir des phrases. Cette page ne fait que
 * lui passer les lignes : aucune metrique ne fuit hors de la carte.
 *
 * ENCODAGE. Les cles d'outcome du corpus sont alphanumeriques + `_`, mais on
 * decode defensivement comme la fiche allele : une cle elargie plus tard
 * (accent, espace) arriverait percent-encodee et un 404 sur une complication
 * existante serait un bug silencieux.
 */

type Params = { params: Promise<{ outcome: string }> };

/** Decodage tolerant : une sequence percent invalide ne doit pas lever. */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const key = safeDecode((await params).outcome);
  const outcome = getOutcome(key);
  // Titre de repli sans la cle technique : meme dans l'onglet du navigateur,
  // `graft_loss` ne doit pas s'afficher.
  if (!outcome) return { title: "Complication inconnue" };
  return {
    title: `${outcome.label} — co-occurrences textuelles`,
    description:
      `Allèles HLA co-mentionnés avec « ${outcome.label} » dans la ` +
      `littérature indexée. Co-occurrences textuelles, pas des associations ` +
      `cliniques.`,
  };
}

/** Regroupe les lignes par niveau de signal, dans l'ordre de SIGNAL_LEVELS. */
function groupBySignal(
  rows: AssociationRow[],
): { level: SignalLevel; rows: AssociationRow[] }[] {
  const groups = new Map<SignalLevel, AssociationRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.signalLevel);
    if (bucket) bucket.push(row);
    else groups.set(row.signalLevel, [row]);
  }
  const ordered: { level: SignalLevel; rows: AssociationRow[] }[] = [];
  for (const level of SIGNAL_LEVELS) {
    const bucket = groups.get(level);
    if (bucket && bucket.length > 0) ordered.push({ level, rows: bucket });
  }
  return ordered;
}

export default async function OutcomePage({ params }: Params) {
  const key = safeDecode((await params).outcome);

  const outcome = getOutcome(key);
  if (!outcome) notFound();

  const associations = getAssociationsForOutcome(key);
  const groups = groupBySignal(associations);
  const nSignificant = associations.filter((a) => a.isSignificant).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        {/* Le libelle clinique, jamais `outcome.outcome`. */}
        <h1 className="text-2xl font-bold text-slate-900">{outcome.label}</h1>
        <p className="text-sm text-slate-700">
          Catégorie {outcome.category} — mentionnée dans {outcome.nMentions}{" "}
          article{outcome.nMentions > 1 ? "s" : ""} du corpus.
        </p>
      </header>

      <section
        aria-label="Comment lire cette fiche"
        className="rounded-md border-l-4 border-slate-900 bg-slate-100 px-4 py-3
                   text-sm text-slate-900"
      >
        <p>
          Cette page part de la complication et remonte vers les{" "}
          <strong>allèles mentionnés dans les mêmes articles</strong>. Chaque
          ligne compte des articles, comparé à ce qu&apos;on attendrait si les
          mentions étaient réparties au hasard dans le texte — une fréquence de
          publication, pas une observation chez des patients.
        </p>
        <p className="mt-1">
          Toute lecture clinique exige de relire les phrases sources.{" "}
          <Link
            href="/methodologie"
            className="font-medium underline underline-offset-2
                       hover:text-slate-600"
          >
            Méthodologie
          </Link>
        </p>
      </section>

      <section aria-label="Allèles co-mentionnés" className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide
                       text-slate-700">
          Allèles co-mentionnés ({associations.length})
        </h2>

        {associations.length === 0 ? (
          <p className="rounded-md border border-slate-300 bg-white px-4 py-3
                        text-sm text-slate-700">
            Aucun allèle n&apos;est co-mentionné avec cette complication dans ce
            corpus. Ce n&apos;est pas un résultat sur la clinique : c&apos;est
            l&apos;état de la littérature indexée telle qu&apos;elle a été
            extraite.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              {nSignificant} ligne{nSignificant > 1 ? "s" : ""} au-dessus du
              seuil statistique du corpus, {associations.length - nSignificant}{" "}
              en dessous. Les secondes restent affichées, grisées : une absence
              de signal est une information.
            </p>

            {groups.map(({ level, rows }) => (
              <div key={level} className="space-y-3">
                <h3 className="border-b border-slate-200 pb-1 text-sm
                               font-semibold text-slate-900">
                  {SIGNAL_LABELS[level].label}{" "}
                  <span className="font-normal text-slate-500">
                    ({rows.length})
                  </span>
                </h3>
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div key={`${row.hla}:${row.outcome}`} className="space-y-1">
                      {/*
                        Le retour vers la fiche allele : c'est lui qui fait de
                        cette page une navigation, et non une liste morte.
                      */}
                      <p className="text-sm">
                        <Link
                          href={`/allele/${encodeURIComponent(row.hla)}`}
                          className="font-semibold text-slate-900 underline
                                     underline-offset-2 hover:text-slate-600"
                        >
                          {row.hla}
                        </Link>
                      </p>
                      <AssociationCard association={row} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
