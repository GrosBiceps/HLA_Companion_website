/**
 * Requetes du referentiel serologique — SERVEUR UNIQUEMENT (cf. db.ts).
 *
 * Les specificites serologiques (A2, B27, DR15, DQ2, Cw7...) viennent de
 * `data/reference/hla_serotypes.csv`, projetee par le builder dans
 * `serotypes` / `serotype_alleles`. Ce n'est PAS une extraction NLP : c'est
 * une table de correspondance, exposee ici pour naviguer entre notations.
 * Les effectifs, eux, sont ceux du corpus (articles distincts qui mentionnent
 * au moins l'un des alleles du serotype).
 */

import { getDb } from "./db";
import type {
  AlleleSerotype,
  Serotype,
  SerotypeCatalogEntry,
  SerotypeKind,
  SerotypeMember,
  SerotypeOutcome,
  SignalLevel,
} from "./types";

interface SerotypeRow {
  serotype_id: string;
  locus: string;
  label: string;
  broad_serotype: string | null;
  kind: SerotypeKind;
  note: string | null;
}

const SEROTYPE_COLUMNS =
  "s.serotype_id, s.locus, s.label, s.broad_serotype, s.kind, s.note";

/** Ordre d'affichage des loci serologiques. */
export const SEROTYPE_LOCI = ["A", "B", "C", "DR", "DQ", "DP"] as const;

export const SEROTYPE_LOCUS_LABELS: Record<string, string> = {
  A: "HLA-A",
  B: "HLA-B",
  C: "HLA-C (Cw)",
  DR: "HLA-DR",
  DQ: "HLA-DQ",
  DP: "HLA-DP (DPw)",
};

function toSerotype(row: SerotypeRow): Serotype {
  return {
    serotypeId: row.serotype_id,
    locus: row.locus,
    label: row.label,
    broadSerotype: row.broad_serotype,
    kind: row.kind,
    note: row.note,
  };
}

/** Tri naturel : A2 avant A10, DR4 avant DR15, Cw3 avant Cw10. */
export function compareSerotypeIds(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

function locusRank(locus: string): number {
  const i = (SEROTYPE_LOCI as readonly string[]).indexOf(locus);
  return i === -1 ? SEROTYPE_LOCI.length : i;
}

export function getSerotype(serotypeId: string): Serotype | null {
  const row = getDb()
    .prepare(
      `SELECT ${SEROTYPE_COLUMNS} FROM serotypes s WHERE s.serotype_id = ?`,
    )
    .get(serotypeId) as SerotypeRow | undefined;
  return row ? toSerotype(row) : null;
}

/** Specificites plus fines d'une famille large (vide pour les autres). */
export function getSerotypeChildren(serotypeId: string): Serotype[] {
  const rows = getDb()
    .prepare(
      `SELECT ${SEROTYPE_COLUMNS} FROM serotypes s
        WHERE s.broad_serotype = ?`,
    )
    .all(serotypeId) as SerotypeRow[];
  return rows
    .map(toSerotype)
    .sort((a, b) => compareSerotypeIds(a.serotypeId, b.serotypeId));
}

/**
 * Toutes les specificites, avec leurs effectifs dans le corpus : groupes et
 * alleles lies, articles distincts. Trois requetes, jointes en memoire
 * (~130 lignes).
 */
export function getSerotypeCatalog(): SerotypeCatalogEntry[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT ${SEROTYPE_COLUMNS} FROM serotypes s`)
    .all() as SerotypeRow[];
  const counts = new Map(
    (
      db
        .prepare(
          `SELECT sa.serotype_id AS id,
                  SUM(h.resolution = '2-digit') AS n_groups,
                  SUM(h.resolution = '4-digit') AS n_alleles
             FROM serotype_alleles sa
             JOIN hla_entities h ON h.hla = sa.hla
            GROUP BY sa.serotype_id`,
        )
        .all() as { id: string; n_groups: number; n_alleles: number }[]
    ).map((r) => [r.id, r]),
  );
  const articles = new Map(
    (
      db
        .prepare(
          `SELECT sa.serotype_id AS id, COUNT(DISTINCT hm.pmid) AS n
             FROM serotype_alleles sa
             JOIN hla_mentions hm ON hm.hla = sa.hla
            GROUP BY sa.serotype_id`,
        )
        .all() as { id: string; n: number }[]
    ).map((r) => [r.id, r.n]),
  );
  return rows
    .map((row) => ({
      ...toSerotype(row),
      nGroups: counts.get(row.serotype_id)?.n_groups ?? 0,
      nAlleles: counts.get(row.serotype_id)?.n_alleles ?? 0,
      nArticles: articles.get(row.serotype_id) ?? 0,
    }))
    .sort(
      (a, b) =>
        locusRank(a.locus) - locusRank(b.locus) ||
        compareSerotypeIds(a.serotypeId, b.serotypeId),
    );
}

/**
 * Alleles d'un serotype (groupes 2-digit ET alleles 4-digit), avec leurs
 * effectifs. Tri : groupes d'abord, puis nomenclature naturelle.
 */
export function getSerotypeMembers(serotypeId: string): SerotypeMember[] {
  const rows = getDb()
    .prepare(
      `SELECT sa.hla, h.resolution, h.parent_hla, sa.via,
              (SELECT COUNT(DISTINCT hm.pmid) FROM hla_mentions hm
                WHERE hm.hla = sa.hla) AS n_articles,
              (SELECT COUNT(*) FROM associations a
                WHERE a.hla = sa.hla) AS n_outcomes,
              (SELECT COUNT(*) FROM associations a
                WHERE a.hla = sa.hla AND a.signal_level <> 'weak') AS n_marked
         FROM serotype_alleles sa
         JOIN hla_entities h ON h.hla = sa.hla
        WHERE sa.serotype_id = ?`,
    )
    .all(serotypeId) as {
    hla: string;
    resolution: string;
    parent_hla: string | null;
    via: SerotypeMember["via"];
    n_articles: number;
    n_outcomes: number;
    n_marked: number;
  }[];
  return rows
    .map(
      (r): SerotypeMember => ({
        hla: r.hla,
        resolution: r.resolution,
        parentHla: r.parent_hla,
        via: r.via,
        nArticles: r.n_articles,
        nOutcomes: r.n_outcomes,
        nMarked: r.n_marked,
      }),
    )
    .sort((a, b) =>
      a.hla.localeCompare(b.hla, "en", { numeric: true }),
    );
}

/** Specificites portees par un allele (2-digit : y compris par ses enfants). */
export function getSerotypesForAllele(hla: string): AlleleSerotype[] {
  const db = getDb();
  const entity = db
    .prepare(`SELECT resolution FROM hla_entities WHERE hla = ?`)
    .get(hla) as { resolution: string } | undefined;
  if (!entity) return [];

  let rows: {
    serotype_id: string;
    kind: SerotypeKind;
    broad_serotype: string | null;
    direct: number;
  }[];
  if (entity.resolution === "2-digit") {
    rows = db
      .prepare(
        `SELECT s.serotype_id, s.kind, s.broad_serotype,
                MAX(sa.hla = ?) AS direct
           FROM serotype_alleles sa
           JOIN serotypes s ON s.serotype_id = sa.serotype_id
          WHERE sa.hla = ?
             OR sa.hla IN (SELECT hla FROM hla_entities WHERE parent_hla = ?)
          GROUP BY s.serotype_id`,
      )
      .all(hla, hla, hla) as typeof rows;
  } else if (entity.resolution === "4-digit") {
    rows = db
      .prepare(
        `SELECT s.serotype_id, s.kind, s.broad_serotype, 1 AS direct
           FROM serotype_alleles sa
           JOIN serotypes s ON s.serotype_id = sa.serotype_id
          WHERE sa.hla = ?`,
      )
      .all(hla) as typeof rows;
  } else {
    return [];
  }

  return rows
    .map(
      (r): AlleleSerotype => ({
        serotypeId: r.serotype_id,
        kind: r.kind,
        broadSerotype: r.broad_serotype,
        partial: r.direct === 0,
      }),
    )
    .sort(
      (a, b) =>
        Number(a.kind === "broad") - Number(b.kind === "broad") ||
        compareSerotypeIds(a.serotypeId, b.serotypeId),
    );
}

const LEVEL_RANK: Record<SignalLevel, number> = {
  inverse: 0,
  strong: 1,
  clear: 2,
  moderate: 3,
  weak: 4,
};

/**
 * Complications co-mentionnees avec au moins un allele du serotype, par
 * nombre d'articles distincts decroissant. Pas de statistique au niveau du
 * serotype : ce sont des effectifs, et le niveau de signal le plus marque
 * parmi les alleles membres (qualitatif).
 */
export function getSerotypeOutcomes(serotypeId: string): SerotypeOutcome[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.outcome, o.label, o.category,
              COUNT(DISTINCT pm.pmid) AS n_articles,
              COUNT(DISTINCT pm.hla) AS n_alleles
         FROM pair_mentions pm
         JOIN outcomes o ON o.outcome = pm.outcome
        WHERE pm.hla IN
              (SELECT hla FROM serotype_alleles WHERE serotype_id = ?)
        GROUP BY o.outcome
        ORDER BY n_articles DESC, o.label ASC`,
    )
    .all(serotypeId) as {
    outcome: string;
    label: string;
    category: string;
    n_articles: number;
    n_alleles: number;
  }[];
  const levels = db
    .prepare(
      `SELECT a.outcome, a.signal_level
         FROM associations a
        WHERE a.hla IN
              (SELECT hla FROM serotype_alleles WHERE serotype_id = ?)`,
    )
    .all(serotypeId) as { outcome: string; signal_level: SignalLevel }[];
  const top = new Map<string, SignalLevel>();
  for (const l of levels) {
    const cur = top.get(l.outcome);
    if (!cur || LEVEL_RANK[l.signal_level] < LEVEL_RANK[cur]) {
      top.set(l.outcome, l.signal_level);
    }
  }
  return rows.map(
    (r): SerotypeOutcome => ({
      outcome: r.outcome,
      label: r.label,
      category: r.category,
      nArticles: r.n_articles,
      nAlleles: r.n_alleles,
      topLevel: top.get(r.outcome) ?? "weak",
    }),
  );
}

/** Nombre de specificites du referentiel projete (0 si la table est vide). */
export function getSerotypeCount(): number {
  return (
    getDb().prepare(`SELECT COUNT(*) AS n FROM serotypes`).get() as {
      n: number;
    }
  ).n;
}

/**
 * Alleles LISTES explicitement pour chaque specificite (`via = direct`), du
 * plus au moins fin : « DR15 » -> [HLA-DRB1*15], « DQ8 » -> [HLA-DQB1*03:02].
 * Sert a l'affichage d'un apercu et au filtre de l'index.
 */
export function getSerotypeDirectAlleles(): Map<string, string[]> {
  const rows = getDb()
    .prepare(
      `SELECT serotype_id AS id, hla FROM serotype_alleles
        WHERE via = 'direct' ORDER BY serotype_id, hla`,
    )
    .all() as { id: string; hla: string }[];
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.id) ?? [];
    list.push(r.hla);
    out.set(r.id, list);
  }
  return out;
}

/**
 * Retrouve une specificite depuis une graphie approximative de la route
 * (`/serotype/dr15`, `/serotype/c7`) : renvoie sa cle canonique, ou null.
 */
export function resolveSerotypeKey(raw: string): string | null {
  const catalog = getSerotypeCatalog();
  const wanted = raw.replace(/[\s._*:-]+/g, "").toUpperCase();
  const keys = [wanted];
  const m = /^(C|DP)(\d+)$/.exec(wanted);
  if (m) keys.push(`${m[1]}W${m[2]}`);
  for (const key of keys) {
    const hit = catalog.find((s) => s.serotypeId.toUpperCase() === key);
    if (hit) return hit.serotypeId;
  }
  return null;
}

/**
 * Serotypes de chaque entite, pour l'index des alleles : `specific` (hors
 * familles larges) et `broad`. Un groupe 2-digit ne porte que ses liens
 * PROPRES ; un 4-digit porte aussi ceux herites de son groupe (cf. `via`).
 */
export function getSerotypeIdsByAllele(): Map<
  string,
  { specific: string[]; broad: string[] }
> {
  const rows = getDb()
    .prepare(
      `SELECT sa.hla, s.serotype_id AS id, s.kind
         FROM serotype_alleles sa
         JOIN serotypes s ON s.serotype_id = sa.serotype_id
        ORDER BY sa.hla, s.serotype_id`,
    )
    .all() as { hla: string; id: string; kind: SerotypeKind }[];
  const out = new Map<string, { specific: string[]; broad: string[] }>();
  for (const r of rows) {
    const entry = out.get(r.hla) ?? { specific: [], broad: [] };
    (r.kind === "broad" ? entry.broad : entry.specific).push(r.id);
    out.set(r.hla, entry);
  }
  for (const entry of out.values()) {
    entry.specific.sort(compareSerotypeIds);
    entry.broad.sort(compareSerotypeIds);
  }
  return out;
}
