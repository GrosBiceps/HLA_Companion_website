import { Fragment } from "react";
import { segmentText, type HighlightNeedle } from "@/lib/highlight";

/**
 * Texte libre (titre, resume) dont les segments reperes par l'extraction
 * sont surlignes — memes jetons que `HighlightedSentence` (bleu plein pour
 * l'allele, ambre pointille pour la complication), pour que la convention
 * visuelle soit la meme partout.
 *
 * INVARIANT : `textContent === text`. Rien n'est ajoute ni retire.
 */
const MARK_CLASS = {
  hla: "rounded-[3px] bg-mark-hla px-0.5 font-medium text-mark-hla-fg box-decoration-clone underline decoration-mark-hla-fg/40 decoration-2 underline-offset-2",
  outcome:
    "rounded-[3px] bg-mark-outcome px-0.5 font-medium text-mark-outcome-fg box-decoration-clone underline decoration-dotted decoration-mark-outcome-fg/50 decoration-2 underline-offset-2",
} as const;

const MARK_TITLE = {
  hla: "Segment repéré comme allèle",
  outcome: "Segment repéré comme complication",
} as const;

export function HighlightedText({
  text,
  needles,
}: {
  text: string;
  needles: HighlightNeedle[];
}) {
  return (
    <>
      {segmentText(text, needles).map((s, i) =>
        s.kind === "plain" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <mark
            key={i}
            className={MARK_CLASS[s.kind]}
            title={MARK_TITLE[s.kind]}
          >
            {s.text}
          </mark>
        ),
      )}
    </>
  );
}
