-- Schema du compagnon bibliometrique HLA - Corpus A (espace allelique)
--
-- La base est un ARTEFACT DE BUILD : reconstructible, immuable, scellee
-- par SHA-256. Aucune ecriture ne passe par l'interface web.
--
-- Cles naturelles partout ou il en existe une stable et normalisee.

PRAGMA foreign_keys = ON;

-- =====================================================================
-- COUCHE 0 - METADONNEES DE BUILD
-- =====================================================================

CREATE TABLE corpus_version (
    version         TEXT PRIMARY KEY,   -- "A-1.2"
    universe        TEXT NOT NULL,      -- "A" | "B"
    built_at        TEXT NOT NULL,      -- ISO8601
    n_articles      INTEGER NOT NULL,
    pubmed_query    TEXT,
    pipeline_commit TEXT,
    filter_script   TEXT,
    is_synthetic    INTEGER NOT NULL DEFAULT 0,  -- 1 = donnees fictives
    notes           TEXT,
    CHECK (universe IN ('A', 'B')),
    CHECK (is_synthetic IN (0, 1))
);

-- =====================================================================
-- COUCHE 1 - SOURCES
-- =====================================================================

CREATE TABLE articles (
    pmid             TEXT PRIMARY KEY,
    doi              TEXT UNIQUE,
    title            TEXT NOT NULL,
    abstract         TEXT,
    year             INTEGER NOT NULL,
    journal          TEXT,
    journal_abbrev   TEXT,
    country          TEXT,
    language         TEXT,
    cited_by         INTEGER,
    source           TEXT,
    graft_assignment TEXT
);
CREATE INDEX idx_articles_year ON articles(year);
CREATE INDEX idx_articles_graft ON articles(graft_assignment);

CREATE TABLE authors (
    author_id       TEXT PRIMARY KEY,   -- slug: "wiebe-c"
    display_name    TEXT NOT NULL,
    n_publications  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE article_authors (
    pmid       TEXT NOT NULL REFERENCES articles(pmid),
    author_id  TEXT NOT NULL REFERENCES authors(author_id),
    position   INTEGER NOT NULL,
    is_last    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (pmid, author_id),
    CHECK (is_last IN (0, 1))
);
CREATE INDEX idx_article_authors_author ON article_authors(author_id);

CREATE TABLE mesh_terms (
    pmid TEXT NOT NULL REFERENCES articles(pmid),
    term TEXT NOT NULL,
    PRIMARY KEY (pmid, term)
);

CREATE TABLE keywords (
    pmid TEXT NOT NULL REFERENCES articles(pmid),
    term TEXT NOT NULL,
    PRIMARY KEY (pmid, term)
);

-- =====================================================================
-- COUCHE 2 - EXTRACTIONS NLP
-- =====================================================================

CREATE TABLE hla_entities (
    hla         TEXT PRIMARY KEY,       -- "HLA-DQB1*02:01"
    locus       TEXT NOT NULL,          -- "DQB1"
    hla_class   TEXT NOT NULL,          -- "I" | "II" | "unknown"
    resolution  TEXT NOT NULL,
    parent_hla  TEXT REFERENCES hla_entities(hla),
    n_mentions  INTEGER NOT NULL DEFAULT 0,
    CHECK (resolution IN ('4-digit','2-digit','serological','class',
                          'mismatch_count','eplet'))
);
CREATE INDEX idx_hla_locus ON hla_entities(locus);
CREATE INDEX idx_hla_parent ON hla_entities(parent_hla);

CREATE TABLE outcomes (
    outcome    TEXT PRIMARY KEY,        -- "ABMR"
    label      TEXT NOT NULL,           -- "Rejet humoral (ABMR)"
    category   TEXT NOT NULL,           -- "Rejet"
    n_mentions INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE hla_mentions (
    mention_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    pmid         TEXT NOT NULL REFERENCES articles(pmid),
    hla          TEXT NOT NULL REFERENCES hla_entities(hla),
    span         TEXT,
    sentence_idx INTEGER
);
CREATE INDEX idx_hla_mentions_pmid ON hla_mentions(pmid);
CREATE INDEX idx_hla_mentions_hla ON hla_mentions(hla);

CREATE TABLE outcome_mentions (
    mention_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    pmid         TEXT NOT NULL REFERENCES articles(pmid),
    outcome      TEXT NOT NULL REFERENCES outcomes(outcome),
    span         TEXT,
    negated      INTEGER NOT NULL DEFAULT 0,
    sentence_idx INTEGER,
    CHECK (negated IN (0, 1))
);
CREATE INDEX idx_outcome_mentions_pmid ON outcome_mentions(pmid);

-- LA TABLE CENTRALE : porte la phrase source affichee a l'utilisateur.
CREATE TABLE pair_mentions (
    pair_mention_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    pmid             TEXT NOT NULL REFERENCES articles(pmid),
    hla              TEXT NOT NULL REFERENCES hla_entities(hla),
    outcome          TEXT NOT NULL REFERENCES outcomes(outcome),
    sentence         TEXT NOT NULL,
    hla_span         TEXT,
    outcome_span     TEXT,
    polarity         TEXT NOT NULL,
    negation_trigger TEXT,
    sentence_idx     INTEGER,
    UNIQUE (pmid, hla, outcome, sentence_idx),
    CHECK (polarity IN ('positive', 'negated'))
);
CREATE INDEX idx_pair_mentions_pair ON pair_mentions(hla, outcome);
CREATE INDEX idx_pair_mentions_pmid ON pair_mentions(pmid);

-- =====================================================================
-- COUCHE 3 - AGREGATS
-- =====================================================================

CREATE TABLE associations (
    hla              TEXT NOT NULL REFERENCES hla_entities(hla),
    outcome          TEXT NOT NULL REFERENCES outcomes(outcome),
    n_cooccurrence   INTEGER NOT NULL,
    n_positive       INTEGER NOT NULL,
    n_negated        INTEGER NOT NULL,
    n_hla_total      INTEGER,
    n_outcome_total  INTEGER,
    n_universe       INTEGER,
    pmi              REAL,
    npmi             REAL,
    log_odds         REAL,
    odds_ratio       REAL,
    or_ci_low        REAL,
    or_ci_high       REAL,
    pval_fisher      REAL,
    fdr              REAL,
    pval_two_sided   REAL,
    fdr_two_sided    REAL,
    npmi_geo         REAL,
    first_year       INTEGER,
    signal_level     TEXT NOT NULL,
    is_significant   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (hla, outcome),
    CHECK (signal_level IN ('inverse','strong','clear','moderate','weak')),
    CHECK (is_significant IN (0, 1))
);
CREATE INDEX idx_assoc_fdr ON associations(fdr);
CREATE INDEX idx_assoc_hla ON associations(hla);
CREATE INDEX idx_assoc_outcome ON associations(outcome);

CREATE TABLE association_timeline (
    hla     TEXT NOT NULL REFERENCES hla_entities(hla),
    outcome TEXT NOT NULL REFERENCES outcomes(outcome),
    year    INTEGER NOT NULL,
    n       INTEGER NOT NULL,
    PRIMARY KEY (hla, outcome, year)
);

CREATE TABLE graph_edges (
    graph_type TEXT NOT NULL,
    source     TEXT NOT NULL,
    target     TEXT NOT NULL,
    weight     REAL NOT NULL,
    polarity   TEXT,
    community  INTEGER,
    PRIMARY KEY (graph_type, source, target)
);

CREATE TABLE node_metrics (
    graph_type  TEXT NOT NULL,
    node_id     TEXT NOT NULL,
    degree      INTEGER,
    betweenness REAL,
    eigenvector REAL,
    community   INTEGER,
    PRIMARY KEY (graph_type, node_id)
);

CREATE TABLE annual_counts (
    year INTEGER PRIMARY KEY,
    n    INTEGER NOT NULL
);

-- =====================================================================
-- RECHERCHE UNIFIEE
-- =====================================================================

CREATE VIRTUAL TABLE search_index USING fts5(
    entity_type,   -- 'allele' | 'outcome' | 'article' | 'author'
    entity_id,
    label,
    content
);
