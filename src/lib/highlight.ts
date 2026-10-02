/**
 * Decoupe d'un texte libre (titre, resume) selon des segments a surligner —
 * module pur, sans regex construite a partir des segments.
 *
 * Difference avec `HighlightedSentence` : celui-ci marque UNE paire dans UNE
 * phrase source (la piece justificative). Ici on marque TOUTES les
 * occurrences de TOUS les segments reperes par l'extraction dans un article,
 * pour que le lecteur voie d'un coup d'oeil ce que la machine a reconnu dans
 * le titre et le resume.
 *
 * Regles :
 *  - recherche litterale (`indexOf`) : les segments HLA contiennent `*`, `:` ;
 *  - insensible a la casse, mais le texte rendu reste celui d'origine
 *    (concatener les segments redonne EXACTEMENT le texte d'entree) ;
 *  - le segment le plus long l'emporte (« HLA-DQB1*02:01 » avant « DQB1 ») ;
 *  - aucun chevauchement : une zone deja marquee n'est plus candidate ;
 *  - bornes de mot : « DSA » ne marque pas l'interieur de « DSAx ».
 */

export type HighlightKind = "hla" | "outcome";

export interface HighlightNeedle {
  text: string;
  kind: HighlightKind;
}

export interface HighlightSegment {
  text: string;
  kind: HighlightKind | "plain";
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

export function segmentText(
  text: string,
  needles: HighlightNeedle[],
): HighlightSegment[] {
  const lower = text.toLowerCase();
  const taken = new Array<boolean>(text.length).fill(false);
  const marks: { start: number; end: number; kind: HighlightKind }[] = [];

  // Dedoublonnage, puis le plus long d'abord.
  const seen = new Set<string>();
  const ordered = needles
    .filter((n) => n.text.trim().length > 0)
    .filter((n) => {
      const key = `${n.kind}\u0001${n.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.text.length - a.text.length);

  for (const needle of ordered) {
    const target = needle.text.toLowerCase();
    let from = 0;
    while (from <= lower.length - target.length) {
      const at = lower.indexOf(target, from);
      if (at === -1) break;
      const end = at + target.length;
      const boundaryOk =
        !(isWordChar(target[0]) && isWordChar(text[at - 1])) &&
        !(isWordChar(target[target.length - 1]) && isWordChar(text[end]));
      let free = boundaryOk;
      for (let i = at; free && i < end; i++) if (taken[i]) free = false;
      if (free) {
        for (let i = at; i < end; i++) taken[i] = true;
        marks.push({ start: at, end, kind: needle.kind });
      }
      from = at + 1;
    }
  }

  marks.sort((a, b) => a.start - b.start);
  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start > cursor)
      out.push({ text: text.slice(cursor, m.start), kind: "plain" });
    out.push({ text: text.slice(m.start, m.end), kind: m.kind });
    cursor = m.end;
  }
  if (cursor < text.length)
    out.push({ text: text.slice(cursor), kind: "plain" });
  return out;
}
