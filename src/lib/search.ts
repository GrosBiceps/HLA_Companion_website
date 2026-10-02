/**
 * Recherche unifiee — SERVEUR UNIQUEMENT (cf. db.ts).
 *
 * Deux voies complementaires, fusionnees en une liste GROUPEE PAR TYPE
 * (Allele, Serotype, Complication, Article, Auteur) :
 *
 *  1. une lecture STRUCTUREE de la saisie (`hla-query.ts`) : « a02 »,
 *     « A*02 », « DQB1 02 01 », « DR 15 », « B27 », « Cw7 », « DRB1 » sont
 *     resolus directement contre les tables `hla_entities` et `serotypes`,
 *     quels que soient la casse, les separateurs ou l'absence de `*` et `:` ;
 *  2. l'index plein texte FTS5, pour les complications, articles et auteurs
 *     (et, en dernier recours, pour tout ce que la lecture structuree n'a pas
 *     reconnu).
 *
 * Un resultat « groupe » (2-digit) ou « serotype » est suivi de ses resultats
 * ENFANTS (alleles 4-digit du groupe, alleles du serotype), marques
 * `childOf` : c'est ainsi que la recherche « offre » le passage du 2-digit
 * au 4-digit, ou d'un serotype a ses alleles.
 */

import type Database from "better-sqlite3";
import { getDb } from "./db";
import {
  parseAlleleQuery,
  serotypeKeys,
  type AlleleQuery,
} from "./hla-query";
import {
  getSerotypeCatalog,
  getSerotypeChildren,
  getSerotypeMembers,
  getSerotypesForAllele,
} from "./serotypes";
import type {
  EntityType,
  SearchHit,
  SerotypeCatalogEntry,
} from "./types";

// --------------------------------------------------------------------------
// FTS5
// --------------------------------------------------------------------------

/**
 * Echappe une saisie utilisateur pour MATCH FTS5.
 *
 * FTS5 possede sa propre syntaxe (`"`, `*`, `:`, `-`, `NEAR`, `OR`...) : une
 * chaine brute comme `"; DROP TABLE articles; --` provoque une erreur de
 * syntaxe qui ferait planter la page. On neutralise tout en emballant chaque
 * jeton dans des guillemets doubles (chaine litterale FTS5), les guillemets
 * internes etant doubles.
 *
 * La base est ouverte en lecture seule : aucune injection ne peut ecrire.
 * Le risque traite ici est la levee d'exception, pas la modification.
 *
 * Les caracteres de controle sont retires EN PREMIER : un NUL survivrait au
 * filtre alphanumerique (`"\0x"` contient bien une lettre) mais tronquerait
 * la chaine C cote SQLite, emportant le guillemet fermant — d'ou une erreur
 * "unterminated string" atteignable depuis `?q=%00x`.
 */
export function escapeFtsQuery(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/\p{C}/gu, "").trim())
    .filter((t) => t.length > 0)
    // On retire la ponctuation pure : `--` ou `;` seuls ne sont pas des
    // termes recherchables et produiraient des tokens vides cote FTS5.
    .filter((t) => /[\p{L}\p{N}]/u.test(t));

  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

interface SearchHitRow {
  entity_type: EntityType;
  entity_id: string;
  label: string;
}

// --------------------------------------------------------------------------
// Index en memoire des alleles et serotypes (base en lecture seule : ~1 000
// lignes, construit une fois par handle).
// --------------------------------------------------------------------------

interface AlleleRec {
  hla: string;
  locus: string;
  resolution: string;
  parent: string | null;
  nArticles: number;
}

interface SearchIndex {
  byHla: Map<string, AlleleRec>;
  /** Enfants 4-digit d'un 2-digit, du plus cite au moins cite. */
  childrenOf: Map<string, AlleleRec[]>;
  /** Groupes 2-digit d'un locus, du plus cite au moins cite. */
  groupsOf: Map<string, AlleleRec[]>;
  serotypes: SerotypeCatalogEntry[];
  serotypeByKey: Map<string, SerotypeCatalogEntry>;
}

const indexCache = new WeakMap<Database.Database, SearchIndex>();

function byCitations(a: AlleleRec, b: AlleleRec): number {
  return (
    b.nArticles - a.nArticles ||
    a.hla.localeCompare(b.hla, "en", { numeric: true })
  );
}

function getIndex(db: Database.Database): SearchIndex {
  const cached = indexCache.get(db);
  if (cached) return cached;

  const counts = new Map(
    (
      db
        .prepare(
          `SELECT hla, COUNT(DISTINCT pmid) AS n FROM hla_mentions GROUP BY hla`,
        )
        .all() as { hla: string; n: number }[]
    ).map((r) => [r.hla, r.n]),
  );
  const rows = db
    .prepare(
      `SELECT hla, locus, resolution, parent_hla
         FROM hla_entities
        WHERE resolution IN ('class', '2-digit', '4-digit')`,
    )
    .all() as {
    hla: string;
    locus: string;
    resolution: string;
    parent_hla: string | null;
  }[];

  const byHla = new Map<string, AlleleRec>();
  const childrenOf = new Map<string, AlleleRec[]>();
  const groupsOf = new Map<string, AlleleRec[]>();
  for (const r of rows) {
    const rec: AlleleRec = {
      hla: r.hla,
      locus: r.locus,
      resolution: r.resolution,
      parent: r.parent_hla,
      nArticles: counts.get(r.hla) ?? 0,
    };
    byHla.set(r.hla, rec);
    if (rec.resolution === "4-digit" && rec.parent) {
      const list = childrenOf.get(rec.parent) ?? [];
      list.push(rec);
      childrenOf.set(rec.parent, list);
    } else if (rec.resolution === "2-digit") {
      const list = groupsOf.get(rec.locus) ?? [];
      list.push(rec);
      groupsOf.set(rec.locus, list);
    }
  }
  for (const list of childrenOf.values()) list.sort(byCitations);
  for (const list of groupsOf.values()) list.sort(byCitations);

  // Un corpus construit avant l'ajout du referentiel serologique n'a pas ces
  // tables : la recherche d'alleles doit continuer de fonctionner.
  let serotypes: SerotypeCatalogEntry[] = [];
  try {
    serotypes = getSerotypeCatalog();
  } catch {
    serotypes = [];
  }
  const serotypeByKey = new Map(
    serotypes.map((s) => [s.serotypeId.toUpperCase(), s]),
  );

  const index = { byHla, childrenOf, groupsOf, serotypes, serotypeByKey };
  indexCache.set(db, index);
  return index;
}

// --------------------------------------------------------------------------
// Fabrication des resultats
// --------------------------------------------------------------------------

/** Nombre maximal d'enfants proposes sous un resultat parent. */
const MAX_CHILDREN = 6;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n > 1 ? many : one}`;
}

function alleleHit(rec: AlleleRec, index: SearchIndex, childOf?: string): SearchHit {
  const children = index.childrenOf.get(rec.hla) ?? [];
  let badge: string;
  let detail: string;
  if (rec.resolution === "class") {
    badge = "Locus";
    const groups = index.groupsOf.get(rec.hla) ?? [];
    detail = `${plural(groups.length, "groupe")} 2-digit`;
  } else if (rec.resolution === "2-digit") {
    badge = "2-digit";
    detail =
      children.length > 0
        ? `${plural(children.length, "allèle")} 4-digit · ${plural(rec.nArticles, "article")}`
        : plural(rec.nArticles, "article");
  } else {
    badge = "4-digit";
    detail = plural(rec.nArticles, "article");
  }
  return {
    entityType: "allele",
    entityId: rec.hla,
    label: rec.hla,
    badge,
    detail,
    nArticles: rec.nArticles,
    ...(childOf ? { childOf } : {}),
  };
}

const KIND_BADGE: Record<string, string> = {
  specific: "Sérotype",
  broad: "Famille large",
  associated: "Sérotype associé",
  cellular: "Sérotype (DPw)",
};

function serotypeHit(
  s: SerotypeCatalogEntry,
  childOf?: string,
  detailOverride?: string,
): SearchHit {
  const parts: string[] = [];
  if (s.broadSerotype) parts.push(`famille ${s.broadSerotype}`);
  parts.push(plural(s.nGroups + s.nAlleles, "allèle"));
  parts.push(plural(s.nArticles, "article"));
  return {
    entityType: "serotype",
    entityId: s.serotypeId,
    label: s.label,
    badge: KIND_BADGE[s.kind] ?? "Sérotype",
    detail: detailOverride ?? parts.join(" · "),
    nArticles: s.nArticles,
    ...(childOf ? { childOf } : {}),
  };
}

/** Lecture allelique : groupe, 4-digit, locus. Retourne les resultats ordonnes. */
function alleleResults(q: AlleleQuery, index: SearchIndex): SearchHit[] {
  const hits: SearchHit[] = [];

  if (q.group === null) {
    const locus = index.byHla.get(q.locus);
    if (!locus) return hits;
    hits.push(alleleHit(locus, index));
    for (const g of (index.groupsOf.get(q.locus) ?? []).slice(0, MAX_CHILDREN)) {
      hits.push(alleleHit(g, index, locus.hla));
    }
    return hits;
  }

  const groupKey = `HLA-${q.locus}*${q.group}`;
  const group = index.byHla.get(groupKey);

  if (q.field === null) {
    if (!group) return hits;
    hits.push(alleleHit(group, index));
    for (const c of (index.childrenOf.get(group.hla) ?? []).slice(0, MAX_CHILDREN)) {
      hits.push(alleleHit(c, index, group.hla));
    }
    return hits;
  }

  if (q.fieldPartial) {
    // « A*02:0 » : alleles du groupe dont le second champ commence ainsi.
    if (group) hits.push(alleleHit(group, index));
    const prefix = `${groupKey}:${q.field}`;
    const matching = (index.childrenOf.get(groupKey) ?? []).filter((c) =>
      c.hla.startsWith(prefix),
    );
    for (const c of matching.slice(0, MAX_CHILDREN + 4)) {
      hits.push(alleleHit(c, index, group?.hla));
    }
    return hits;
  }

  const exact = index.byHla.get(`${groupKey}:${q.field.padStart(2, "0")}`);
  if (exact) hits.push(alleleHit(exact, index));
  if (group) {
    // Le groupe parent : navigation du 4-digit vers le 2-digit.
    const parent = alleleHit(group, index);
    parent.detail = `groupe 2-digit parent · ${parent.detail}`;
    hits.push(parent);
  }
  return hits;
}

/** Specificites dont la cle egale, ou commence par, la saisie. */
function serotypeMatches(
  raw: string,
  index: SearchIndex,
): { exact: SerotypeCatalogEntry[]; prefix: SerotypeCatalogEntry[] } {
  const keys = serotypeKeys(raw);
  const exact: SerotypeCatalogEntry[] = [];
  const prefix: SerotypeCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const hit = index.serotypeByKey.get(key);
    if (hit && !seen.has(hit.serotypeId)) {
      seen.add(hit.serotypeId);
      exact.push(hit);
    }
  }
  // Un serotype reconnu tel quel (« A2 ») n'appelle pas ses voisins par
  // prefixe (A23, A24...) ; la completion ne sert que sans correspondance.
  for (const key of keys) {
    if (key.length < 2 || exact.length > 0) continue;
    for (const s of index.serotypes) {
      if (seen.has(s.serotypeId)) continue;
      if (s.serotypeId.toUpperCase().startsWith(key)) {
        seen.add(s.serotypeId);
        prefix.push(s);
      }
    }
  }
  return { exact, prefix };
}

/** Alleles d'un serotype a proposer : groupes listes d'abord, puis les plus cites. */
function serotypeChildren(
  s: SerotypeCatalogEntry,
  index: SearchIndex,
): SearchHit[] {
  if (s.kind === "broad" && s.nGroups + s.nAlleles > 0) {
    const narrow = getSerotypeChildren(s.serotypeId);
    if (narrow.length > 0) {
      return narrow
        .map((n) => index.serotypeByKey.get(n.serotypeId.toUpperCase()))
        .filter((n): n is SerotypeCatalogEntry => n !== undefined)
        .slice(0, MAX_CHILDREN)
        .map((n) => serotypeHit(n, s.serotypeId));
    }
  }
  const members = getSerotypeMembers(s.serotypeId);
  const groups = members.filter((m) => m.resolution === "2-digit");
  const alleles = members
    .filter((m) => m.resolution === "4-digit")
    .sort((a, b) => b.nArticles - a.nArticles);
  const picked = [...groups, ...alleles].slice(0, MAX_CHILDREN);
  const hits: SearchHit[] = [];
  for (const m of picked) {
    const rec = index.byHla.get(m.hla);
    if (rec) hits.push(alleleHit(rec, index, s.serotypeId));
  }
  return hits;
}

/** Specificites portant l'allele ou le groupe cherche (jusqu'a 3). */
function serotypesOfAllele(
  hla: string,
  index: SearchIndex,
): SearchHit[] {
  let rows;
  try {
    rows = getSerotypesForAllele(hla);
  } catch {
    return [];
  }
  const hits: SearchHit[] = [];
  for (const r of rows) {
    if (r.kind === "broad" && hits.length >= 2) continue;
    const s = index.serotypeByKey.get(r.serotypeId.toUpperCase());
    if (!s) continue;
    hits.push(
      serotypeHit(
        s,
        undefined,
        `sérotype correspondant · ${plural(s.nGroups + s.nAlleles, "allèle")}`,
      ),
    );
    if (hits.length >= 3) break;
  }
  return hits;
}

// --------------------------------------------------------------------------
// Point d'entree
// --------------------------------------------------------------------------

/** Ordre des groupes dans la liste. */
const TYPE_ORDER: EntityType[] = [
  "allele",
  "serotype",
  "outcome",
  "article",
  "author",
];

/**
 * Recherche unifiee. Retourne `[]` pour une saisie vide ou sans terme
 * exploitable. La liste est GROUPEE par type (alleles, serotypes,
 * complications, articles, auteurs), un resultat parent etant suivi de ses
 * enfants ; le groupe « serotype » passe en tete quand la saisie est une
 * graphie de serotype sans ambiguite (« DR15 », « B27 », « Cw7 »).
 *
 * `limit` borne la part plein texte ; les resultats structures (au plus une
 * vingtaine) s'y ajoutent.
 */
export function searchEntities(query: string, limit = 25): SearchHit[] {
  const raw = (query ?? "").replace(/\p{C}/gu, " ").trim();
  if (raw.length === 0) return [];

  const db = getDb();
  const index = getIndex(db);

  // --- 1. Lecture structuree -------------------------------------------
  const allele = parseAlleleQuery(raw);
  const alleleHits = allele ? alleleResults(allele, index) : [];
  const { exact, prefix } = serotypeMatches(raw, index);

  const serotypeHits: SearchHit[] = [];
  exact.forEach((s, i) => {
    serotypeHits.push(serotypeHit(s));
    // Seule la premiere correspondance exacte deploie ses alleles.
    if (i === 0) serotypeHits.push(...serotypeChildren(s, index));
  });
  for (const s of prefix.slice(0, 6)) serotypeHits.push(serotypeHit(s));

  // Un groupe ou un allele cherche : proposer le serotype correspondant.
  if (allele && alleleHits.length > 0 && exact.length === 0) {
    serotypeHits.push(...serotypesOfAllele(alleleHits[0].entityId, index));
  }

  // Un locus tape en partie (« dq », « drb ») : les loci dont le nom commence ainsi.
  const letters = raw.toLowerCase().replace(/^hla[\s_-]*/, "");
  if (!allele && /^[a-z]{2,4}$/.test(letters)) {
    for (const rec of index.byHla.values()) {
      if (rec.resolution === "class" && rec.parent && rec.hla.toLowerCase().startsWith(letters)) {
        alleleHits.push(alleleHit(rec, index));
      }
    }
  }

  // --- 2. Plein texte --------------------------------------------------
  const structured = alleleHits.length + serotypeHits.length > 0;
  const match = escapeFtsQuery(raw);
  const ftsRows: SearchHitRow[] = match
    ? (db
        .prepare(
          `SELECT entity_type, entity_id, label
             FROM search_index
            WHERE search_index MATCH ?
            ORDER BY rank
            LIMIT ?`,
        )
        .all(match, limit) as SearchHitRow[])
    : [];

  const ftsHits: SearchHit[] = [];
  for (const row of ftsRows) {
    // La lecture structuree fait deja autorite pour les alleles et les
    // serotypes : le plein texte ne les redit pas.
    if (structured && (row.entity_type === "allele" || row.entity_type === "serotype")) {
      continue;
    }
    if (row.entity_type === "allele") {
      const rec = index.byHla.get(row.entity_id);
      ftsHits.push(
        rec
          ? alleleHit(rec, index)
          : { entityType: "allele", entityId: row.entity_id, label: row.label },
      );
    } else if (row.entity_type === "serotype") {
      const s = index.serotypeByKey.get(row.entity_id.toUpperCase());
      ftsHits.push(
        s
          ? serotypeHit(s)
          : { entityType: "serotype", entityId: row.entity_id, label: row.label },
      );
    } else {
      ftsHits.push({
        entityType: row.entity_type,
        entityId: row.entity_id,
        label: row.label,
      });
    }
  }

  // --- 3. Fusion groupee par type --------------------------------------
  const serotypeFirst = exact.length > 0 && !(allele?.explicit ?? false);
  const order = serotypeFirst
    ? ["serotype", "allele", ...TYPE_ORDER.filter((t) => t !== "serotype" && t !== "allele")]
    : TYPE_ORDER;

  const seen = new Set<string>();
  const merged: SearchHit[] = [];
  for (const hit of [...alleleHits, ...serotypeHits, ...ftsHits]) {
    const key = `${hit.entityType}:${hit.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }
  const rank = (t: EntityType) => order.indexOf(t);
  // Tri stable : les groupes se regroupent, l'ordre interne (parent puis
  // enfants, ordre FTS) est conserve.
  return merged
    .map((hit, i) => ({ hit, i }))
    .sort((a, b) => rank(a.hit.entityType) - rank(b.hit.entityType) || a.i - b.i)
    .map((x) => x.hit);
}
