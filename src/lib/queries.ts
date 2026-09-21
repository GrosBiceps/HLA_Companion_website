/**
 * Requetes du corpus — SERVEUR UNIQUEMENT (cf. db.ts).
 *
 * Regles transverses :
 *  - toute requete est parametree (`?`), jamais concatenee ;
 *  - les libelles cliniques viennent de la table `outcomes`, jamais la cle
 *    technique du pipeline ;
 *  - les associations non significatives ne sont PAS filtrees : elles sont
 *    affichees grisees, pas masquees.
 */

import { getDb } from "./db";
import type {
  Article,
  AssociationRow,
  Author,
  EntityType,
  HlaEntity,
  Outcome,
  PairMention,
  Polarity,
  SearchHit,
  SignalLevel,
} from "./types";

/**
 * Ordre d'affichage du signal, exprime en SQL. `inverse` en tete : une piste
 * de protection est une information forte, pas un signal faible.
 */
const SIGNAL_ORDER_SQL = `CASE a.signal_level
    WHEN 'inverse'  THEN 0
    WHEN 'strong'   THEN 1
    WHEN 'clear'    THEN 2
    WHEN 'moderate' THEN 3
    WHEN 'weak'     THEN 4
    ELSE 5
  END`;

// --------------------------------------------------------------------------
// Alleles
// --------------------------------------------------------------------------

interface HlaEntityRow {
  hla: string;
  locus: string;
  hla_class: string;
  resolution: string;
  parent_hla: string | null;
  n_mentions: number;
}

function toHlaEntity(row: HlaEntityRow): HlaEntity {
  return {
    hla: row.hla,
    locus: row.locus,
    hlaClass: row.hla_class,
    resolution: row.resolution,
    parentHla: row.parent_hla,
    nMentions: row.n_mentions,
  };
}

const HLA_COLUMNS = "hla, locus, hla_class, resolution, parent_hla, n_mentions";

export function getAlleleByKey(hla: string): HlaEntity | null {
  const row = getDb()
    .prepare(`SELECT ${HLA_COLUMNS} FROM hla_entities WHERE hla = ?`)
    .get(hla) as HlaEntityRow | undefined;
  return row ? toHlaEntity(row) : null;
}

/**
 * Chaine ascendante d'un allele, RACINE EN PREMIER, terminee par l'allele
 * demande : classe > locus > 2-digit > 4-digit.
 *
 * `depth` compte les sauts depuis la feuille ; on trie donc en decroissant
 * pour restituer la chaine dans le sens de la lecture.
 */
export function getAlleleAncestry(hla: string): HlaEntity[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE ancestry(hla, locus, hla_class, resolution, parent_hla,
                               n_mentions, depth) AS (
         SELECT ${HLA_COLUMNS}, 0
           FROM hla_entities
          WHERE hla = ?
         UNION ALL
         SELECT p.hla, p.locus, p.hla_class, p.resolution, p.parent_hla,
                p.n_mentions, a.depth + 1
           FROM hla_entities p
           JOIN ancestry a ON a.parent_hla = p.hla
       )
       SELECT ${HLA_COLUMNS} FROM ancestry ORDER BY depth DESC`,
    )
    .all(hla) as HlaEntityRow[];
  return rows.map(toHlaEntity);
}

/** Enfants directs d'un allele dans la hierarchie (une seule generation). */
export function getAlleleChildren(hla: string): HlaEntity[] {
  const rows = getDb()
    .prepare(
      `SELECT ${HLA_COLUMNS}
         FROM hla_entities
        WHERE parent_hla = ?
        ORDER BY n_mentions DESC, hla ASC`,
    )
    .all(hla) as HlaEntityRow[];
  return rows.map(toHlaEntity);
}

// --------------------------------------------------------------------------
// Associations
// --------------------------------------------------------------------------

interface AssociationSqlRow {
  hla: string;
  outcome: string;
  label: string;
  category: string;
  n_cooccurrence: number;
  n_positive: number;
  n_negated: number;
  signal_level: SignalLevel;
  is_significant: number;
  first_year: number | null;
  npmi: number | null;
  odds_ratio: number | null;
  or_ci_low: number | null;
  or_ci_high: number | null;
  fdr: number | null;
  fdr_two_sided: number | null;
}

function toAssociation(row: AssociationSqlRow): AssociationRow {
  return {
    hla: row.hla,
    outcome: row.outcome,
    label: row.label,
    category: row.category,
    nCooccurrence: row.n_cooccurrence,
    nPositive: row.n_positive,
    nNegated: row.n_negated,
    signalLevel: row.signal_level,
    isSignificant: row.is_significant === 1,
    firstYear: row.first_year,
    npmi: row.npmi,
    oddsRatio: row.odds_ratio,
    orCiLow: row.or_ci_low,
    orCiHigh: row.or_ci_high,
    fdr: row.fdr,
    fdrTwoSided: row.fdr_two_sided,
  };
}

/**
 * Toutes les associations d'un allele, libelle clinique joint depuis
 * `outcomes`, triees par force de signal decroissante puis par effectif.
 *
 * Les lignes non significatives sont volontairement conservees : l'interface
 * les grise, elle ne les masque pas (une absence de signal est une
 * information).
 *
 * `a.outcome ASC` clot le tri : sans lui l'ordre des ex aequo (meme signal,
 * meme effectif — 15 groupes dans le corpus) depend de l'implementation
 * SQLite et pourrait changer d'une version a l'autre.
 */
export function getAssociationsForAllele(hla: string): AssociationRow[] {
  const rows = getDb()
    .prepare(
      `SELECT a.hla, a.outcome, o.label, o.category,
              a.n_cooccurrence, a.n_positive, a.n_negated,
              a.signal_level, a.is_significant, a.first_year,
              a.npmi, a.odds_ratio, a.or_ci_low, a.or_ci_high,
              a.fdr, a.fdr_two_sided
         FROM associations a
         JOIN outcomes o ON o.outcome = a.outcome
        WHERE a.hla = ?
        ORDER BY ${SIGNAL_ORDER_SQL}, a.n_cooccurrence DESC, a.outcome ASC`,
    )
    .all(hla) as AssociationSqlRow[];
  return rows.map(toAssociation);
}

// --------------------------------------------------------------------------
// Mentions de paire
// --------------------------------------------------------------------------

interface PairMentionSqlRow {
  pair_mention_id: number;
  pmid: string;
  hla: string;
  outcome: string;
  sentence: string;
  hla_span: string | null;
  outcome_span: string | null;
  polarity: Polarity;
  negation_trigger: string | null;
  title: string;
  year: number;
  journal: string | null;
  cited_by: number | null;
}

/**
 * Phrases sources d'une paire (allele, complication), avec les metadonnees
 * de l'article pour la citation. Les spans permettent le surlignage.
 *
 * Le nombre de lignes rendues egale toujours `nCooccurrence` de
 * l'association correspondante : ce n'est pas une coincidence mais la
 * validation V3 du builder (`scripts/build_sqlite.py`), qui refuse de
 * construire la base si les deux divergent.
 */
export function getPairMentions(
  hla: string,
  outcome: string,
): PairMention[] {
  const rows = getDb()
    .prepare(
      `SELECT pm.pair_mention_id, pm.pmid, pm.hla, pm.outcome, pm.sentence,
              pm.hla_span, pm.outcome_span, pm.polarity, pm.negation_trigger,
              ar.title, ar.year, ar.journal, ar.cited_by
         FROM pair_mentions pm
         JOIN articles ar ON ar.pmid = pm.pmid
        WHERE pm.hla = ? AND pm.outcome = ?
        ORDER BY ar.year DESC, pm.pair_mention_id ASC`,
    )
    .all(hla, outcome) as PairMentionSqlRow[];

  return rows.map((row) => ({
    pairMentionId: row.pair_mention_id,
    pmid: row.pmid,
    hla: row.hla,
    outcome: row.outcome,
    sentence: row.sentence,
    // Les spans sont nullables au schema ; on retombe sur la cle, qui reste
    // surlignable, plutot que d'exposer `null` au composant d'affichage.
    hlaSpan: row.hla_span ?? row.hla,
    outcomeSpan: row.outcome_span ?? row.outcome,
    polarity: row.polarity,
    negationTrigger: row.negation_trigger,
    title: row.title,
    year: row.year,
    journal: row.journal,
    citedBy: row.cited_by,
  }));
}

// --------------------------------------------------------------------------
// Articles et auteurs
// --------------------------------------------------------------------------

interface ArticleSqlRow {
  pmid: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  year: number;
  journal: string | null;
  journal_abbrev: string | null;
  country: string | null;
  language: string | null;
  cited_by: number | null;
  source: string | null;
  graft_assignment: string | null;
}

export function getArticle(pmid: string): Article | null {
  const row = getDb()
    .prepare(`SELECT * FROM articles WHERE pmid = ?`)
    .get(pmid) as ArticleSqlRow | undefined;
  if (!row) return null;
  return {
    pmid: row.pmid,
    doi: row.doi,
    title: row.title,
    abstract: row.abstract,
    year: row.year,
    journal: row.journal,
    journalAbbrev: row.journal_abbrev,
    country: row.country,
    language: row.language,
    citedBy: row.cited_by,
    source: row.source,
    graftAssignment: row.graft_assignment,
  };
}

interface AuthorSqlRow {
  author_id: string;
  display_name: string;
  n_publications: number;
}

export function getAuthor(authorId: string): Author | null {
  const row = getDb()
    .prepare(
      `SELECT author_id, display_name, n_publications
         FROM authors WHERE author_id = ?`,
    )
    .get(authorId) as AuthorSqlRow | undefined;
  if (!row) return null;
  return {
    authorId: row.author_id,
    displayName: row.display_name,
    nPublications: row.n_publications,
  };
}

// --------------------------------------------------------------------------
// Statistiques de corpus (barre d'accueil)
// --------------------------------------------------------------------------

export interface CorpusStats {
  nArticles: number;
  nOutcomes: number;
  nAlleles: number;
  yearMin: number | null;
  yearMax: number | null;
}

/**
 * Compteurs de la barre de statistiques de l'accueil.
 *
 * ⚠ CES CHIFFRES SONT CALCULES, JAMAIS ECRITS EN DUR. La spec pose la regle
 * explicitement : un compteur code en dur ("~340 articles") est un defaut,
 * parce qu'il ment des la reconstruction suivante du corpus. Le mockup de la
 * spec porte un `[n]` a la place du nombre pour cette raison precise.
 *
 * On ne lit pas non plus `corpus_version.n_articles` : c'est une valeur
 * declaree par le builder, alors qu'on veut ici le contenu reellement present
 * dans la base rendue.
 */
export function getCorpusStats(): CorpusStats {
  const db = getDb();

  const articles = db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(year) AS year_min, MAX(year) AS year_max
         FROM articles`,
    )
    .get() as { n: number; year_min: number | null; year_max: number | null };

  const outcomes = db
    .prepare(`SELECT COUNT(*) AS n FROM outcomes`)
    .get() as { n: number };

  const alleles = db
    .prepare(`SELECT COUNT(*) AS n FROM hla_entities`)
    .get() as { n: number };

  return {
    nArticles: articles.n,
    nOutcomes: outcomes.n,
    nAlleles: alleles.n,
    yearMin: articles.year_min,
    yearMax: articles.year_max,
  };
}

// --------------------------------------------------------------------------
// Recherche unifiee (FTS5)
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
function escapeFtsQuery(raw: string): string {
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

/**
 * Recherche plein texte sur alleles, complications, articles et auteurs.
 * Retourne `[]` pour une requete vide ou sans terme exploitable.
 */
export function searchEntities(query: string, limit = 25): SearchHit[] {
  const match = escapeFtsQuery(query ?? "");
  if (match.length === 0) return [];

  const rows = getDb()
    .prepare(
      `SELECT entity_type, entity_id, label
         FROM search_index
        WHERE search_index MATCH ?
        ORDER BY rank
        LIMIT ?`,
    )
    .all(match, limit) as SearchHitRow[];

  return rows.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.label,
  }));
}

// --------------------------------------------------------------------------
// Task 8 — navigation inverse (complication -> HLA), article, auteur
//
// AJOUT PUR : rien au-dessus n'est modifie. `queries.ts` croit par ajout,
// regle posee plus tot dans le projet.
// --------------------------------------------------------------------------

interface OutcomeSqlRow {
  outcome: string;
  label: string;
  category: string;
  n_mentions: number;
}

/** Complication par cle technique. Le libelle clinique vient de la base. */
export function getOutcome(outcome: string): Outcome | null {
  const row = getDb()
    .prepare(
      `SELECT outcome, label, category, n_mentions
         FROM outcomes WHERE outcome = ?`,
    )
    .get(outcome) as OutcomeSqlRow | undefined;
  if (!row) return null;
  return {
    outcome: row.outcome,
    label: row.label,
    category: row.category,
    nMentions: row.n_mentions,
  };
}

/**
 * Navigation INVERSE de `getAssociationsForAllele` : partant d'une
 * complication, tous les alleles co-cites avec elle.
 *
 * Meme forme de ligne (`AssociationRow`), meme tri (`SIGNAL_ORDER_SQL`, puis
 * effectif decroissant) et memes regles epistemiques : les negations ne sont
 * jamais filtrees, le non significatif n'est jamais masque — la carte le
 * grise, a sa place.
 *
 * Le tiebreaker change de colonne : ici l'outcome est constant, c'est donc
 * `a.hla ASC` qui rend l'ordre des ex aequo deterministe. Sans lui, l'ordre
 * dependrait du plan de requete SQLite.
 */
export function getAssociationsForOutcome(outcome: string): AssociationRow[] {
  const rows = getDb()
    .prepare(
      `SELECT a.hla, a.outcome, o.label, o.category,
              a.n_cooccurrence, a.n_positive, a.n_negated,
              a.signal_level, a.is_significant, a.first_year,
              a.npmi, a.odds_ratio, a.or_ci_low, a.or_ci_high,
              a.fdr, a.fdr_two_sided
         FROM associations a
         JOIN outcomes o ON o.outcome = a.outcome
        WHERE a.outcome = ?
        ORDER BY ${SIGNAL_ORDER_SQL}, a.n_cooccurrence DESC, a.hla ASC`,
    )
    .all(outcome) as AssociationSqlRow[];
  return rows.map(toAssociation);
}

/**
 * Toutes les mentions (allele x complication) reperees dans UN article.
 * Le libelle clinique n'est pas joint ici : la page le derive de `outcomes`
 * via `getOutcome`, source unique de verite pour les libelles.
 */
export function getArticleMentions(pmid: string): PairMention[] {
  const rows = getDb()
    .prepare(
      `SELECT pm.pair_mention_id, pm.pmid, pm.hla, pm.outcome, pm.sentence,
              pm.hla_span, pm.outcome_span, pm.polarity, pm.negation_trigger,
              ar.title, ar.year, ar.journal, ar.cited_by
         FROM pair_mentions pm
         JOIN articles ar ON ar.pmid = pm.pmid
        WHERE pm.pmid = ?
        ORDER BY pm.hla ASC, pm.outcome ASC, pm.pair_mention_id ASC`,
    )
    .all(pmid) as PairMentionSqlRow[];

  return rows.map((row) => ({
    pairMentionId: row.pair_mention_id,
    pmid: row.pmid,
    hla: row.hla,
    outcome: row.outcome,
    sentence: row.sentence,
    hlaSpan: row.hla_span ?? row.hla,
    outcomeSpan: row.outcome_span ?? row.outcome,
    polarity: row.polarity,
    negationTrigger: row.negation_trigger,
    title: row.title,
    year: row.year,
    journal: row.journal,
    citedBy: row.cited_by,
  }));
}

/**
 * Publications d'un auteur, de la plus recente a la plus ancienne.
 *
 * Le compte rendu ici est le compte REEL de la jointure `article_authors`,
 * pas le compteur denormalise `authors.n_publications`. Les deux coincident
 * dans le corpus construit ; en cas de divergence, c'est la jointure qui dit
 * la verite, parce que c'est elle qui produit la liste affichee.
 */
export function getAuthorPublications(authorId: string): Article[] {
  const rows = getDb()
    .prepare(
      `SELECT ar.*
         FROM articles ar
         JOIN article_authors aa ON aa.pmid = ar.pmid
        WHERE aa.author_id = ?
        ORDER BY ar.year DESC, ar.pmid ASC`,
    )
    .all(authorId) as ArticleSqlRow[];

  return rows.map((row) => ({
    pmid: row.pmid,
    doi: row.doi,
    title: row.title,
    abstract: row.abstract,
    year: row.year,
    journal: row.journal,
    journalAbbrev: row.journal_abbrev,
    country: row.country,
    language: row.language,
    citedBy: row.cited_by,
    source: row.source,
    graftAssignment: row.graft_assignment,
  }));
}

/** Une entite (HLA ou complication) avec son effectif chez CET auteur. */
export interface InterestCount<T> {
  entity: T;
  nArticles: number;
}

export interface AuthorInterests {
  hla: InterestCount<HlaEntity>[];
  outcomes: InterestCount<Outcome>[];
}

/**
 * « Centres d'interet » d'un auteur : les alleles et les complications qui
 * reviennent dans SES articles, comptes en NOMBRE D'ARTICLES distincts (pas
 * en nombre de mentions — un article bavard ne doit pas peser autant que
 * trois articles distincts).
 *
 * Ce n'est pas une declaration sur ce que l'auteur etudie : c'est ce que le
 * corpus indexe lui attribue. La fiche le dit en toutes lettres.
 */
export function getAuthorInterests(authorId: string): AuthorInterests {
  const db = getDb();

  const hlaRows = db
    .prepare(
      `SELECT h.hla, h.locus, h.hla_class, h.resolution, h.parent_hla,
              h.n_mentions, COUNT(DISTINCT hm.pmid) AS n_articles
         FROM hla_mentions hm
         JOIN article_authors aa ON aa.pmid = hm.pmid
         JOIN hla_entities h ON h.hla = hm.hla
        WHERE aa.author_id = ?
        GROUP BY h.hla
        ORDER BY n_articles DESC, h.hla ASC`,
    )
    .all(authorId) as (HlaEntityRow & { n_articles: number })[];

  const outcomeRows = db
    .prepare(
      `SELECT o.outcome, o.label, o.category, o.n_mentions,
              COUNT(DISTINCT om.pmid) AS n_articles
         FROM outcome_mentions om
         JOIN article_authors aa ON aa.pmid = om.pmid
         JOIN outcomes o ON o.outcome = om.outcome
        WHERE aa.author_id = ?
        GROUP BY o.outcome
        ORDER BY n_articles DESC, o.label ASC`,
    )
    .all(authorId) as (OutcomeSqlRow & { n_articles: number })[];

  return {
    hla: hlaRows.map((row) => ({
      entity: toHlaEntity(row),
      nArticles: row.n_articles,
    })),
    outcomes: outcomeRows.map((row) => ({
      entity: {
        outcome: row.outcome,
        label: row.label,
        category: row.category,
        nMentions: row.n_mentions,
      },
      nArticles: row.n_articles,
    })),
  };
}

export interface CoAuthor {
  authorId: string;
  displayName: string;
  nSharedArticles: number;
}

/**
 * Co-auteurs, du plus frequent au moins frequent.
 *
 * `co.author_id <> ?` exclut l'auteur lui-meme : sans cette clause il
 * apparaitrait en tete de sa propre liste de co-auteurs, avec le compte de
 * toutes ses publications — un artefact de jointure presente comme un fait.
 */
export function getCoAuthors(authorId: string): CoAuthor[] {
  const rows = getDb()
    .prepare(
      `SELECT co.author_id, co.display_name,
              COUNT(DISTINCT mine.pmid) AS n_shared
         FROM article_authors mine
         JOIN article_authors theirs ON theirs.pmid = mine.pmid
         JOIN authors co ON co.author_id = theirs.author_id
        WHERE mine.author_id = ? AND theirs.author_id <> ?
        GROUP BY co.author_id
        ORDER BY n_shared DESC, co.display_name ASC`,
    )
    .all(authorId, authorId) as {
    author_id: string;
    display_name: string;
    n_shared: number;
  }[];

  return rows.map((row) => ({
    authorId: row.author_id,
    displayName: row.display_name,
    nSharedArticles: row.n_shared,
  }));
}

/**
 * Auteurs d'un article, dans l'ORDRE DE SIGNATURE (`position`).
 *
 * L'ordre n'est pas cosmetique en bibliometrie : premier et dernier auteur
 * portent des roles distincts. Un tri alphabetique detruirait cette
 * information. `is_last` est remonte pour que la fiche puisse le marquer.
 */
export function getArticleAuthors(
  pmid: string,
): (Author & { position: number; isLast: boolean })[] {
  const rows = getDb()
    .prepare(
      `SELECT au.author_id, au.display_name, au.n_publications,
              aa.position, aa.is_last
         FROM article_authors aa
         JOIN authors au ON au.author_id = aa.author_id
        WHERE aa.pmid = ?
        ORDER BY aa.position ASC`,
    )
    .all(pmid) as (AuthorSqlRow & { position: number; is_last: number })[];

  return rows.map((row) => ({
    authorId: row.author_id,
    displayName: row.display_name,
    nPublications: row.n_publications,
    position: row.position,
    isLast: row.is_last === 1,
  }));
}

// --------------------------------------------------------------------------
// Task 9 — voisinage de graphe (explorateur bidirectionnel)
//
// AJOUT PUR : rien au-dessus n'est modifie. Meme regle que Task 8.
// --------------------------------------------------------------------------

export type GraphNodeType = "hla" | "outcome";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  /**
   * Libelle AFFICHABLE. Pour un noeud `outcome` c'est le libelle clinique de
   * la table `outcomes`, jamais la cle technique (`graft_loss`). Pour un
   * noeud `hla` la cle EST le libelle d'usage ("HLA-DQB1*02:01").
   */
  label: string;
  /** Categorie clinique (noeuds `outcome` uniquement) — code couleur. */
  category: string | null;
  /** Nombre de sauts depuis le centre : 0 = centre. Sert a l'opacite. */
  distance: number;
  /** Effectif de mentions du corpus — sert au dimensionnement du noeud. */
  nMentions: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Force qualitative : c'est ce qui est rendu, pas une metrique. */
  signalLevel: SignalLevel;
  nCooccurrence: number;
  nNegated: number;
  isSignificant: boolean;
  /** Vrai si la majorite des mentions de la paire sont des negations. */
  majorityNegative: boolean;
}

export interface Neighborhood {
  center: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Vrai si le plafond a coupe le voisinage (l'interface le signale). */
  truncated: boolean;
}

/**
 * PLAFOND DUR. La spec de conception met explicitement en garde contre le
 * « hairball » : au-dela de quelques dizaines de noeuds un graphe de
 * co-occurrence ne se lit plus, il se contemple. 150 est la limite retenue.
 *
 * Le corpus A synthetique sature a 54 noeuds a profondeur 5 : le plafond n'y
 * est jamais atteint. Il est neanmoins implemente et teste (cf.
 * `truncateBySignal`, exportee pour ca) parce que c'est une garantie sur le
 * comportement du code, pas sur ce corpus-ci.
 */
export const GRAPH_NODE_CAP = 150;

/** Rang d'affichage du signal — miroir TS de `SIGNAL_ORDER_SQL`. */
const SIGNAL_RANK: Record<SignalLevel, number> = {
  inverse: 0,
  strong: 1,
  clear: 2,
  moderate: 3,
  weak: 4,
};

interface NeighborSqlRow {
  hla: string;
  outcome: string;
  label: string;
  category: string;
  n_cooccurrence: number;
  n_positive: number;
  n_negated: number;
  signal_level: SignalLevel;
  is_significant: number;
}

const NEIGHBOR_COLUMNS = `a.hla, a.outcome, o.label, o.category,
         a.n_cooccurrence, a.n_positive, a.n_negated,
         a.signal_level, a.is_significant`;

/** Cle de noeud interne : le prefixe evite toute collision hla/outcome. */
function nodeKey(type: GraphNodeType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Identifie la nature du centre EN INTERROGEANT LA BASE, pas en devinant a
 * partir de la forme de la chaine. Les cles HLA du corpus vont du locus nu
 * ("DQB1") a l'allele 4-digit ("HLA-DQB1*02:01") : aucune regexp ne les
 * separe sainement des cles d'outcome. `hla_entities` puis `outcomes` font
 * autorite, dans cet ordre.
 */
function resolveCenter(centerId: string): GraphNode | null {
  const db = getDb();

  const hla = db
    .prepare(`SELECT hla, n_mentions FROM hla_entities WHERE hla = ?`)
    .get(centerId) as { hla: string; n_mentions: number } | undefined;
  if (hla) {
    return {
      id: hla.hla,
      type: "hla",
      label: hla.hla,
      category: null,
      distance: 0,
      nMentions: hla.n_mentions,
    };
  }

  const outcome = db
    .prepare(
      `SELECT outcome, label, category, n_mentions
         FROM outcomes WHERE outcome = ?`,
    )
    .get(centerId) as OutcomeSqlRow | undefined;
  if (outcome) {
    return {
      id: outcome.outcome,
      type: "outcome",
      // Le libelle clinique, jamais `outcome.outcome`.
      label: outcome.label,
      category: outcome.category,
      distance: 0,
      nMentions: outcome.n_mentions,
    };
  }

  return null;
}

/**
 * Tronque un ensemble de noeuds au plafond, PAR FORCE DE SIGNAL DECROISSANTE.
 *
 * Exportee pour etre testable directement : le corpus A ne permet pas
 * d'atteindre 150 noeuds, la garantie serait donc sinon invérifiable.
 *
 * Regles de coupe, dans l'ordre :
 *  1. le centre (distance 0) n'est jamais coupe ;
 *  2. sinon on classe par meilleur signal porte par une arete incidente
 *     (inverse > strong > clear > moderate > weak — l'ordre du projet), puis
 *     par distance croissante, puis par effectif decroissant, puis par id
 *     pour rendre la coupe deterministe.
 *
 * `inverse` est en tete parce qu'une piste de protection est une information
 * forte : la couper en premier reviendrait a masquer ce que le projet tient a
 * montrer.
 */
export function truncateBySignal(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cap: number = GRAPH_NODE_CAP,
): { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean } {
  if (nodes.length <= cap) return { nodes, edges, truncated: false };

  // Meilleur rang de signal observe sur une arete incidente a chaque noeud.
  const best = new Map<string, number>();
  for (const e of edges) {
    const rank = SIGNAL_RANK[e.signalLevel] ?? 5;
    for (const end of [e.source, e.target]) {
      const current = best.get(end);
      if (current === undefined || rank < current) best.set(end, rank);
    }
  }

  const ordered = [...nodes].sort((a, b) => {
    if (a.distance === 0 || b.distance === 0) {
      return (a.distance === 0 ? 0 : 1) - (b.distance === 0 ? 0 : 1);
    }
    const ra = best.get(a.id) ?? 5;
    const rb = best.get(b.id) ?? 5;
    if (ra !== rb) return ra - rb;
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.nMentions !== b.nMentions) return b.nMentions - a.nMentions;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const kept = ordered.slice(0, cap);
  const keptIds = new Set(kept.map((n) => n.id));

  // AUCUNE ARETE PENDANTE : on rejette toute arete dont une extremite a saute.
  return {
    nodes: kept,
    edges: edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)),
    truncated: true,
  };
}

/**
 * Voisinage BFS bidirectionnel autour d'un allele OU d'une complication.
 *
 * Le graphe est biparti : une arete relie toujours un noeud `hla` a un noeud
 * `outcome`, via la table `associations`. Partir d'un outcome est donc le
 * meme parcours, dans l'autre sens — c'est la promesse de navigation inverse
 * du projet, tenue au niveau du graphe.
 *
 * RIEN N'EST FILTRE PAR DEFAUT. Les negations sont toujours presentes, le non
 * significatif aussi : l'interface les de-emphase (trait pointille, opacite),
 * elle ne les retire pas. `minSignal` est un filtre OPTIONNEL du lecteur ;
 * son absence inclut tout. Quand il est pose, il s'applique AVANT le parcours
 * (une arete trop faible ne propage pas non plus la marche), sinon le filtre
 * afficherait des noeuds sans arete visible.
 *
 * `depth` est borne a [0, 5] : au-dela le plafond de noeuds tranche de toute
 * facon, et une valeur negative ou NaN ne doit pas produire une boucle.
 */
export function getNeighborhood(
  centerId: string,
  depth: number,
  minSignal?: SignalLevel,
): Neighborhood {
  const center = resolveCenter(centerId);
  if (!center) {
    return { center: null, nodes: [], edges: [], truncated: false };
  }

  const hops = Number.isFinite(depth)
    ? Math.min(Math.max(Math.trunc(depth), 0), 5)
    : 1;

  const db = getDb();
  const maxRank = minSignal === undefined ? 5 : SIGNAL_RANK[minSignal];

  const byHla = db.prepare(
    `SELECT ${NEIGHBOR_COLUMNS}
       FROM associations a
       JOIN outcomes o ON o.outcome = a.outcome
      WHERE a.hla = ?`,
  );
  const byOutcome = db.prepare(
    `SELECT ${NEIGHBOR_COLUMNS}
       FROM associations a
       JOIN outcomes o ON o.outcome = a.outcome
      WHERE a.outcome = ?`,
  );

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  nodes.set(nodeKey(center.type, center.id), center);

  // Effectifs HLA, pour dimensionner les noeuds decouverts en chemin.
  const hlaMentions = new Map<string, number>();
  for (const row of db
    .prepare(`SELECT hla, n_mentions FROM hla_entities`)
    .all() as { hla: string; n_mentions: number }[]) {
    hlaMentions.set(row.hla, row.n_mentions);
  }

  let frontier: GraphNode[] = [center];

  for (let hop = 1; hop <= hops && frontier.length > 0; hop++) {
    const next: GraphNode[] = [];

    for (const from of frontier) {
      const rows = (
        from.type === "hla" ? byHla.all(from.id) : byOutcome.all(from.id)
      ) as NeighborSqlRow[];

      for (const row of rows) {
        if ((SIGNAL_RANK[row.signal_level] ?? 5) > maxRank) continue;

        const hlaKey = nodeKey("hla", row.hla);
        const outKey = nodeKey("outcome", row.outcome);

        if (!nodes.has(hlaKey)) {
          const node: GraphNode = {
            id: row.hla,
            type: "hla",
            label: row.hla,
            category: null,
            distance: hop,
            nMentions: hlaMentions.get(row.hla) ?? 0,
          };
          nodes.set(hlaKey, node);
          next.push(node);
        }
        if (!nodes.has(outKey)) {
          const node: GraphNode = {
            id: row.outcome,
            type: "outcome",
            // Libelle clinique joint depuis `outcomes` : jamais la cle.
            label: row.label,
            category: row.category,
            distance: hop,
            nMentions: 0,
          };
          nodes.set(outKey, node);
          next.push(node);
        }

        const edgeId = `${row.hla}--${row.outcome}`;
        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: row.hla,
            target: row.outcome,
            signalLevel: row.signal_level,
            nCooccurrence: row.n_cooccurrence,
            nNegated: row.n_negated,
            isSignificant: row.is_significant === 1,
            majorityNegative: row.n_negated * 2 > row.n_cooccurrence,
          });
        }
      }
    }

    frontier = next;
  }

  // Effectif reel des noeuds outcome presents (le n_mentions de `outcomes`).
  const outcomeIds = [...nodes.values()]
    .filter((n) => n.type === "outcome")
    .map((n) => n.id);
  if (outcomeIds.length > 0) {
    const rows = db
      .prepare(
        `SELECT outcome, n_mentions FROM outcomes
          WHERE outcome IN (${outcomeIds.map(() => "?").join(",")})`,
      )
      .all(...outcomeIds) as { outcome: string; n_mentions: number }[];
    for (const row of rows) {
      const node = nodes.get(nodeKey("outcome", row.outcome));
      if (node) node.nMentions = row.n_mentions;
    }
  }

  const capped = truncateBySignal(
    [...nodes.values()],
    [...edges.values()],
    GRAPH_NODE_CAP,
  );

  return {
    center,
    nodes: capped.nodes,
    edges: capped.edges,
    truncated: capped.truncated,
  };
}

/**
 * Point de depart du graphe quand aucun `?center=` n'est fourni.
 *
 * CALCULE, PAS CODE EN DUR. Le meme principe que `getCorpusStats` : une cle
 * ecrite en dur mentirait a la reconstruction suivante du corpus (l'allele
 * vedette d'aujourd'hui peut disparaitre demain). On prend l'allele portant
 * le plus d'aretes de fort signal, puis le plus mentionne — c'est le point
 * d'entree le plus informatif, et il reste valable quel que soit le corpus.
 */
export function getDefaultGraphCenter(): string | null {
  const row = getDb()
    .prepare(
      `SELECT a.hla,
              SUM(CASE WHEN a.signal_level IN ('inverse','strong','clear')
                       THEN 1 ELSE 0 END) AS n_forts,
              COUNT(*) AS n_aretes
         FROM associations a
         JOIN hla_entities h ON h.hla = a.hla
        GROUP BY a.hla
        ORDER BY n_forts DESC, n_aretes DESC, h.n_mentions DESC, a.hla ASC
        LIMIT 1`,
    )
    .get() as { hla: string } | undefined;
  return row?.hla ?? null;
}
