import { Fragment } from "react";

/**
 * Phrase source avec surlignage des deux spans extraits.
 *
 * C'EST LE COMPOSANT QUI REND L'EXTRACTION VERIFIABLE. La spec (§5.4) le dit :
 * le surlignage est « le moyen le plus rapide de reperer les ~21 % d'erreurs »,
 * parce qu'un span qui porte sur le mauvais segment saute aux yeux. Deux
 * couleurs distinctes, donc : une pour l'allele, une pour la complication. Si
 * les deux se confondaient, un span mal place resterait invisible.
 *
 * ⚠ LE SPAN HLA CONTIENT `*` (« HLA-DQB1*02:01 »), METACARACTERE REGEX. Une
 * `new RegExp(hlaSpan)` l'interpreterait comme quantificateur : soit une
 * exception (`Nothing to repeat`), soit pire, un faux appariement silencieux.
 * On ne construit donc AUCUNE regex ici : la recherche se fait a `indexOf`,
 * qui traite la chaine comme litterale par construction. Les spans reels
 * contiennent aussi `:` et `-`, et peuvent contenir `(`, `)`, `+`, `.`.
 *
 * INVARIANT : `container.textContent === sentence`, toujours. Les segments
 * sont decoupes sur la phrase d'origine et concatenes sans rien ajouter ni
 * retirer — pas de normalisation d'espaces, pas d'ellipse. Une phrase source
 * retouchee a l'affichage ne serait plus une piece justificative.
 *
 * SPANS QUI SE CHEVAUCHENT. Le span complication est cherche UNIQUEMENT dans
 * les segments non encore surlignes, apres decoupe du span HLA. Si l'un
 * contient l'autre (« HLA-DQB1*02:01 » et « DQB1 »), ou s'ils se recouvrent
 * partiellement, on obtient donc un seul marquage au lieu d'un marquage
 * imbrique illegal — sans lever, et sans alterer le texte.
 */

/** Un morceau de phrase, surligne ou non. */
type Segment = {
  text: string;
  kind: "plain" | "hla" | "outcome";
};

/**
 * Decoupe `segments` en isolant la PREMIERE occurrence de `needle` parmi les
 * morceaux encore neutres. Ne touche jamais un morceau deja surligne : c'est
 * ce qui garantit l'absence de chevauchement.
 *
 * Un `needle` vide ou introuvable laisse la liste inchangee — cas defensif
 * (span absent de la phrase, span null retombe sur la cle par `queries.ts`).
 */
function markFirst(
  segments: Segment[],
  needle: string,
  kind: "hla" | "outcome",
): Segment[] {
  if (needle.length === 0) return segments;

  const out: Segment[] = [];
  let done = false;

  for (const segment of segments) {
    if (done || segment.kind !== "plain") {
      out.push(segment);
      continue;
    }
    // indexOf, jamais RegExp : le span est une chaine litterale.
    const at = segment.text.indexOf(needle);
    if (at === -1) {
      out.push(segment);
      continue;
    }
    const before = segment.text.slice(0, at);
    const after = segment.text.slice(at + needle.length);
    if (before) out.push({ text: before, kind: "plain" });
    out.push({ text: needle, kind });
    if (after) out.push({ text: after, kind: "plain" });
    done = true;
  }

  return out;
}

const MARK_CLASS: Record<"hla" | "outcome", string> = {
  // Deux teintes franchement distinctes, chacune avec un contraste suffisant
  // sur son fond : le lecteur doit pouvoir dire d'un coup d'oeil lequel des
  // deux surlignages porte sur l'allele.
  hla: "rounded bg-sky-200 px-0.5 font-medium text-sky-950",
  outcome: "rounded bg-amber-200 px-0.5 font-medium text-amber-950",
};

const MARK_TITLE: Record<"hla" | "outcome", string> = {
  hla: "Segment repéré comme allèle",
  outcome: "Segment repéré comme complication",
};

export function HighlightedSentence({
  sentence,
  hlaSpan,
  outcomeSpan,
}: {
  sentence: string;
  hlaSpan: string;
  outcomeSpan: string;
}) {
  // L'allele d'abord : c'est le span le plus long et le plus specifique, donc
  // celui dont le placement est le plus informatif quand l'extraction a rate.
  let segments: Segment[] = [{ text: sentence, kind: "plain" }];
  segments = markFirst(segments, hlaSpan, "hla");
  segments = markFirst(segments, outcomeSpan, "outcome");

  return (
    <span className="leading-relaxed">
      {segments.map((segment, i) =>
        segment.kind === "plain" ? (
          <Fragment key={i}>{segment.text}</Fragment>
        ) : (
          <mark
            key={i}
            className={MARK_CLASS[segment.kind]}
            title={MARK_TITLE[segment.kind]}
          >
            {segment.text}
          </mark>
        ),
      )}
    </span>
  );
}
