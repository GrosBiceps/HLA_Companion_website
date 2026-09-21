/**
 * Garde-fou vocabulaire — transforme la regle epistemique de la spec (§3, §6)
 * en test executable : aucun terme causal, aucune cle technique brute ne doit
 * atteindre le texte visible de l'interface.
 *
 * DECISION DE CADRAGE (ruling du controleur) : le scan porte sur le TEXTE
 * VISIBLE, et les commentaires sont RETIRES avant analyse. Sans cela, on
 * interdirait d'ecrire *a propos* du vocabulaire proscrit dans les
 * commentaires explicatifs — exactement la documentation dont le projet a
 * besoin. Un implementeur anterieur avait deja du renommer un commentaire
 * pour contourner un scan naif ; on ne veut plus de cette contorsion.
 *
 * NON-OBJECTIF : ce fichier ne construit pas un parseur JSX. Cela a ete juge
 * disproportionne pour un prototype. Le retrait des commentaires est
 * heuristique (regex), avec les limites documentees sur `stripComments`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { OUTCOME_LABELS } from "../lib/labels";

/**
 * Formulations causales proscrites (spec §6). Comparaison en minuscules.
 *
 * NOTE sur "cause" / "causé" : le brief les mentionne, mais ils sont exclus
 * de cette liste, volontairement. "cause" apparait legitimement dans des
 * tournures non causales du francais courant ("à cause de" est causal, mais
 * "mise en cause", "en cause" ne le sont pas) et surtout dans le libelle
 * epistemique lui-meme, qui doit pouvoir dire "ne sont pas des associations
 * causales". Interdire la sous-chaine "cause" rendrait impossible d'ECRIRE
 * l'avertissement epistemique. On interdit donc les tournures assertives
 * ("provoque", "predit", "entraine") plutot que le radical.
 */
const FORBIDDEN_PHRASES = [
  "associé à",
  "associée à",
  "associés à",
  "associées à",
  "lié à",
  "liée à",
  "liés à",
  "liées à",
  "risque de",
  "prédit",
  "predit",
  "provoque",
  "entraîne",
  "entraine",
  "à cause de",
  "responsable de",
];

/** Cles techniques du pipeline : les 21 entrees de OUTCOME_LABELS. */
const RAW_KEYS = Object.keys(OUTCOME_LABELS);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      out.push(...walk(p));
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Retire les commentaires avant analyse : `{/* ... *\/}` (JSX), `/* ... *\/`
 * (bloc) et `// ...` (ligne).
 *
 * LIMITES CONNUES, assumees a l'echelle d'un prototype :
 *  - une sequence `//` ou `/*` a l'interieur d'une chaine de caracteres
 *    (ex. une URL "https://...") declenche un retrait excessif jusqu'a la fin
 *    de la ligne. Consequence : on peut MANQUER une violation, jamais en
 *    inventer une. Un faux negatif est acceptable ; un faux positif qui
 *    forcerait a tordre le code ne le serait pas.
 *  - les commentaires a l'interieur de litteraux de gabarit (template
 *    strings) sont traites comme des commentaires.
 * Le remplacement se fait par un espace (et non par du vide) pour ne pas
 * souder deux fragments de texte qui n'etaient pas contigus.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/**
 * Extrait le texte JSX visible : les fragments entre `>` et `<` qui ne
 * contiennent ni accolade (interpolation) ni chevron.
 *
 * On conserve l'heuristique du brief, deliberement : elle est stricte (elle
 * ignore le texte passe en prop, ex. `title="..."`, et le texte interpole),
 * donc elle peut manquer des violations, mais elle n'en invente pas. Pour un
 * garde-fou destine a etre execute a chaque commit par des contributeurs
 * futurs, un faux positif coute plus cher qu'un faux negatif : il pousse a
 * deformer le code pour satisfaire le test.
 */
export function visibleText(source: string): string {
  const matches = stripComments(source).match(/>[^<>{}]+</g) ?? [];
  return matches.join(" ").toLowerCase();
}

const SRC = join(process.cwd(), "src");

describe("garde-fou vocabulaire", () => {
  const files = walk(SRC);
  const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, "/");

  it("trouve des fichiers a analyser", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("aucun terme causal dans le texte visible", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = visibleText(readFileSync(f, "utf-8"));
      for (const term of FORBIDDEN_PHRASES) {
        if (text.includes(term)) offenders.push(`${rel(f)}: "${term}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("aucune des 21 cles techniques affichee en dur", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // labels.ts EST la table de correspondance : les cles y sont des cles
      // d'objet, jamais du texte visible.
      if (f.endsWith("labels.ts")) continue;
      const text = visibleText(readFileSync(f, "utf-8"));
      for (const key of RAW_KEYS) {
        if (text.includes(key.toLowerCase())) offenders.push(`${rel(f)}: "${key}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("couvre bien les 21 cles du pipeline, pas seulement les exemples", () => {
    expect(RAW_KEYS.length).toBe(21);
  });
});

/**
 * Second volet du garde-fou : les fuites par INTERPOLATION.
 *
 * Le scan de texte visible ci-dessus est structurellement aveugle a
 * `{maVariable}` — or c'est precisement par la qu'une cle technique atteint
 * l'ecran. Une violation reelle a ete trouvee par cette voie dans
 * `article/[pmid]/page.tsx` (`clinical?.label ?? outcome`, qui affichait
 * `graft_loss` des que la table `outcomes` ne connaissait pas la cle).
 *
 * On ne construit pas d'analyse de flot de donnees : on interdit le motif
 * syntaxique « retomber sur la cle technique » la ou un libelle est attendu.
 */
describe("garde-fou interpolation : pas de repli sur la cle technique", () => {
  const files = walk(SRC);
  const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, "/");

  it("aucun `?? outcome` ne sert de libelle affichable", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // queries.ts : `outcomeSpan: row.outcome_span ?? row.outcome` est un
      // repli LEGITIME et documente — ce span sert d'aiguille de surlignage
      // dans la phrase source, il n'est jamais rendu comme libelle autonome.
      if (f.endsWith("queries.ts")) continue;
      const src = stripComments(readFileSync(f, "utf-8"));
      const re = /\b(?:label|libelle)\b[^\n;]*\?\?\s*[\w.]*\boutcome\b/g;
      for (const m of src.match(re) ?? []) {
        offenders.push(`${rel(f)}: ${m.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("le retrait des commentaires", () => {
  it("neutralise un commentaire JSX contenant du vocabulaire proscrit", () => {
    const src = `<p>{/* on n'ecrit jamais "associé à" ici */}Co-occurrence</p>`;
    expect(visibleText(src)).not.toContain("associé à");
    expect(visibleText(src)).toContain("co-occurrence");
  });

  it("neutralise un commentaire de ligne et de bloc", () => {
    expect(visibleText(`// associé à\n<p>ok</p>`)).not.toContain("associé à");
    expect(visibleText(`/* lié à */\n<p>ok</p>`)).not.toContain("lié à");
  });

  it("attrape toujours une vraie violation dans le texte visible", () => {
    expect(visibleText(`<p>HLA-A*01:01 est associé à un rejet</p>`)).toContain(
      "associé à",
    );
  });
});
