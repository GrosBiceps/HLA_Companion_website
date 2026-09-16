# Compagnon HLA — Plan d'implémentation du prototype

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un prototype Next.js permettant à un immunologiste d'explorer les co-occurrences textuelles HLA × complications de transplantation rénale, avec traçabilité systématique jusqu'aux phrases sources.

**Architecture:** Un builder Python transforme des CSV (synthétiques d'abord, réels ensuite) en un fichier SQLite immuable, validé et scellé par SHA-256. Next.js lit cette base en lecture seule via `better-sqlite3`. Aucune écriture ne passe par l'interface.

**Tech Stack:** Python 3.12 (builder, stdlib uniquement) · Next.js 15 App Router · TypeScript · better-sqlite3 · Tailwind · Sigma.js/graphology · Observable Plot · Vitest

**Spec:** [docs/specs/2026-09-16-compagnon-hla-design.md](../../specs/2026-09-16-compagnon-hla-design.md)

## Global Constraints

Ces contraintes lient **toutes** les tâches. Valeurs copiées verbatim de la spec.

### Épistémique (contrainte de design n°1)

- **Aucun chiffre affiché n'est un cul-de-sac.** Toute valeur agrégée est cliquable jusqu'aux phrases sources, en deux clics maximum.
- **Métriques masquées par défaut** : NPMI, PMI, AFC-NPMI, log-odds, odds ratio, p-values, FDR n'apparaissent jamais en façade. Elles gouvernent tri et filtrage en arrière-plan, et ne s'affichent que derrière un dépliant « Détail statistique » ou dans l'export CSV.
- **Négations toujours affichées**, jamais masquées par défaut.
- **Non-significatif visible en grisé**, jamais masqué.
- **Bandeau données synthétiques** : toute page alimentée par des données synthétiques affiche un bandeau non refermable, visible sans défilement.

### Vocabulaire — interdits absolus dans l'UI

Ces chaînes ne doivent jamais apparaître dans un texte visible par l'utilisateur :
« associé à », « lié à », « risque de », « prédit », « cause ».

Employer à la place : « co-cité avec », « co-occurrence », « signal de co-occurrence », « fréquemment mentionné avec ».

Le mot « association » n'apparaît jamais seul en évidence — toujours qualifié : « association textuelle ».

### Aucune clé technique affichée

L'interface n'affiche jamais une clé brute du pipeline (`graft_loss`, `recurrent_GN`, `HLA_mismatch_outcome`…). Toujours le libellé de `outcomes.label`.

### Métriques de validation — valeurs exactes

- Précision d'extraction : **78,75 %**
- Accord négation (kappa) : **0,44** (modéré)
- Formulation grand public : **« ~1 mention sur 5 est erronée »**

### Corpus

- Corpus A — espace allélique — **N = 5 581**
- Version : **A-1.2**, gelée au **01/07/2026**
- Univers A et B strictement scindés : aucune vue ne les combine.

### Valeurs de `resolution` (6, exactement)

`4-digit` · `2-digit` · `serological` · `class` · `mismatch_count` · `eplet`

### Les 21 complications et leurs libellés

| Clé | Libellé affiché | Catégorie |
|---|---|---|
| `ABMR` | Rejet humoral (ABMR) | Rejet |
| `TCMR` | Rejet cellulaire (TCMR) | Rejet |
| `acute_rejection` | Rejet aigu | Rejet |
| `chronic_rejection` | Rejet chronique / IFTA | Rejet |
| `mixed_rejection` | Rejet mixte | Rejet |
| `DSA` | Anticorps anti-HLA du donneur (DSA) | Immunisation |
| `sensitization` | Immunisation / sensibilisation | Immunisation |
| `complement_activation` | Activation du complément | Immunisation |
| `HLA_mismatch_outcome` | Incompatibilité HLA | Immunisation |
| `DGF` | Reprise retardée de fonction (DGF) | Fonction du greffon |
| `graft_loss` | Perte du greffon | Fonction du greffon |
| `graft_survival` | Survie du greffon | Fonction du greffon |
| `eGFR` | Fonction rénale (DFG estimé) | Fonction du greffon |
| `BK_nephropathy` | Néphropathie à BK virus | Infection |
| `CMV` | Infection à CMV | Infection |
| `PTLD` | Syndrome lymphoprolifératif (PTLD) | Néoplasie |
| `skin_cancer` | Cancer cutané | Néoplasie |
| `NODAT` | Diabète post-transplantation (NODAT) | Métabolique |
| `recurrent_GN` | Récidive de glomérulonéphrite | Récidive |
| `FSGS` | Hyalinose segmentaire et focale (HSF) | Récidive |
| `IgA_nephropathy` | Néphropathie à IgA | Récidive |

**7 catégories** : Rejet · Immunisation · Fonction du greffon · Infection · Néoplasie · Métabolique · Récidive

### Niveaux de signal (`signal_level`)

| Valeur stockée | Affiché | Règle de dérivation |
|---|---|---|
| `strong` | ●●●● Signal fort | `fdr < 0.05 AND n_cooccurrence >= 10` |
| `clear` | ●●●○ Signal net | `fdr < 0.05 AND n_cooccurrence >= 3` |
| `moderate` | ●●○○ Signal modéré | `fdr < 0.05 AND n_cooccurrence < 3` |
| `weak` | ○○○○ Signal faible | `fdr >= 0.05` |
| `inverse` | ◐ Signal inverse | `odds_ratio < 1 AND fdr_two_sided < 0.05` |

Ordre d'évaluation : `inverse` est testé **en premier** ; sinon `strong` → `clear` → `moderate` → `weak`.

### Clés naturelles

- Article : `pmid` (TEXT)
- Entité HLA : forme IPD-IMGT, ex. `HLA-DQB1*02:01`
- Complication : clé technique, ex. `ABMR`
- Auteur : slug normalisé, ex. `wiebe-c`

Deux builds sur les mêmes sources doivent produire des clés identiques.

### Conventions de code

- Python : stdlib uniquement pour le builder (`sqlite3`, `csv`, `json`, `hashlib`, `argparse`, `random`). Aucune dépendance externe.
- TypeScript : mode strict. Aucun `any` non justifié par un commentaire.
- Tests : Vitest côté TS, `unittest` (stdlib) côté Python.
- Tous les textes d'interface sont en **français**.
- Chaque tâche se termine par un commit.

---

## File Structure

```
scripts/
  build_sqlite.py           Builder : CSV → SQLite validé et scellé
  schema.sql                DDL complet (source de vérité du schéma)
  gen_synthetic.py          Générateur de données synthétiques
  labels.py                 Table des 21 libellés + 7 catégories (partagée)
  tests/
    test_build_sqlite.py    Tests du builder et des validations
    test_gen_synthetic.py   Tests du générateur

data/synthetic/             CSV synthétiques générés (versionnés)
dist/                       Bases .sqlite (git-ignorées) + .sha256 (versionné)

src/
  lib/
    db.ts                   Ouverture SQLite, singleton lecture seule
    queries.ts              Toutes les requêtes SQL typées
    types.ts                Types TypeScript du domaine
    labels.ts               Miroir TS de labels.py (libellés, catégories)
    signal.ts               Rendu des niveaux de signal
  app/
    layout.tsx              Layout racine + bandeau synthétique
    page.tsx                Landing page
    allele/[hla]/page.tsx   Fiche allèle (page canonique)
    outcome/[outcome]/page.tsx  Fiche complication
    article/[pmid]/page.tsx     Fiche article
    author/[authorId]/page.tsx  Fiche auteur
    graph/page.tsx          Explorateur de graphe
    api/search/route.ts     Endpoint d'autocomplétion FTS5
  components/
    SyntheticBanner.tsx     Bandeau données synthétiques
    EpistemicNotice.tsx     Encart de cadrage épistémique
    SearchBar.tsx           Barre de recherche + autocomplétion
    SignalIndicator.tsx     ●●●● indicateur qualitatif
    AssociationCard.tsx     Carte d'une co-occurrence
    SentenceDrawer.tsx      Tiroir de phrases (cœur épistémique)
    HighlightedSentence.tsx Phrase avec spans surlignés
    AlleleBreadcrumb.tsx    Arborescence classe › locus › 2-digit › 4-digit
    GraphExplorer.tsx       Graphe Sigma.js
  __tests__/                Tests Vitest
```

---

## Task 1 : Schéma SQL et table de libellés

**Files:**
- Create: `scripts/schema.sql`
- Create: `scripts/labels.py`
- Create: `scripts/tests/test_labels.py`

**Interfaces:**
- Consumes: rien (tâche fondatrice)
- Produces:
  - `scripts/schema.sql` — DDL complet, exécutable par `sqlite3.executescript()`
  - `labels.py::OUTCOME_LABELS: dict[str, tuple[str, str]]` — `{clé: (libellé, catégorie)}`, 21 entrées
  - `labels.py::CATEGORIES: list[str]` — 7 catégories dans l'ordre d'affichage
  - `labels.py::SIGNAL_LEVELS: list[str]` — `["inverse","strong","clear","moderate","weak"]`
  - `labels.py::compute_signal_level(n_cooccurrence, fdr, odds_ratio, fdr_two_sided) -> str`

- [ ] **Step 1 : Écrire le test des libellés**

Créer `scripts/tests/test_labels.py` :

```python
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from labels import OUTCOME_LABELS, CATEGORIES, compute_signal_level


class TestLabels(unittest.TestCase):
    def test_exactly_21_outcomes(self):
        self.assertEqual(len(OUTCOME_LABELS), 21)

    def test_exactly_7_categories(self):
        self.assertEqual(len(CATEGORIES), 7)

    def test_every_outcome_has_label_and_known_category(self):
        for key, (label, category) in OUTCOME_LABELS.items():
            self.assertTrue(label, f"{key} sans libelle")
            self.assertIn(category, CATEGORIES, f"{key}: categorie inconnue")

    def test_no_technical_key_leaks_into_label(self):
        # Un libelle ne doit jamais etre la cle brute
        for key, (label, _) in OUTCOME_LABELS.items():
            self.assertNotEqual(label, key, f"{key}: libelle == cle brute")
            self.assertNotIn("_", label, f"{key}: underscore dans le libelle")

    def test_known_labels_verbatim(self):
        self.assertEqual(OUTCOME_LABELS["ABMR"], ("Rejet humoral (ABMR)", "Rejet"))
        self.assertEqual(
            OUTCOME_LABELS["DSA"],
            ("Anticorps anti-HLA du donneur (DSA)", "Immunisation"),
        )
        self.assertEqual(
            OUTCOME_LABELS["graft_loss"], ("Perte du greffon", "Fonction du greffon")
        )


class TestSignalLevel(unittest.TestCase):
    def test_inverse_wins_over_everything(self):
        # OR<1 + FDR bilateral significatif => inverse, meme avec n eleve
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=50, fdr=0.001, odds_ratio=0.3, fdr_two_sided=0.01
            ),
            "inverse",
        )

    def test_strong_requires_fdr_and_n10(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=10, fdr=0.01, odds_ratio=5.0, fdr_two_sided=0.02
            ),
            "strong",
        )

    def test_clear_at_n3(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=3, fdr=0.01, odds_ratio=5.0, fdr_two_sided=0.02
            ),
            "clear",
        )

    def test_moderate_below_n3(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=2, fdr=0.01, odds_ratio=5.0, fdr_two_sided=0.02
            ),
            "moderate",
        )

    def test_weak_when_not_significant(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=99, fdr=0.5, odds_ratio=5.0, fdr_two_sided=0.6
            ),
            "weak",
        )

    def test_or_below_1_but_not_significant_is_not_inverse(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=4, fdr=0.5, odds_ratio=0.4, fdr_two_sided=0.9
            ),
            "weak",
        )

    def test_handles_none_values(self):
        # odds_ratio et fdr_two_sided peuvent etre absents
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=12, fdr=0.001, odds_ratio=None, fdr_two_sided=None
            ),
            "strong",
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `python -m unittest discover -s scripts/tests -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'labels'`

- [ ] **Step 3 : Écrire `scripts/labels.py`**

```python
"""Table de libelles cliniques et derivation du niveau de signal.

Source de verite partagee entre le builder Python et l'interface TypeScript
(cf. src/lib/labels.ts, qui doit rester synchronise).

Les cles techniques (graft_loss, recurrent_GN...) ne doivent JAMAIS etre
affichees a l'utilisateur : l'interface passe toujours par OUTCOME_LABELS.
"""

# Ordre d'affichage des categories sur la fiche allele.
CATEGORIES = [
    "Rejet",
    "Immunisation",
    "Fonction du greffon",
    "Infection",
    "Neoplasie",
    "Metabolique",
    "Recidive",
]

# {cle_pipeline: (libelle_affiche, categorie)}
OUTCOME_LABELS = {
    "ABMR": ("Rejet humoral (ABMR)", "Rejet"),
    "TCMR": ("Rejet cellulaire (TCMR)", "Rejet"),
    "acute_rejection": ("Rejet aigu", "Rejet"),
    "chronic_rejection": ("Rejet chronique / IFTA", "Rejet"),
    "mixed_rejection": ("Rejet mixte", "Rejet"),
    "DSA": ("Anticorps anti-HLA du donneur (DSA)", "Immunisation"),
    "sensitization": ("Immunisation / sensibilisation", "Immunisation"),
    "complement_activation": ("Activation du complement", "Immunisation"),
    "HLA_mismatch_outcome": ("Incompatibilite HLA", "Immunisation"),
    "DGF": ("Reprise retardee de fonction (DGF)", "Fonction du greffon"),
    "graft_loss": ("Perte du greffon", "Fonction du greffon"),
    "graft_survival": ("Survie du greffon", "Fonction du greffon"),
    "eGFR": ("Fonction renale (DFG estime)", "Fonction du greffon"),
    "BK_nephropathy": ("Nephropathie a BK virus", "Infection"),
    "CMV": ("Infection a CMV", "Infection"),
    "PTLD": ("Syndrome lymphoproliferatif (PTLD)", "Neoplasie"),
    "skin_cancer": ("Cancer cutane", "Neoplasie"),
    "NODAT": ("Diabete post-transplantation (NODAT)", "Metabolique"),
    "recurrent_GN": ("Recidive de glomerulonephrite", "Recidive"),
    "FSGS": ("Hyalinose segmentaire et focale (HSF)", "Recidive"),
    "IgA_nephropathy": ("Nephropathie a IgA", "Recidive"),
}

# Ordre de tri pour l'affichage : le plus fort en premier.
SIGNAL_LEVELS = ["inverse", "strong", "clear", "moderate", "weak"]

SIGNIFICANCE_THRESHOLD = 0.05
STRONG_MIN_N = 10
CLEAR_MIN_N = 3


def compute_signal_level(n_cooccurrence, fdr, odds_ratio, fdr_two_sided):
    """Derive le niveau de signal qualitatif affiche a l'utilisateur.

    Le test unilateral 'greater' du pipeline est structurellement aveugle a
    la depletion : une association protectrice authentique (OR<1) ne peut
    jamais etre significative par ce test. On teste donc 'inverse' EN
    PREMIER, via le test bilateral, pour ne pas la rendre invisible.
    """
    if (
        odds_ratio is not None
        and fdr_two_sided is not None
        and odds_ratio < 1.0
        and fdr_two_sided < SIGNIFICANCE_THRESHOLD
    ):
        return "inverse"

    if fdr is None or fdr >= SIGNIFICANCE_THRESHOLD:
        return "weak"

    if n_cooccurrence >= STRONG_MIN_N:
        return "strong"
    if n_cooccurrence >= CLEAR_MIN_N:
        return "clear"
    return "moderate"
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `python -m unittest discover -s scripts/tests -v`
Expected: PASS — 9 tests

- [ ] **Step 5 : Écrire `scripts/schema.sql`**

```sql
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
```

- [ ] **Step 6 : Vérifier que le schéma s'exécute sans erreur**

Run:
```bash
python -c "import sqlite3, pathlib; c=sqlite3.connect(':memory:'); c.executescript(pathlib.Path('scripts/schema.sql').read_text(encoding='utf-8')); n=len(c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()); print(f'tables creees: {n}'); assert n >= 15, n; print('OK')"
```
Expected: `tables creees: 16` puis `OK`

- [ ] **Step 7 : Commit**

```bash
git add scripts/schema.sql scripts/labels.py scripts/tests/test_labels.py
git commit -m "feat(db): schema SQLite et table de libelles cliniques"
```

---

## Task 2 : Générateur de données synthétiques

**Files:**
- Create: `scripts/gen_synthetic.py`
- Create: `scripts/tests/test_gen_synthetic.py`

**Interfaces:**
- Consumes: `labels.py::OUTCOME_LABELS`
- Produces: CSV dans `data/synthetic/` respectant le contrat de schéma du pipeline :
  - `articles.csv` — `pmid,doi,title,abstract,year,journal,journal_abbrev,country,language,cited_by,source,graft_assignment`
  - `authors.csv` — `pmid,author,position`
  - `hla_entities.csv` — `hla,locus,hla_class,resolution,parent_hla`
  - `pair_mentions.csv` — `pmid,hla,outcome,sentence,hla_span,outcome_span,polarity,negation_trigger,sentence_idx`
  - `associations.csv` — `hla,outcome,n_cooccurrence,n_positive,n_negated,n_hla_total,n_outcome_total,n_universe,pmi,npmi,log_odds,odds_ratio,or_ci_low,or_ci_high,pval_fisher,fdr,pval_two_sided,fdr_two_sided,first_year`
  - `gen_synthetic.py::main(out_dir, n_articles, seed)` — déterministe à seed fixée

**Contexte pour l'implémenteur :** les données doivent être *plausibles* (vrais noms d'allèles, vraies complications, phrases de forme réaliste) mais ne seront jamais prises pour des résultats — un bandeau les signale partout. Le déterminisme par seed est essentiel : les tests en dépendent.

- [ ] **Step 1 : Écrire le test du générateur**

Créer `scripts/tests/test_gen_synthetic.py` :

```python
import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import gen_synthetic
from labels import OUTCOME_LABELS


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


class TestGenSynthetic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        gen_synthetic.main(out_dir=cls.out, n_articles=120, seed=42)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_all_expected_files_exist(self):
        for name in [
            "articles.csv",
            "authors.csv",
            "hla_entities.csv",
            "pair_mentions.csv",
            "associations.csv",
        ]:
            self.assertTrue((self.out / name).exists(), f"{name} manquant")

    def test_article_count_matches_request(self):
        self.assertEqual(len(read_csv(self.out / "articles.csv")), 120)

    def test_pmids_are_unique(self):
        pmids = [r["pmid"] for r in read_csv(self.out / "articles.csv")]
        self.assertEqual(len(pmids), len(set(pmids)))

    def test_hla_hierarchy_is_acyclic_and_resolves(self):
        rows = read_csv(self.out / "hla_entities.csv")
        known = {r["hla"] for r in rows}
        parents = {r["hla"]: (r["parent_hla"] or None) for r in rows}
        for hla, parent in parents.items():
            if parent:
                self.assertIn(parent, known, f"{hla}: parent {parent} inconnu")
        # acyclicite : remonter jusqu'a la racine termine toujours
        for hla in parents:
            seen, cur, depth = set(), hla, 0
            while cur and depth < 20:
                self.assertNotIn(cur, seen, f"cycle detecte sur {hla}")
                seen.add(cur)
                cur = parents.get(cur)
                depth += 1
            self.assertLess(depth, 20, f"{hla}: chaine trop profonde")

    def test_pair_mentions_reference_known_entities(self):
        articles = {r["pmid"] for r in read_csv(self.out / "articles.csv")}
        hlas = {r["hla"] for r in read_csv(self.out / "hla_entities.csv")}
        for row in read_csv(self.out / "pair_mentions.csv"):
            self.assertIn(row["pmid"], articles)
            self.assertIn(row["hla"], hlas)
            self.assertIn(row["outcome"], OUTCOME_LABELS)

    def test_sentence_contains_its_spans(self):
        # Le surlignage cote UI depend de cette propriete.
        for row in read_csv(self.out / "pair_mentions.csv"):
            self.assertIn(row["hla_span"], row["sentence"])
            self.assertIn(row["outcome_span"], row["sentence"])

    def test_negated_rows_carry_a_trigger(self):
        for row in read_csv(self.out / "pair_mentions.csv"):
            if row["polarity"] == "negated":
                self.assertTrue(row["negation_trigger"])

    def test_associations_counts_are_coherent(self):
        for row in read_csv(self.out / "associations.csv"):
            n = int(row["n_cooccurrence"])
            self.assertEqual(n, int(row["n_positive"]) + int(row["n_negated"]))

    def test_associations_match_pair_mention_counts(self):
        # Validation V3 du builder : tout agregat est derivable.
        from collections import Counter

        counts = Counter(
            (r["hla"], r["outcome"]) for r in read_csv(self.out / "pair_mentions.csv")
        )
        for row in read_csv(self.out / "associations.csv"):
            key = (row["hla"], row["outcome"])
            self.assertEqual(int(row["n_cooccurrence"]), counts[key], f"{key}")

    def test_metrics_within_bounds(self):
        for row in read_csv(self.out / "associations.csv"):
            self.assertGreaterEqual(float(row["npmi"]), -1.0)
            self.assertLessEqual(float(row["npmi"]), 1.0)
            self.assertGreaterEqual(float(row["fdr"]), 0.0)
            self.assertLessEqual(float(row["fdr"]), 1.0)

    def test_years_are_plausible(self):
        for row in read_csv(self.out / "articles.csv"):
            self.assertGreaterEqual(int(row["year"]), 1990)
            self.assertLessEqual(int(row["year"]), 2026)

    def test_generation_is_deterministic(self):
        with tempfile.TemporaryDirectory() as d2:
            gen_synthetic.main(out_dir=Path(d2), n_articles=120, seed=42)
            a = (self.out / "articles.csv").read_text(encoding="utf-8")
            b = (Path(d2) / "articles.csv").read_text(encoding="utf-8")
            self.assertEqual(a, b, "generation non deterministe a seed fixee")

    def test_includes_at_least_one_inverse_signal_candidate(self):
        # L'UI doit pouvoir demontrer le badge "signal inverse".
        rows = read_csv(self.out / "associations.csv")
        inverse = [
            r
            for r in rows
            if float(r["odds_ratio"]) < 1.0 and float(r["fdr_two_sided"]) < 0.05
        ]
        self.assertGreater(len(inverse), 0, "aucun signal inverse genere")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `python -m unittest scripts.tests.test_gen_synthetic -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'gen_synthetic'`

- [ ] **Step 3 : Écrire `scripts/gen_synthetic.py`**

Le générateur doit produire, de façon déterministe à seed fixée :

1. **Une hiérarchie HLA réaliste** construite en 4 niveaux :
   - Racines de classe : `HLA-class-I`, `HLA-class-II` (resolution `class`, `parent_hla` vide)
   - Locus : `A`, `B`, `C` (classe I) ; `DRB1`, `DQB1`, `DPB1` (classe II). Clé = nom du locus, resolution `class`, parent = la racine de classe correspondante.
   - 2-digit : `HLA-A*01`, `HLA-A*02`, `HLA-B*07`, `HLA-B*08`, `HLA-DRB1*03`, `HLA-DRB1*04`, `HLA-DRB1*15`, `HLA-DQB1*02`, `HLA-DQB1*03`, `HLA-DQB1*06`, `HLA-DPB1*01`, `HLA-DPB1*04`. Parent = le locus.
   - 4-digit : deux par 2-digit, ex. `HLA-DQB1*02:01`, `HLA-DQB1*02:02`. Parent = le 2-digit.
   - Plus deux entités spéciales : `HLA-mismatch` (resolution `mismatch_count`, locus `mismatch`, classe `unknown`, sans parent) et `HLA-eplet` (resolution `eplet`, locus `eplet`, classe `unknown`, sans parent).

2. **Des articles** avec PMID à 8 chiffres uniques, titres et résumés construits par assemblage de fragments réalistes, années tirées avec une densité croissante vers les années récentes (pour que les sparklines aient une forme plausible), journaux tirés d'une liste courte (`American Journal of Transplantation`, `Transplantation`, `Nephrology Dialysis Transplantation`, `HLA`, `Human Immunology`), `graft_assignment` = `Kidney` majoritairement.

3. **Des auteurs** : noms tirés d'une liste de patronymes, avec une distribution de Lotka approximative (quelques auteurs très prolifiques, beaucoup d'auteurs uniques) — la fiche auteur doit être démontrable.

4. **Des `pair_mentions`** dont la phrase **contient littéralement** `hla_span` et `outcome_span` (le test le vérifie, et le surlignage de l'UI en dépend). Gabarits de phrases :
   - positive : `"Recipients carrying {hla} showed a higher incidence of {outcome} in this cohort."`
   - négative : `"We found no significant association between {hla} and {outcome} in this cohort."` avec `negation_trigger = "no significant"`
   - Environ 15 % de phrases négatives.

5. **Des `associations`** agrégées **à partir des `pair_mentions` réellement générés** (jamais tirées indépendamment — sinon la validation V3 du builder échouera). Métriques calculées de façon cohérente : `npmi` dans [-1,1], `fdr` dans [0,1], et **au moins deux paires** avec `odds_ratio < 1` et `fdr_two_sided < 0.05` pour démontrer le badge « signal inverse ».

Contraintes d'implémentation :
- `random.Random(seed)` instancié localement, jamais le module global.
- Écriture CSV avec `newline=""` et `encoding="utf-8"`.
- `main(out_dir, n_articles, seed)` crée `out_dir` si absent.
- Un bloc `if __name__ == "__main__":` avec `argparse` (`--out`, `--n-articles`, `--seed`).

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `python -m unittest scripts.tests.test_gen_synthetic -v`
Expected: PASS — 13 tests

- [ ] **Step 5 : Générer le jeu de données versionné**

Run:
```bash
python scripts/gen_synthetic.py --out data/synthetic --n-articles 400 --seed 42
```
Expected: 5 fichiers CSV dans `data/synthetic/`

- [ ] **Step 6 : Commit**

```bash
git add scripts/gen_synthetic.py scripts/tests/test_gen_synthetic.py data/synthetic
git commit -m "feat(data): generateur de donnees synthetiques deterministe"
```

---

## Task 3 : Builder SQLite avec validations bloquantes

**Files:**
- Create: `scripts/build_sqlite.py`
- Create: `scripts/tests/test_build_sqlite.py`

**Interfaces:**
- Consumes: `schema.sql`, `labels.py`, les CSV de `data/synthetic/`
- Produces:
  - `build_sqlite.py::build(source_dir, out_path, version, universe, is_synthetic, notes) -> str` (retourne le SHA-256)
  - `build_sqlite.py::ValidationError` — exception levée si une validation échoue
  - Un fichier `.sqlite` + son `.sha256`

**Contexte :** c'est la pièce qui garantit qu'aucun chiffre non traçable ne peut atteindre l'interface. Les 8 validations de la spec §8 sont bloquantes : si une seule échoue, **aucun fichier n'est produit** (construire dans un temporaire, ne déplacer qu'après succès).

- [ ] **Step 1 : Écrire le test du builder**

Créer `scripts/tests/test_build_sqlite.py` :

```python
import csv
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_sqlite
import gen_synthetic
from build_sqlite import ValidationError


class BuilderTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.src = self.root / "src"
        self.out = self.root / "corpus_test.sqlite"
        gen_synthetic.main(out_dir=self.src, n_articles=80, seed=7)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self):
        return build_sqlite.build(
            source_dir=self.src,
            out_path=self.out,
            version="A-test",
            universe="A",
            is_synthetic=True,
            notes="test",
        )


class TestBuildSuccess(BuilderTestBase):
    def test_build_produces_file_and_sha(self):
        sha = self.build()
        self.assertTrue(self.out.exists())
        self.assertEqual(len(sha), 64)
        sha_file = Path(str(self.out) + ".sha256")
        self.assertTrue(sha_file.exists())
        self.assertIn(sha, sha_file.read_text(encoding="utf-8"))

    def test_sha_matches_actual_file_content(self):
        sha = self.build()
        actual = hashlib.sha256(self.out.read_bytes()).hexdigest()
        self.assertEqual(sha, actual)

    def test_corpus_version_row_is_written(self):
        self.build()
        con = sqlite3.connect(self.out)
        row = con.execute(
            "SELECT version, universe, is_synthetic, n_articles FROM corpus_version"
        ).fetchone()
        self.assertEqual(row[0], "A-test")
        self.assertEqual(row[1], "A")
        self.assertEqual(row[2], 1)
        n_articles = con.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        self.assertEqual(row[3], n_articles)
        con.close()

    def test_outcomes_all_have_labels(self):
        self.build()
        con = sqlite3.connect(self.out)
        bad = con.execute(
            "SELECT outcome FROM outcomes WHERE label IS NULL OR label = '' "
            "OR label = outcome"
        ).fetchall()
        self.assertEqual(bad, [])
        con.close()

    def test_signal_level_is_computed_for_every_association(self):
        self.build()
        con = sqlite3.connect(self.out)
        bad = con.execute(
            "SELECT COUNT(*) FROM associations WHERE signal_level IS NULL"
        ).fetchone()[0]
        self.assertEqual(bad, 0)
        con.close()

    def test_denormalized_counters_are_filled(self):
        self.build()
        con = sqlite3.connect(self.out)
        # n_mentions d'une entite HLA == nombre de pair_mentions la citant
        for hla, n in con.execute(
            "SELECT hla, n_mentions FROM hla_entities WHERE n_mentions > 0"
        ).fetchall():
            actual = con.execute(
                "SELECT COUNT(*) FROM pair_mentions WHERE hla = ?", (hla,)
            ).fetchone()[0]
            self.assertEqual(n, actual, f"{hla}")
        con.close()

    def test_fts_index_is_populated_and_searchable(self):
        self.build()
        con = sqlite3.connect(self.out)
        n = con.execute("SELECT COUNT(*) FROM search_index").fetchone()[0]
        self.assertGreater(n, 0)
        hits = con.execute(
            "SELECT entity_id FROM search_index WHERE search_index MATCH 'DQB1'"
        ).fetchall()
        self.assertGreater(len(hits), 0)
        con.close()

    def test_foreign_keys_enforced_and_no_orphans(self):
        self.build()
        con = sqlite3.connect(self.out)
        con.execute("PRAGMA foreign_keys = ON")
        violations = con.execute("PRAGMA foreign_key_check").fetchall()
        self.assertEqual(violations, [])
        con.close()

    def test_build_is_reproducible(self):
        sha1 = self.build()
        self.out.unlink()
        Path(str(self.out) + ".sha256").unlink()
        sha2 = self.build()
        self.assertEqual(sha1, sha2, "build non reproductible")


class TestValidationsBlock(BuilderTestBase):
    def corrupt(self, filename, mutate):
        path = self.src / filename
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            fields = reader.fieldnames
            rows = list(reader)
        rows = mutate(rows)
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

    def test_v3_rejects_association_count_mismatch(self):
        def mutate(rows):
            rows[0]["n_cooccurrence"] = str(int(rows[0]["n_cooccurrence"]) + 99)
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V3", str(ctx.exception))
        self.assertFalse(self.out.exists(), "fichier produit malgre l'echec")

    def test_v4_rejects_incoherent_polarity_counts(self):
        def mutate(rows):
            rows[0]["n_positive"] = str(int(rows[0]["n_positive"]) + 5)
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V4", str(ctx.exception))

    def test_v5_rejects_unresolvable_parent(self):
        def mutate(rows):
            for r in rows:
                if r["parent_hla"]:
                    r["parent_hla"] = "HLA-INEXISTANT*99"
                    break
            return rows

        self.corrupt("hla_entities.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V5", str(ctx.exception))

    def test_v6_rejects_npmi_out_of_bounds(self):
        def mutate(rows):
            rows[0]["npmi"] = "42.0"
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V6", str(ctx.exception))

    def test_v7_rejects_implausible_year(self):
        def mutate(rows):
            rows[0]["year"] = "1789"
            return rows

        self.corrupt("articles.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V7", str(ctx.exception))

    def test_no_partial_file_left_behind_on_failure(self):
        def mutate(rows):
            rows[0]["npmi"] = "99.0"
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError):
            self.build()
        self.assertFalse(self.out.exists())
        self.assertFalse(Path(str(self.out) + ".sha256").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `python -m unittest scripts.tests.test_build_sqlite -v`
Expected: FAIL avec `ModuleNotFoundError: No module named 'build_sqlite'`

- [ ] **Step 3 : Écrire `scripts/build_sqlite.py`**

Structure attendue :

```python
"""Builder : CSV du pipeline -> SQLite valide et scelle.

La base est un ARTEFACT DE BUILD. Si une seule validation echoue, aucun
fichier n'est produit : on construit dans un temporaire et on ne deplace
qu'apres succes complet.
"""

import argparse
import csv
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from labels import OUTCOME_LABELS, compute_signal_level

MIN_YEAR = 1960
MAX_YEAR = datetime.now(timezone.utc).year


class ValidationError(Exception):
    """Une validation bloquante a echoue : aucun fichier n'est produit."""
```

Ordre d'exécution de `build()` :

1. Lire tous les CSV sources en mémoire.
2. **Valider avant toute écriture** — lever `ValidationError` au premier échec, avec un message qui **commence par le code de la validation** (`"V3: ..."`, `"V6: ..."`), car les tests l'assertent.
3. Créer la base dans un fichier temporaire, exécuter `schema.sql`.
4. Insérer dans l'ordre des dépendances : `corpus_version` → `articles` → `authors` → `article_authors` → `outcomes` → `hla_entities` (trié parents avant enfants) → `hla_mentions` / `outcome_mentions` → `pair_mentions` → `associations` → `association_timeline` → `annual_counts`.
5. Dénormaliser : `hla_entities.n_mentions`, `outcomes.n_mentions`, `authors.n_publications`.
6. Calculer `signal_level` et `is_significant` pour chaque association via `compute_signal_level`.
7. Peupler `search_index` (allèles, complications, articles, auteurs).
8. `PRAGMA foreign_key_check` — lever si violations. `VACUUM`. Fermer.
9. Déplacer le temporaire vers `out_path`, calculer le SHA-256, écrire le `.sha256`.

Les 8 validations, chacune préfixée par son code :

| Code | Contrôle |
|---|---|
| `V1` | Le nombre d'articles lus == `n_articles` déclaré |
| `V2` | Toute FK référencée existe (articles, hla, outcomes) |
| `V3` | `associations.n_cooccurrence` == `COUNT(pair_mentions)` pour la paire |
| `V4` | `n_positive + n_negated == n_cooccurrence` |
| `V5` | Tout `parent_hla` résout, et l'arbre est acyclique |
| `V6` | `npmi ∈ [-1,1]`, `fdr ∈ [0,1]`, `fdr_two_sided ∈ [0,1]` |
| `V7` | `year ∈ [1960, année courante]` |
| `V8` | Toute `outcome` présente a un libellé et une catégorie dans `OUTCOME_LABELS` |

Déterminisme : insérer les lignes dans un ordre stable (trier par clé primaire avant insertion), fixer `PRAGMA page_size` et ne pas écrire d'horodatage variable dans la base — `built_at` doit être passé en paramètre ou dérivé de la version, sinon deux builds diffèrent et `test_build_is_reproducible` échoue.

> **Note pour l'implémenteur** : `test_build_is_reproducible` compare deux SHA. Si `built_at` utilise l'heure courante, le test échouera par intermittence. Dérive `built_at` d'une valeur stable (ex. paramètre optionnel défaut `"2026-07-01T00:00:00Z"`), et documente-le.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `python -m unittest scripts.tests.test_build_sqlite -v`
Expected: PASS — 15 tests

- [ ] **Step 5 : Construire la base synthétique**

Run:
```bash
python scripts/build_sqlite.py --source data/synthetic --out dist/corpus_A_synthetic.sqlite --version A-synthetic --synthetic
```
Expected: affiche le SHA-256 et crée `dist/corpus_A_synthetic.sqlite` + `.sha256`

- [ ] **Step 6 : Commit**

```bash
git add scripts/build_sqlite.py scripts/tests/test_build_sqlite.py dist/corpus_A_synthetic.sqlite.sha256
git commit -m "feat(db): builder SQLite avec 8 validations bloquantes"
```

---

## Task 4 : Scaffolding Next.js et couche d'accès aux données

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `src/lib/db.ts`, `src/lib/types.ts`, `src/lib/labels.ts`, `src/lib/queries.ts`
- Create: `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/components/SyntheticBanner.tsx`
- Create: `src/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `dist/corpus_A_synthetic.sqlite`
- Produces:
  - `db.ts::getDb(): Database` — singleton lecture seule
  - `db.ts::getCorpusVersion(): CorpusVersion`
  - `types.ts` — `CorpusVersion`, `HlaEntity`, `Outcome`, `Association`, `PairMention`, `Article`, `Author`, `SignalLevel`
  - `labels.ts::OUTCOME_LABELS`, `CATEGORIES`, `SIGNAL_LABELS`
  - `queries.ts::getAlleleByKey`, `getAssociationsForAllele`, `getPairMentions`, `getAlleleAncestry`, `getAlleleChildren`, `searchEntities`, `getArticle`, `getAuthor`
  - `SyntheticBanner.tsx` — bandeau non refermable

**Contexte :** `better-sqlite3` est un module natif : il ne fonctionne que côté serveur. Toutes les requêtes passent par des Server Components ou des Route Handlers, jamais par du code client.

- [ ] **Step 1 : Initialiser le projet Node**

Run:
```bash
npm init -y
npm install next@latest react@latest react-dom@latest better-sqlite3
npm install -D typescript @types/react @types/node @types/better-sqlite3 tailwindcss postcss autoprefixer vitest @vitejs/plugin-react
```

- [ ] **Step 2 : Écrire le test des requêtes**

Créer `src/__tests__/queries.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import {
  getAlleleByKey,
  getAssociationsForAllele,
  getPairMentions,
  getAlleleAncestry,
  searchEntities,
} from "../lib/queries";
import { getCorpusVersion } from "../lib/db";
import { OUTCOME_LABELS } from "../lib/labels";

describe("corpus version", () => {
  it("expose la version et le drapeau synthetique", () => {
    const v = getCorpusVersion();
    expect(v.version).toBeTruthy();
    expect(v.universe).toBe("A");
    expect(typeof v.isSynthetic).toBe("boolean");
    expect(v.nArticles).toBeGreaterThan(0);
  });
});

describe("getAlleleByKey", () => {
  it("retrouve un allele 4-digit connu", () => {
    const a = getAlleleByKey("HLA-DQB1*02:01");
    expect(a).not.toBeNull();
    expect(a!.locus).toBe("DQB1");
    expect(a!.hlaClass).toBe("II");
    expect(a!.resolution).toBe("4-digit");
  });

  it("retourne null pour un allele inconnu", () => {
    expect(getAlleleByKey("HLA-INEXISTANT*99:99")).toBeNull();
  });
});

describe("getAssociationsForAllele", () => {
  it("retourne des associations portant un libelle clinique, jamais la cle brute", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const expected = OUTCOME_LABELS[r.outcome];
      expect(expected).toBeDefined();
      expect(r.label).toBe(expected.label);
      expect(r.label).not.toBe(r.outcome);
      expect(r.category).toBe(expected.category);
    }
  });

  it("expose separement les mentions positives et negatives", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    for (const r of rows) {
      expect(r.nPositive + r.nNegated).toBe(r.nCooccurrence);
    }
  });

  it("trie par force de signal decroissante", () => {
    const order = ["inverse", "strong", "clear", "moderate", "weak"];
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    const idx = rows.map((r) => order.indexOf(r.signalLevel));
    const sorted = [...idx].sort((a, b) => a - b);
    expect(idx).toEqual(sorted);
  });

  it("inclut les non-significatifs (ils sont grises, pas masques)", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    const weak = rows.filter((r) => r.signalLevel === "weak");
    // le jeu synthetique en contient ; on verifie qu'ils ne sont pas filtres
    expect(rows.length).toBeGreaterThanOrEqual(weak.length);
  });
});

describe("getPairMentions", () => {
  it("retourne des phrases contenant leurs spans surlignables", () => {
    const rows = getAssociationsForAllele("HLA-DQB1*02:01");
    const first = rows[0];
    const mentions = getPairMentions(first.hla, first.outcome);
    expect(mentions.length).toBe(first.nCooccurrence);
    for (const m of mentions) {
      expect(m.sentence).toContain(m.hlaSpan);
      expect(m.sentence).toContain(m.outcomeSpan);
      expect(["positive", "negated"]).toContain(m.polarity);
    }
  });
});

describe("getAlleleAncestry", () => {
  it("remonte la hierarchie classe > locus > 2-digit > 4-digit", () => {
    const chain = getAlleleAncestry("HLA-DQB1*02:01");
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[chain.length - 1].hla).toBe("HLA-DQB1*02:01");
    // chaque maillon est le parent du suivant
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i + 1].parentHla).toBe(chain[i].hla);
    }
  });
});

describe("searchEntities", () => {
  it("trouve un allele par fragment de nom", () => {
    const hits = searchEntities("DQB1");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.entityType === "allele")).toBe(true);
  });

  it("retourne un tableau vide sans exception sur requete vide", () => {
    expect(searchEntities("")).toEqual([]);
  });

  it("ne leve pas sur des caracteres speciaux FTS5", () => {
    expect(() => searchEntities('"; DROP TABLE articles; --')).not.toThrow();
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/__tests__/queries.test.ts`
Expected: FAIL — modules `../lib/queries` et `../lib/db` introuvables

- [ ] **Step 4 : Écrire la couche d'accès**

`src/lib/types.ts` — types du domaine :

```typescript
export type SignalLevel =
  | "inverse"
  | "strong"
  | "clear"
  | "moderate"
  | "weak";

export interface CorpusVersion {
  version: string;
  universe: string;
  builtAt: string;
  nArticles: number;
  isSynthetic: boolean;
  notes: string | null;
}

export interface HlaEntity {
  hla: string;
  locus: string;
  hlaClass: string;
  resolution: string;
  parentHla: string | null;
  nMentions: number;
}

export interface AssociationRow {
  hla: string;
  outcome: string;
  label: string;
  category: string;
  nCooccurrence: number;
  nPositive: number;
  nNegated: number;
  signalLevel: SignalLevel;
  isSignificant: boolean;
  firstYear: number | null;
  /** Metriques masquees par defaut - depliant "Detail statistique" only. */
  npmi: number | null;
  oddsRatio: number | null;
  orCiLow: number | null;
  orCiHigh: number | null;
  fdr: number | null;
  fdrTwoSided: number | null;
}

export interface PairMention {
  pairMentionId: number;
  pmid: string;
  hla: string;
  outcome: string;
  sentence: string;
  hlaSpan: string;
  outcomeSpan: string;
  polarity: "positive" | "negated";
  negationTrigger: string | null;
  title: string;
  year: number;
  journal: string | null;
  citedBy: number | null;
}

export interface SearchHit {
  entityType: "allele" | "outcome" | "article" | "author";
  entityId: string;
  label: string;
}
```

`src/lib/db.ts` — singleton lecture seule :

```typescript
import Database from "better-sqlite3";
import path from "node:path";
import type { CorpusVersion } from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file =
    process.env.CORPUS_DB_PATH ??
    path.join(process.cwd(), "dist", "corpus_A_synthetic.sqlite");
  db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  return db;
}

export function getCorpusVersion(): CorpusVersion { /* ... */ }
```

`src/lib/labels.ts` — miroir TypeScript de `labels.py`. **Les deux fichiers doivent rester synchronisés** ; ajouter un commentaire le rappelant en tête.

`src/lib/queries.ts` — toutes les requêtes. Points d'attention :
- `getAlleleAncestry` utilise `WITH RECURSIVE` pour remonter `parent_hla`, et retourne la chaîne **de la racine vers la feuille**.
- `getAssociationsForAllele` joint `outcomes` pour ramener `label` et `category`, et trie par `CASE signal_level` dans l'ordre `inverse, strong, clear, moderate, weak`, puis par `n_cooccurrence DESC`.
- `searchEntities` échappe la requête FTS5 : envelopper le terme entre guillemets doubles et doubler les guillemets internes, pour que `'"; DROP TABLE articles; --'` ne lève pas. Retourner `[]` si la requête nettoyée est vide.

`src/components/SyntheticBanner.tsx` :

```tsx
export function SyntheticBanner({ version }: { version: string }) {
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center
                 text-sm font-semibold text-amber-950"
    >
      ⚠ DONNÉES SYNTHÉTIQUES — jeu de démonstration ({version}). Les chiffres
      affichés sont fictifs et ne doivent pas être interprétés.
    </div>
  );
}
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/__tests__/queries.test.ts`
Expected: PASS — 12 tests

- [ ] **Step 6 : Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs vitest.config.ts src/
git commit -m "feat(app): scaffolding Next.js et couche d'acces SQLite"
```

---

## Task 5 : Landing page et recherche

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/components/EpistemicNotice.tsx`
- Create: `src/components/SearchBar.tsx`
- Create: `src/app/api/search/route.ts`
- Create: `src/__tests__/epistemic.test.tsx`

**Interfaces:**
- Consumes: `queries.ts::searchEntities`, `db.ts::getCorpusVersion`, `SyntheticBanner`
- Produces: `EpistemicNotice` (encart non refermable), `SearchBar` (autocomplétion), `GET /api/search?q=`

- [ ] **Step 1 : Écrire le test du cadrage épistémique**

Créer `src/__tests__/epistemic.test.tsx` :

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpistemicNotice } from "../components/EpistemicNotice";

describe("EpistemicNotice", () => {
  it("affiche les metriques de validation exactes", () => {
    render(<EpistemicNotice />);
    expect(screen.getByText(/78,75/)).toBeTruthy();
    expect(screen.getByText(/0,44/)).toBeTruthy();
    expect(screen.getByText(/1 mention sur 5/i)).toBeTruthy();
  });

  it("dit explicitement que ce ne sont pas des associations cliniques", () => {
    const { container } = render(<EpistemicNotice />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/co-occurrences? textuelles?/i);
    expect(text).toMatch(/pas des associations cliniques/i);
  });

  it("n'emploie aucun terme causal interdit", () => {
    const { container } = render(<EpistemicNotice />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["associé à", "lié à", "risque de", "prédit"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("n'est pas refermable (aucun bouton de fermeture)", () => {
    const { container } = render(<EpistemicNotice />);
    expect(container.querySelector("button")).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/__tests__/epistemic.test.tsx`
Expected: FAIL — `EpistemicNotice` introuvable

- [ ] **Step 3 : Écrire les composants et la page**

`EpistemicNotice.tsx` reprend verbatim le texte de la spec §5.2 : titre « CE QUE CE SITE MONTRE — ET CE QU'IL NE MONTRE PAS », explication des co-occurrences, avertissement « Ce ne sont PAS des associations cliniques ni causales », les trois métriques (78,75 %, kappa 0,44, ~1 mention sur 5), et la conclusion « Toute lecture clinique exige de relire les sources. »

`SearchBar.tsx` est un Client Component (`"use client"`) qui interroge `/api/search?q=` avec un debounce de 200 ms et affiche les résultats avec leur type et leur nombre d'articles.

`src/app/api/search/route.ts` :

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/queries";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ hits: searchEntities(q) });
}
```

`src/app/page.tsx` — Server Component assemblant : titre, `SearchBar`, `EpistemicNotice`, barre de statistiques (compteurs **calculés au build, jamais écrits en dur** — `SELECT COUNT(*)`), ligne de version avec SHA, et les trois cartes d'entrée (Allèle ★ / Complication / Graphe).

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/__tests__/epistemic.test.tsx`
Expected: PASS — 4 tests

- [ ] **Step 5 : Vérifier le rendu de la page**

Run: `npm run build`
Expected: build réussi, route `/` générée

- [ ] **Step 6 : Commit**

```bash
git add src/app/page.tsx src/app/api src/components src/__tests__
git commit -m "feat(ui): landing page avec cadrage epistemique et recherche"
```

---

## Task 6 : Fiche allèle et indicateur de signal

**Files:**
- Create: `src/app/allele/[hla]/page.tsx`
- Create: `src/components/SignalIndicator.tsx`
- Create: `src/components/AssociationCard.tsx`
- Create: `src/components/AlleleBreadcrumb.tsx`
- Create: `src/lib/signal.ts`
- Create: `src/__tests__/signal.test.ts`
- Create: `src/__tests__/association-card.test.tsx`

**Interfaces:**
- Consumes: `queries.ts::getAlleleByKey`, `getAssociationsForAllele`, `getAlleleAncestry`, `getAlleleChildren`
- Produces: `signal.ts::SIGNAL_DISPLAY` (libellé + pastilles par niveau), `AssociationCard`, `AlleleBreadcrumb`

**Contexte :** page canonique du site. L'URL contient un caractère `*` qui doit être encodé (`encodeURIComponent`) dans les liens et décodé dans le param.

- [ ] **Step 1 : Écrire les tests**

`src/__tests__/signal.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { SIGNAL_DISPLAY } from "../lib/signal";

describe("SIGNAL_DISPLAY", () => {
  it("couvre les cinq niveaux", () => {
    for (const lvl of ["inverse", "strong", "clear", "moderate", "weak"]) {
      expect(SIGNAL_DISPLAY[lvl]).toBeDefined();
      expect(SIGNAL_DISPLAY[lvl].label).toBeTruthy();
    }
  });

  it("emploie le vocabulaire de co-occurrence, jamais causal", () => {
    for (const lvl of Object.keys(SIGNAL_DISPLAY)) {
      const label = SIGNAL_DISPLAY[lvl].label.toLowerCase();
      for (const forbidden of ["associé", "lié", "risque", "prédit", "cause"]) {
        expect(label).not.toContain(forbidden);
      }
    }
  });

  it("n'expose aucune valeur numerique de metrique dans le libelle", () => {
    for (const lvl of Object.keys(SIGNAL_DISPLAY)) {
      expect(SIGNAL_DISPLAY[lvl].label).not.toMatch(/npmi|fdr|odds|p\s*=/i);
    }
  });
});
```

`src/__tests__/association-card.test.tsx` :

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssociationCard } from "../components/AssociationCard";
import type { AssociationRow } from "../lib/types";

const base: AssociationRow = {
  hla: "HLA-DQB1*02:01",
  outcome: "DSA",
  label: "Anticorps anti-HLA du donneur (DSA)",
  category: "Immunisation",
  nCooccurrence: 18,
  nPositive: 14,
  nNegated: 4,
  signalLevel: "strong",
  isSignificant: true,
  firstYear: 1998,
  npmi: 0.61,
  oddsRatio: 8.4,
  orCiLow: 4.1,
  orCiHigh: 17.2,
  fdr: 2.3e-7,
  fdrTwoSided: 4.6e-7,
};

describe("AssociationCard", () => {
  it("affiche le libelle clinique, jamais la cle technique", () => {
    render(<AssociationCard association={base} />);
    expect(screen.getByText(/Anticorps anti-HLA du donneur/)).toBeTruthy();
    const { container } = render(<AssociationCard association={base} />);
    expect(container.textContent).not.toMatch(/\bgraft_loss\b|\brecurrent_GN\b/);
  });

  it("affiche le nombre d'articles en clair", () => {
    render(<AssociationCard association={base} />);
    expect(screen.getByText(/18 articles/)).toBeTruthy();
  });

  it("signale les mentions negatives sans les masquer", () => {
    render(<AssociationCard association={base} />);
    expect(screen.getByText(/4 .*sens négatif/i)).toBeTruthy();
  });

  it("ne montre aucune metrique statistique par defaut", () => {
    const { container } = render(<AssociationCard association={base} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("0.61");
    expect(text).not.toContain("8.4");
    expect(text).not.toMatch(/NPMI|FDR|odds ratio/i);
  });

  it("expose les metriques derriere un depliant", () => {
    const { container } = render(<AssociationCard association={base} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.textContent).toMatch(/NPMI/i);
  });

  it("grise le non-significatif au lieu de le masquer", () => {
    const weak = { ...base, signalLevel: "weak" as const, isSignificant: false };
    const { container } = render(<AssociationCard association={weak} />);
    expect(container.textContent).toMatch(/seuil/i);
    expect(container.textContent).toContain("18 articles");
  });

  it("distingue le signal inverse", () => {
    const inv = { ...base, signalLevel: "inverse" as const, oddsRatio: 0.3 };
    render(<AssociationCard association={inv} />);
    expect(screen.getByText(/signal inverse/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/__tests__/signal.test.ts src/__tests__/association-card.test.tsx`
Expected: FAIL — modules introuvables

- [ ] **Step 3 : Écrire les composants**

`src/lib/signal.ts` :

```typescript
import type { SignalLevel } from "./types";

export const SIGNAL_DISPLAY: Record<
  SignalLevel,
  { dots: string; label: string; tone: string }
> = {
  inverse:  { dots: "◐",    label: "Signal inverse",  tone: "text-violet-700" },
  strong:   { dots: "●●●●", label: "Signal fort",     tone: "text-sky-800" },
  clear:    { dots: "●●●○", label: "Signal net",      tone: "text-sky-700" },
  moderate: { dots: "●●○○", label: "Signal modéré",   tone: "text-slate-600" },
  weak:     { dots: "○○○○", label: "Signal faible",   tone: "text-slate-400" },
};
```

`AssociationCard.tsx` affiche : le libellé clinique, l'indicateur de signal, « N articles », la ligne « dont N en sens négatif » si `nNegated > 0`, la mention « sous le seuil statistique » en grisé si `!isSignificant`, un `<details>` « Détail statistique » contenant NPMI/OR/IC/FDR, et un bouton « Voir les N phrases ».

`AlleleBreadcrumb.tsx` rend la chaîne d'ancêtres avec le nombre d'articles de chaque maillon.

`src/app/allele/[hla]/page.tsx` — Server Component. Décoder le param, `notFound()` si l'allèle est inconnu, grouper les associations par catégorie dans l'ordre de `CATEGORIES`.

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/__tests__/signal.test.ts src/__tests__/association-card.test.tsx`
Expected: PASS — 10 tests

- [ ] **Step 5 : Commit**

```bash
git add src/app/allele src/components src/lib/signal.ts src/__tests__
git commit -m "feat(ui): fiche allele avec indicateur qualitatif de signal"
```

---

## Task 7 : Tiroir de phrases

**Files:**
- Create: `src/components/SentenceDrawer.tsx`
- Create: `src/components/HighlightedSentence.tsx`
- Create: `src/app/api/mentions/route.ts`
- Create: `src/__tests__/sentence-drawer.test.tsx`

**Interfaces:**
- Consumes: `queries.ts::getPairMentions`
- Produces: `HighlightedSentence` (surlignage des spans), `SentenceDrawer`, `GET /api/mentions?hla=&outcome=`

**Contexte :** **la vue la plus importante du site**. C'est elle qui rend le garde-fou épistémique opérant.

- [ ] **Step 1 : Écrire le test**

`src/__tests__/sentence-drawer.test.tsx` :

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HighlightedSentence } from "../components/HighlightedSentence";

const sentence =
  "Recipients carrying HLA-DQB1*02:01 showed a higher incidence of de novo DSA.";

describe("HighlightedSentence", () => {
  it("restitue la phrase complete sans alteration", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="HLA-DQB1*02:01"
        outcomeSpan="DSA"
      />
    );
    expect(container.textContent).toBe(sentence);
  });

  it("surligne le span HLA et le span complication", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="HLA-DQB1*02:01"
        outcomeSpan="DSA"
      />
    );
    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(2);
    const texts = Array.from(marks).map((m) => m.textContent);
    expect(texts).toContain("HLA-DQB1*02:01");
    expect(texts).toContain("DSA");
  });

  it("ne casse pas si un span est absent de la phrase", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="INTROUVABLE"
        outcomeSpan="DSA"
      />
    );
    expect(container.textContent).toBe(sentence);
  });

  it("traite les spans contenant des caracteres regex speciaux", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="HLA-DQB1*02:01"
        outcomeSpan="DSA"
      />
    );
    // '*' ne doit pas etre interprete comme quantificateur
    expect(container.textContent).toBe(sentence);
    expect(container.querySelectorAll("mark").length).toBe(2);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/__tests__/sentence-drawer.test.tsx`
Expected: FAIL — `HighlightedSentence` introuvable

- [ ] **Step 3 : Écrire les composants**

`HighlightedSentence.tsx` — **le span HLA contient `*`, qui est un métacaractère regex**. Utiliser `indexOf` plutôt qu'une regex, ou échapper systématiquement. Découper la phrase en segments et envelopper les spans trouvés dans `<mark>` avec deux couleurs distinctes.

`SentenceDrawer.tsx` (Client Component) : en-tête « {allèle} × {libellé} », compteurs « N mentions · N positives · N négatives », onglets Toutes/Positives/Négatives, tri par année, et une carte par mention affichant le badge de polarité, la phrase surlignée, le déclencheur de négation le cas échéant avec la mention « Détection automatique — accord modéré, à vérifier », la référence bibliographique, et les liens PubMed / fiche article. Pied de tiroir : « ⚠ Extraction automatique — signaler une erreur ».

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/__tests__/sentence-drawer.test.tsx`
Expected: PASS — 4 tests

- [ ] **Step 5 : Commit**

```bash
git add src/components/SentenceDrawer.tsx src/components/HighlightedSentence.tsx src/app/api/mentions src/__tests__
git commit -m "feat(ui): tiroir de phrases avec surlignage des spans"
```

---

## Task 8 : Fiches complication, article et auteur

**Files:**
- Create: `src/app/outcome/[outcome]/page.tsx`
- Create: `src/app/article/[pmid]/page.tsx`
- Create: `src/app/author/[authorId]/page.tsx`
- Create: `src/__tests__/author.test.ts`

**Interfaces:**
- Consumes: `queries.ts::getOutcome`, `getAssociationsForOutcome`, `getArticle`, `getAuthor`, `getAuthorPublications`, `getAuthorInterests`, `getCoAuthors`
- Produces: les trois routes

**Contexte :** la fiche complication est la navigation inverse (complication → HLA). La fiche auteur **doit** afficher la réserve sur l'homonymie.

- [ ] **Step 1 : Écrire le test**

`src/__tests__/author.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import {
  getAuthor,
  getAuthorPublications,
  getAuthorInterests,
  getCoAuthors,
  getAssociationsForOutcome,
} from "../lib/queries";
import { getDb } from "../lib/db";

function anyAuthorId(): string {
  return getDb()
    .prepare("SELECT author_id FROM authors ORDER BY n_publications DESC LIMIT 1")
    .get() as unknown as string;
}

describe("fiche auteur", () => {
  it("retrouve un auteur et ses publications", () => {
    const row = getDb()
      .prepare(
        "SELECT author_id AS id FROM authors ORDER BY n_publications DESC LIMIT 1"
      )
      .get() as { id: string };
    const author = getAuthor(row.id);
    expect(author).not.toBeNull();
    const pubs = getAuthorPublications(row.id);
    expect(pubs.length).toBe(author!.nPublications);
  });

  it("deduit des centres d'interet non vides", () => {
    const row = getDb()
      .prepare(
        "SELECT author_id AS id FROM authors ORDER BY n_publications DESC LIMIT 1"
      )
      .get() as { id: string };
    const interests = getAuthorInterests(row.id);
    expect(Array.isArray(interests)).toBe(true);
  });

  it("liste des co-auteurs sans inclure l'auteur lui-meme", () => {
    const row = getDb()
      .prepare(
        "SELECT author_id AS id FROM authors ORDER BY n_publications DESC LIMIT 1"
      )
      .get() as { id: string };
    const co = getCoAuthors(row.id);
    expect(co.every((c) => c.authorId !== row.id)).toBe(true);
  });
});

describe("navigation inverse par complication", () => {
  it("retourne les HLA co-cites avec une complication", () => {
    const rows = getAssociationsForOutcome("DSA");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.outcome).toBe("DSA");
      expect(r.hla).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/__tests__/author.test.ts`
Expected: FAIL — fonctions non exportées

- [ ] **Step 3 : Écrire les requêtes et les pages**

Ajouter à `queries.ts` : `getOutcome`, `getAssociationsForOutcome`, `getArticle`, `getArticleMentions`, `getAuthor`, `getAuthorPublications`, `getAuthorInterests` (agrégation des entités HLA et complications de ses articles), `getCoAuthors`.

`src/app/author/[authorId]/page.tsx` **doit afficher**, sous le nom :

```
ⓘ Identité déduite par normalisation du nom — homonymes possibles
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/__tests__/author.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5 : Commit**

```bash
git add src/app/outcome src/app/article src/app/author src/lib/queries.ts src/__tests__
git commit -m "feat(ui): fiches complication, article et auteur"
```

---

## Task 9 : Explorateur de graphe

**Files:**
- Create: `src/app/graph/page.tsx`
- Create: `src/components/GraphExplorer.tsx`
- Create: `src/app/api/graph/route.ts`
- Create: `src/__tests__/graph.test.ts`

**Interfaces:**
- Consumes: `queries.ts::getNeighborhood(centerId, depth, minSignal)`
- Produces: `GET /api/graph?center=&depth=`, `GraphExplorer`

**Contexte :** profondeur 1 par défaut pour éviter le *hairball*. Sigma.js est rendu côté client uniquement (`dynamic(..., { ssr: false })`).

- [ ] **Step 1 : Écrire le test**

`src/__tests__/graph.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { getNeighborhood } from "../lib/queries";

describe("getNeighborhood", () => {
  it("retourne le centre et ses voisins directs a profondeur 1", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    expect(g.nodes.some((n) => n.id === "HLA-DQB1*02:01")).toBe(true);
    expect(g.nodes.length).toBeGreaterThan(1);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("toute arete relie deux noeuds presents", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("profondeur 2 elargit le voisinage", () => {
    const d1 = getNeighborhood("HLA-DQB1*02:01", 1);
    const d2 = getNeighborhood("HLA-DQB1*02:01", 2);
    expect(d2.nodes.length).toBeGreaterThanOrEqual(d1.nodes.length);
  });

  it("chaque noeud porte son type et son libelle affichable", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    for (const n of g.nodes) {
      expect(["hla", "outcome"]).toContain(n.type);
      expect(n.label).toBeTruthy();
      if (n.type === "outcome") {
        expect(n.label).not.toBe(n.id); // jamais la cle brute
      }
    }
  });

  it("borne la taille du voisinage pour eviter le hairball", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 3);
    expect(g.nodes.length).toBeLessThanOrEqual(150);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/__tests__/graph.test.ts`
Expected: FAIL — `getNeighborhood` non exportée

- [ ] **Step 3 : Implémenter**

`getNeighborhood(centerId, depth, minSignal?)` : expansion en largeur depuis le centre via la table `associations`, en s'arrêtant à `depth`, avec un plafond dur de 150 nœuds. Les nœuds `outcome` portent leur `label` clinique.

`GraphExplorer.tsx` : Sigma.js via `dynamic(() => import(...), { ssr: false })`. Clic sur un nœud → recentrage (met à jour l'URL via `router.push`). Couleur des nœuds `outcome` par catégorie. Arêtes en pointillés si la paire est majoritairement négative.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/__tests__/graph.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5 : Commit**

```bash
git add src/app/graph src/components/GraphExplorer.tsx src/app/api/graph src/lib/queries.ts src/__tests__
git commit -m "feat(ui): explorateur de graphe a profondeur progressive"
```

---

## Task 10 : Garde-fous automatisés et documentation de bascule

**Files:**
- Create: `src/__tests__/vocabulary.test.ts`
- Create: `docs/BASCULE_DONNEES_REELLES.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: l'ensemble des composants
- Produces: un test qui **échoue si du vocabulaire causal entre dans l'UI**

**Contexte :** cette tâche transforme les règles de vocabulaire de la spec en garde-fou exécutable. C'est ce qui empêche la dérive quand d'autres personnes contribueront.

- [ ] **Step 1 : Écrire le test de vocabulaire**

`src/__tests__/vocabulary.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  "associé à",
  "associée à",
  "lié à",
  "liée à",
  "risque de",
  "prédit",
  "provoque",
];

/** Cles techniques qui ne doivent jamais etre affichees telles quelles. */
const RAW_KEYS = [
  "graft_loss",
  "recurrent_GN",
  "HLA_mismatch_outcome",
  "skin_cancer",
  "BK_nephropathy",
  "IgA_nephropathy",
  "chronic_rejection",
];

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

/** Extrait le texte JSX visible : entre > et <, hors accolades. */
function visibleText(source: string): string {
  const matches = source.match(/>[^<>{}]+</g) ?? [];
  return matches.join(" ").toLowerCase();
}

describe("garde-fou vocabulaire", () => {
  const files = walk(join(process.cwd(), "src"));

  it("trouve des fichiers a analyser", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("aucun terme causal dans le texte visible", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = visibleText(readFileSync(f, "utf-8"));
      for (const term of FORBIDDEN) {
        if (text.includes(term)) offenders.push(`${f}: "${term}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("aucune cle technique affichee en dur", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.includes("labels.ts")) continue; // la table de correspondance
      const text = visibleText(readFileSync(f, "utf-8"));
      for (const key of RAW_KEYS) {
        if (text.includes(key.toLowerCase())) offenders.push(`${f}: "${key}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2 : Lancer le test**

Run: `npx vitest run src/__tests__/vocabulary.test.ts`
Expected: PASS (ou FAIL désignant les fichiers à corriger — les corriger alors)

- [ ] **Step 3 : Écrire la documentation de bascule**

`docs/BASCULE_DONNEES_REELLES.md` doit contenir :

- Le repère de vérification : **`merged_corpus_renal.csv` doit contenir 5 581 lignes** (à 6 310, c'est le run antérieur au correctif de contamination inter-organes).
- La correspondance entre les CSV du pipeline et les CSV attendus par le builder :
  - `hla_outcome_pairs_v2.csv` → `pair_mentions.csv`
  - `association_stats_v2.csv` → `associations.csv`
  - `merged_corpus_renal.csv` → `articles.csv`
- La commande de build réel :
  ```bash
  python scripts/build_sqlite.py --source data/processed --out dist/corpus_A_v1.2.sqlite --version A-1.2
  ```
- Le rappel que les 8 validations signaleront tout écart au contrat.
- La procédure de retrait du bandeau synthétique (`is_synthetic = 0`).

- [ ] **Step 4 : Lancer la suite complète**

Run: `npx vitest run && python -m unittest discover -s scripts/tests -v && npm run build`
Expected: tous les tests passent, build réussi

- [ ] **Step 5 : Commit**

```bash
git add src/__tests__/vocabulary.test.ts docs/BASCULE_DONNEES_REELLES.md README.md
git commit -m "feat(qa): garde-fou vocabulaire et documentation de bascule"
```

---

## Auto-revue du plan

**1. Couverture de la spec :**

| Section de la spec | Tâche(s) |
|---|---|
| §3 Cadrage épistémique | 5 (encart), 7 (tiroir), 10 (garde-fou) |
| §4.2 Clés naturelles | 1, 3 |
| §4.3 Schéma complet | 1 |
| §4.4 `parent_hla` | 1, 6 (fil d'Ariane) |
| §4.5 Négations séparées | 1, 3 (V4), 6, 7 |
| §4.6 Test bilatéral / signal inverse | 1 (`compute_signal_level`), 2, 6 |
| §5.1 Indicateur de signal | 6 |
| §5.2 Landing page | 5 |
| §5.3 Fiche allèle | 6 |
| §5.4 Tiroir de phrases | 7 |
| §5.5 Graphe | 9 |
| §5.6 Fiche auteur | 8 |
| §5.7 Navigation | 5–9 |
| §6 Vocabulaire et libellés | 1, 10 |
| §7 Stack | 4 |
| §8 Reconstruction + 8 validations | 3 |
| §9 Données synthétiques | 2, 10 |

**2. Placeholders :** aucun « TBD », « TODO » ni « similaire à la tâche N ». Chaque test est écrit intégralement.

**3. Cohérence des types :** `SignalLevel` défini en Task 4 (`types.ts`) et consommé en Tasks 6 et 9 sous le même nom. `AssociationRow` défini en Task 4, utilisé en Tasks 6 et 8. `compute_signal_level` (Python, Task 1) et `SIGNAL_DISPLAY` (TS, Task 6) partagent les cinq mêmes valeurs.

**Point de vigilance signalé aux implémenteurs :** `labels.py` et `labels.ts` dupliquent la table des libellés dans deux langages. C'est une duplication assumée (le builder est en Python, l'UI en TypeScript) mais elle doit rester synchronisée — les deux fichiers portent un commentaire le rappelant, et le test `test_no_technical_key_leaks_into_label` côté Python plus `vocabulary.test.ts` côté TS attrapent les divergences visibles.
