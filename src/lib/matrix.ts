/**
 * Mise en forme de la matrice HLA × complication pour l'affichage.
 *
 * Module PUR, sans acces base : la page serveur lit `getAssociationMatrix()`,
 * retire les metriques brutes (`toClientMatrix`), et le composant client
 * re-forme la grille a chaque changement de tri ou de filtre
 * (`buildMatrixView`). Teste dans `src/__tests__/matrix.test.ts`.
 *
 * TROIS ETATS DE CASE, jamais confondus :
 *  - `null`          : la paire n'est JAMAIS co-mentionnee dans le corpus ;
 *  - `visible: false`: la paire existe, mais son niveau est decoche par le
 *                      lecteur (masquee de la VUE, pas du corpus) ;
 *  - `visible: true` : la paire est dessinee.
 */

import type {
  AssociationMatrix,
  MatrixAllele,
  MatrixOutcome,
  SignalLevel,
} from "./types";
import { categoryDisplay } from "./theme";

/** Case transmise au client : AUCUNE metrique brute (ni NPMI, ni OR, ni p). */
export interface ClientMatrixCell {
  hla: string;
  outcome: string;
  signalLevel: SignalLevel;
  isSignificant: boolean;
  nCooccurrence: number;
  nNegated: number;
}

export interface ClientMatrix {
  resolution: "2-digit" | "4-digit";
  /** Locus affiche (null : tous les loci). */
  locus?: string | null;
  /** Loci disponibles a cette resolution, pour le selecteur. */
  loci?: { locus: string; n: number }[];
  alleles: MatrixAllele[];
  outcomes: MatrixOutcome[];
  cells: ClientMatrixCell[];
}

/**
 * Retire les metriques brutes avant de serialiser vers le navigateur. La
 * regle epistemique interdit de les AFFICHER ; on evite en plus de les
 * expedier dans la charge utile de la page, ou un « afficher le source » les
 * exhiberait sans leur mise en garde.
 */
export function toClientMatrix(m: AssociationMatrix): ClientMatrix {
  return {
    resolution: m.resolution,
    locus: m.locus ?? null,
    loci: m.loci ?? [],
    alleles: m.alleles,
    outcomes: m.outcomes,
    cells: m.cells.map((c) => ({
      hla: c.hla,
      outcome: c.outcome,
      signalLevel: c.signalLevel,
      isSignificant: c.isSignificant,
      nCooccurrence: c.nCooccurrence,
      nNegated: c.nNegated,
    })),
  };
}

export type MatrixSort = "locus" | "mentions" | "signal";

export const MATRIX_SORTS: { value: MatrixSort; label: string }[] = [
  { value: "locus", label: "Par locus" },
  { value: "mentions", label: "Par mentions" },
  { value: "signal", label: "Par signaux marqués" },
];

export interface MatrixCellSlot {
  cell: ClientMatrixCell;
  visible: boolean;
}

export interface MatrixRowView {
  allele: MatrixAllele;
  /** Aligne sur `columns` ; `null` = jamais co-mentionne. */
  slots: (MatrixCellSlot | null)[];
  /** Cases presentes (co-mentions existantes), filtre ou non. */
  nPresent: number;
  /** Cases visibles apres filtre. */
  nVisible: number;
  /** Cases a signal marque (tout sauf `weak`). */
  nMarked: number;
}

export interface MatrixRowGroup {
  key: string;
  label: string;
  hlaClass: string;
  rows: MatrixRowView[];
}

export interface MatrixColumnGroup {
  category: string;
  label: string;
  span: number;
}

export interface MatrixView {
  columns: MatrixOutcome[];
  columnGroups: MatrixColumnGroup[];
  rowGroups: MatrixRowGroup[];
  /** Plus grand effectif d'articles d'une case (echelle de taille). */
  maxCount: number;
  /** Nombre de cases presentes par niveau (avant filtre). */
  levelCounts: Record<SignalLevel, number>;
  nRows: number;
  nHiddenRows: number;
}

export interface MatrixViewOptions {
  sort?: MatrixSort;
  levels?: ReadonlySet<SignalLevel>;
  hideEmptyRows?: boolean;
}

const MARKED: ReadonlySet<SignalLevel> = new Set([
  "inverse",
  "strong",
  "clear",
  "moderate",
]);

/** Libelle de groupe de lignes : « Classe I · locus A ». */
export function locusGroupLabel(allele: MatrixAllele): string {
  const cls = allele.hlaClass === "I" || allele.hlaClass === "II"
    ? `Classe ${allele.hlaClass}`
    : "Classe non précisée";
  const locus =
    allele.locus || (allele.hla.replace(/^HLA-/, "").split("*")[0] ?? "");
  return `${cls} · HLA-${locus}`;
}

export function buildMatrixView(
  matrix: ClientMatrix,
  { sort = "locus", levels, hideEmptyRows = false }: MatrixViewOptions = {},
): MatrixView {
  const columns = matrix.outcomes;
  const colIndex = new Map(columns.map((o, i) => [o.outcome, i]));

  const levelCounts: Record<SignalLevel, number> = {
    inverse: 0,
    strong: 0,
    clear: 0,
    moderate: 0,
    weak: 0,
  };
  let maxCount = 0;

  const byAllele = new Map<string, ClientMatrixCell[]>();
  for (const c of matrix.cells) {
    if (!colIndex.has(c.outcome)) continue;
    levelCounts[c.signalLevel] += 1;
    maxCount = Math.max(maxCount, c.nCooccurrence);
    const list = byAllele.get(c.hla);
    if (list) list.push(c);
    else byAllele.set(c.hla, [c]);
  }

  const rows: MatrixRowView[] = matrix.alleles.map((allele) => {
    const slots: (MatrixCellSlot | null)[] = columns.map(() => null);
    let nVisible = 0;
    let nMarked = 0;
    const cells = byAllele.get(allele.hla) ?? [];
    for (const cell of cells) {
      const visible = levels ? levels.has(cell.signalLevel) : true;
      slots[colIndex.get(cell.outcome)!] = { cell, visible };
      if (visible) nVisible += 1;
      if (MARKED.has(cell.signalLevel)) nMarked += 1;
    }
    return { allele, slots, nPresent: cells.length, nVisible, nMarked };
  });

  const kept = hideEmptyRows ? rows.filter((r) => r.nVisible > 0) : rows;

  let rowGroups: MatrixRowGroup[];
  if (sort === "locus") {
    // L'ordre de la requete (classe, locus, allele) est conserve.
    rowGroups = [];
    for (const row of kept) {
      const label = locusGroupLabel(row.allele);
      const last = rowGroups[rowGroups.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else {
        rowGroups.push({
          key: label,
          label,
          hlaClass: row.allele.hlaClass,
          rows: [row],
        });
      }
    }
  } else {
    const sorted = [...kept].sort((a, b) =>
      sort === "mentions"
        ? b.allele.nMentions - a.allele.nMentions ||
          a.allele.hla.localeCompare(b.allele.hla)
        : b.nMarked - a.nMarked ||
          b.allele.nMentions - a.allele.nMentions ||
          a.allele.hla.localeCompare(b.allele.hla),
    );
    rowGroups = [
      {
        key: sort,
        label:
          sort === "mentions"
            ? "Tous les allèles · par mentions"
            : "Tous les allèles · par signaux marqués",
        hlaClass: "",
        rows: sorted,
      },
    ];
  }

  const columnGroups: MatrixColumnGroup[] = [];
  for (const o of columns) {
    const last = columnGroups[columnGroups.length - 1];
    if (last && last.category === o.category) last.span += 1;
    else {
      columnGroups.push({
        category: o.category,
        label: categoryDisplay(o.category),
        span: 1,
      });
    }
  }

  return {
    columns,
    columnGroups,
    rowGroups,
    maxCount,
    levelCounts,
    nRows: kept.length,
    nHiddenRows: rows.length - kept.length,
  };
}
