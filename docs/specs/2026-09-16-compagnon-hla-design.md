# Compagnon d'exploration bibliométrique HLA × Complications
## Document de conception — Corpus A (espace allélique)

**Date** : 16/09/2026
**Statut** : design validé, prêt pour le plan d'implémentation
**Auteur** : Florian Magne, avec Claude
**Relecteurs attendus** : chef du laboratoire HLA (sections 5 et 6 en priorité)

---

## Table des matières

1. [Objectif et périmètre](#1-objectif-et-périmètre)
2. [Décisions prises](#2-décisions-prises)
3. [Contrainte de design n°1 : le cadrage épistémique](#3-contrainte-de-design-n1--le-cadrage-épistémique)
4. [Modèle de données](#4-modèle-de-données)
5. [Prototypes UI/UX](#5-prototypes-uiux)
6. [Vocabulaire et libellés](#6-vocabulaire-et-libellés)
7. [Stack technique](#7-stack-technique)
8. [Reconstruction de la base](#8-reconstruction-de-la-base)
9. [État des données et stratégie de développement](#9-état-des-données-et-stratégie-de-développement)
10. [Mise à jour PubMed : les trois régimes](#10-mise-à-jour-pubmed--les-trois-régimes)
11. [Du local au public](#11-du-local-au-public)
12. [Questions ouvertes pour le chef de labo](#12-questions-ouvertes-pour-le-chef-de-labo)
13. [Hors périmètre](#13-hors-périmètre)

---

## 1. Objectif et périmètre

Construire un site compagnon permettant d'explorer la cartographie bibliométrique
des co-occurrences textuelles entre **allèles HLA** et **complications de
transplantation rénale**, avec accès systématique aux publications sources.

**Objectif du prototype** : convaincre le chef du laboratoire HLA de l'utilité de
l'outil, et récolter ses retours avant de passer à l'échelle.

### Périmètre

| | Inclus | Exclu |
|---|---|---|
| **Corpus** | A — espace allélique, N = 5 581 | B — espace éplétique, N = 359 |
| **Sens de navigation** | HLA → complication → articles | — |
| **Mise à jour** | Corpus figé, versionné | Ingestion temps réel |
| **Déploiement** | Local, conçu pour le public | Mise en ligne effective |

Les deux univers A et B restent **strictement scindés** : ils n'ont ni le même
corpus, ni le même dénominateur statistique, ni le même vocabulaire d'entités.
Les mélanger produirait des chiffres faux. L'architecture doit pouvoir accueillir
B plus tard sans refonte — d'où le champ `universe` dans les métadonnées de
version — mais aucune vue ne combine jamais les deux.

---

## 2. Décisions prises

| # | Décision | Justification |
|---|---|---|
| D1 | Corpus A = espace allélique (N = 5 581), B = éplétique | Terminologie « Univers A/B » des manuscrits |
| D2 | Cible = immunologiste / biologiste, sans compétence bibliométrique | C'est lui qu'il faut convaincre |
| D3 | Porte d'entrée principale = **le HLA** | « Que sait-on de cet allèle ? » |
| D4 | Corpus **figé et versionné**, pas de scraping continu | Le site doit dire la même chose que le papier |
| D5 | Dev local, **architecture prête pour le public** | Pas de raccourci coûtant une réécriture |
| D6 | **Next.js + SQLite** en fichier versionné | Données immuables, volume modeste, versionnement natif |
| D7 | **Clés naturelles** (`pmid`, forme IPD-IMGT) | Base déterministe, URL parlantes |
| D8 | **Métriques statistiques masquées** par défaut | Elles sont dans la publication, pas dans l'outil clinique |
| D9 | **Négations affichées**, jamais masquées par défaut | Une controverse est une information |
| D10 | **Non-significatif visible en grisé**, pas masqué | Ne pas créer d'illusion de netteté |

---

## 3. Contrainte de design n°1 : le cadrage épistémique

### Le problème

Les manuscrits sont explicites (note terminologique du 01/07/2026) :

> « Association » désigne une **co-occurrence textuelle statistiquement enrichie
> dans la littérature indexée**, **pas** une association clinique ou causale
> validée.

Avec des métriques de validation manuelle qui appellent à la prudence :

| Indicateur | Valeur | Lecture |
|---|---|---|
| Précision d'extraction | 78,75 % | ~1 mention sur 5 est erronée |
| Accord négation (kappa) | 0,44 | Modéré — la détection de négation est faillible |

Un immunologiste qui voit un graphe « HLA-DR3 → diabète » sans ce cadrage le lira
comme une affirmation clinique. **C'est le risque principal du projet**, pas une
note de bas de page.

### La réponse : l'entonnoir de preuve

```
  INDICATEUR  →   PAIRE    →   PHRASES   →   ARTICLE
  ●●●● fort      HLA ×        la phrase      abstract
                 complication  exacte        PubMed
      ▲                            ▲
      │                            │
   agrégé                       source
  (fragile)                  (vérifiable)
```

**Règle absolue : aucun chiffre du site n'est un cul-de-sac.** Toute valeur
agrégée est cliquable jusqu'aux phrases brutes qui la produisent, en deux clics
maximum.

Le garde-fou est **structurel, pas déclaratif**. On ne demande pas à l'utilisateur
de croire l'indicateur : on lui donne les moyens de le juger. Un immunologiste qui
peut lire les 18 phrases sources en un clic ne confondra jamais ça avec une
association clinique.

### Trois mécanismes de protection

1. **L'encart de cadrage** en landing page, non refermable, au-dessus de la ligne
   de flottaison, qui chiffre l'incertitude en langage clair.
2. **Le tiroir de phrases** comme point de passage obligé de toutes les routes de
   navigation.
3. **Le surlignage des spans** dans chaque phrase, qui rend les erreurs
   d'extraction visibles à l'œil nu.

---

## 4. Modèle de données

### 4.1 Principe : trois couches

| Couche | Nature | Script producteur | Reconstructible depuis |
|---|---|---|---|
| **0 — Métadonnées** | Traçabilité du build | `build_sqlite.py` | — |
| **1 — Sources** | Ce que PubMed a dit | `parse_pubmed_xml.py`, `merge_deduplicate.py` | XML brut |
| **2 — Extractions** | Ce que le NLP a trouvé | `extract_hla_v2.py` | Couche 1 |
| **3 — Agrégats** | Ce que les stats ont calculé | `association_stats_v2.py` | Couche 2 |

**Rien n'est saisi à la main.** Une ligne d'agrégat qu'on ne sait pas dériver des
extractions est un bug, pas une donnée.

### 4.2 Stratégie de clés

> **Règle** : clé naturelle partout où il en existe une stable et normalisée.
> Entier auto-incrémenté uniquement pour les tables de mentions.

| Entité | Clé | Pourquoi |
|---|---|---|
| Article | `pmid` (TEXT) | Stable, mondial, citable, URL parlante |
| Entité HLA | forme IPD-IMGT `HLA-DQB1*02:01` | Canonique, déjà normalisée par le pipeline |
| Complication | clé technique `ABMR` | Issue du lexique `OUTCOMES` |
| Auteur | slug normalisé `wiebe-c` | Résultat **stable** de la déduplication |
| Mention | `INTEGER AUTOINCREMENT` | Pas de clé naturelle |

**Conséquence recherchée** : deux builds successifs sur les mêmes sources
produisent **exactement les mêmes clés**, donc un fichier identique au bit près,
donc un SHA-256 vérifiable.

> ⚠ **Point de vigilance sur `author_id`** : la clé doit être le résultat stable de
> `dedupe_authors_pub1.py`. Si la déduplication change entre deux runs, les
> identités d'auteurs changent, et la feature « publications d'un auteur » cesse
> d'être reproductible.

### 4.3 Diagramme entité-relation

```
┌──────────────────────────────────────────────────────────────────────────┐
│ COUCHE 0 — MÉTADONNÉES DE BUILD                                          │
└──────────────────────────────────────────────────────────────────────────┘

                      ┌───────────────────────────┐
                      │ corpus_version            │  UNE SEULE LIGNE
                      ├───────────────────────────┤
                      │ PK version        TEXT    │  "A-1.2"
                      │    universe       TEXT    │  "A" | "B"
                      │    built_at       TEXT    │  ISO8601
                      │    n_articles     INTEGER │  5581
                      │    pubmed_query   TEXT    │
                      │    pipeline_commit TEXT   │  SHA git
                      │    filter_script  TEXT    │
                      │    notes          TEXT    │
                      └───────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ COUCHE 1 — SOURCES                                                       │
└──────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────┐
   │ articles                    │
   ├─────────────────────────────┤
   │ PK pmid              TEXT   │◄──────────┐
   │ UQ doi               TEXT   │           │
   │    title             TEXT   │           │
   │    abstract          TEXT   │           │
   │ IX year              INTEGER│           │
   │    journal           TEXT   │           │
   │    journal_abbrev    TEXT   │           │
   │    country           TEXT   │           │
   │    language          TEXT   │           │
   │    cited_by          INTEGER│           │
   │    source            TEXT   │           │
   │ IX graft_assignment  TEXT   │           │
   └─────────────────────────────┘           │
             ▲                                │
             │ 1:N                            │
   ┌─────────┴───────────────────┐           │
   │ article_authors             │           │
   ├─────────────────────────────┤           │
   │ PK,FK pmid           TEXT   ├───────────┤
   │ PK,FK author_id      TEXT   ├──┐        │
   │       position       INTEGER│  │        │
   │       is_last        BOOLEAN│  │        │
   └─────────────────────────────┘  │        │
                                     │        │
   ┌─────────────────────────────┐  │        │
   │ authors                     │◄─┘        │
   ├─────────────────────────────┤           │
   │ PK author_id         TEXT   │           │
   │    display_name      TEXT   │           │
   │    n_publications    INTEGER│  ← dénormalisé
   └─────────────────────────────┘           │
                                              │
   ┌─────────────────────────────┐           │
   │ mesh_terms / keywords /     │           │
   │ affiliations / countries    │           │
   ├─────────────────────────────┤           │
   │ PK,FK pmid           TEXT   ├───────────┤
   │ PK    term           TEXT   │           │
   └─────────────────────────────┘           │
                                              │
┌──────────────────────────────────────────────────────────────────────────┐
│ COUCHE 2 — EXTRACTIONS NLP                                               │
└──────────────────────────────────────────────────────────────────────────┘
                                              │
   ┌─────────────────────────────┐           │
   │ hla_entities                │           │
   ├─────────────────────────────┤           │
   │ PK hla               TEXT   │◄────┐     │
   │ IX locus             TEXT   │     │     │
   │    hla_class         TEXT   │     │     │
   │    resolution        TEXT   │     │     │
   │ FK parent_hla        TEXT   ├──┐  │     │  ★ auto-référence
   │    n_mentions        INTEGER│  │  │     │     = arborescence
   └─────────────────────────────┘◄─┘  │     │
                                        │     │
   ┌─────────────────────────────┐     │     │
   │ outcomes                    │     │     │
   ├─────────────────────────────┤     │     │
   │ PK outcome           TEXT   │◄──┐ │     │
   │    label             TEXT   │   │ │     │  ← libellé clinique
   │    category          TEXT   │   │ │     │  ← 7 catégories
   │    n_mentions        INTEGER│   │ │     │
   └─────────────────────────────┘   │ │     │
                                      │ │     │
   ┌─────────────────────────────┐   │ │     │
   │ hla_mentions                │   │ │     │
   ├─────────────────────────────┤   │ │     │
   │ PK mention_id     INTEGER AI│   │ │     │
   │ FK pmid              TEXT   ├───┼─┼─────┤
   │ FK hla               TEXT   ├───┼─┘     │
   │    span              TEXT   │   │       │
   │    sentence_idx      INTEGER│   │       │
   └─────────────────────────────┘   │       │
                                      │       │
   ┌─────────────────────────────┐   │       │
   │ outcome_mentions            │   │       │
   ├─────────────────────────────┤   │       │
   │ PK mention_id     INTEGER AI│   │       │
   │ FK pmid              TEXT   ├───┼───────┤
   │ FK outcome           TEXT   ├───┤       │
   │    span              TEXT   │   │       │
   │    negated           BOOLEAN│   │       │
   │    sentence_idx      INTEGER│   │       │
   └─────────────────────────────┘   │       │
                                      │       │
   ╔═════════════════════════════╗   │       │
   ║ pair_mentions         ★★★   ║   │       │  LA TABLE CENTRALE
   ╠═════════════════════════════╣   │       │
   ║ PK pair_mention_id INTEGER AI║   │       │
   ║ FK pmid              TEXT   ║───┼───────┘
   ║ FK hla               TEXT   ║───┼──► hla_entities
   ║ FK outcome           TEXT   ║───┘
   ║    sentence          TEXT   ║  ★ la phrase source, affichée telle quelle
   ║    hla_span          TEXT   ║  ★ pour le surlignage
   ║    outcome_span      TEXT   ║  ★ pour le surlignage
   ║    polarity          TEXT   ║  "positive" | "negated"
   ║    negation_trigger  TEXT   ║  le déclencheur détecté
   ║    sentence_idx      INTEGER║
   ║ UQ (pmid,hla,outcome,sentence_idx)      ║
   ╚═════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────┐
│ COUCHE 3 — AGRÉGATS                                                      │
└──────────────────────────────────────────────────────────────────────────┘

   ╔═════════════════════════════════════╗
   ║ associations                  ★★    ║  CE QU'AFFICHE LA FICHE ALLÈLE
   ╠═════════════════════════════════════╣
   ║ PK,FK hla                TEXT       ║──► hla_entities
   ║ PK,FK outcome            TEXT       ║──► outcomes
   ║       n_cooccurrence     INTEGER    ║
   ║       n_positive         INTEGER    ║  ★ affiché
   ║       n_negated          INTEGER    ║  ★ affiché, jamais fondu
   ║       n_hla_total        INTEGER    ║
   ║       n_outcome_total    INTEGER    ║
   ║       n_universe         INTEGER    ║  le N du dénominateur
   ║       pmi                REAL       ║  ┐
   ║       npmi               REAL       ║  │
   ║       log_odds           REAL       ║  │
   ║       odds_ratio         REAL       ║  │ masqués par défaut
   ║       or_ci_low          REAL       ║  │ (dépliant + export)
   ║       or_ci_high         REAL       ║  │
   ║       pval_fisher        REAL       ║  │
   ║    IX fdr                REAL       ║  │
   ║       pval_two_sided     REAL       ║  │ ★ test bilatéral
   ║       fdr_two_sided      REAL       ║  │   (associations protectrices)
   ║       npmi_geo           REAL NULL  ║  ┘ AFC-NPMI
   ║       first_year         INTEGER    ║
   ║       signal_level       TEXT       ║  ★ dérivé : l'indicateur affiché
   ║       is_significant     BOOLEAN    ║
   ╚═════════════════════════════════════╝

   ┌─────────────────────────────┐    ┌─────────────────────────────┐
   │ graph_edges                 │    │ node_metrics                │
   ├─────────────────────────────┤    ├─────────────────────────────┤
   │ PK graph_type       TEXT    │    │ PK graph_type       TEXT    │
   │ PK source           TEXT    │    │ PK node_id          TEXT    │
   │ PK target           TEXT    │    │    degree           INTEGER │
   │    weight           REAL    │    │    betweenness      REAL    │
   │    polarity         TEXT    │    │    eigenvector      REAL    │
   │    community        INTEGER │    │    community        INTEGER │
   └─────────────────────────────┘    └─────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │ annual_counts · hla_resolution_timeline · national_signatures   │
   │ association_timeline (hla, outcome, year, n)                    │
   └─────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │ search_index          VIRTUAL TABLE fts5                        │
   ├─────────────────────────────────────────────────────────────────┤
   │ entity_type  'allele'|'outcome'|'article'|'author'              │
   │ entity_id · label · content                                     │
   └─────────────────────────────────────────────────────────────────┘
```

### 4.4 Les deux colonnes qui portent le design

**`hla_entities.parent_hla`** — l'arborescence navigable :

```
HLA-class-II  →  DQB1  →  HLA-DQB1*02  →  HLA-DQB1*02:01
  (class)       (locus)     (2-digit)        (4-digit)
```

Une seule colonne auto-référente permet de remonter ou descendre l'arbre par
requête récursive (`WITH RECURSIVE`). Cliquer sur un locus agrège tous ses allèles
enfants. C'est le « en cliquant ça avance dans l'arborescence » du cahier des
charges.

**`pair_mentions.sentence`** — la réponse à la contrainte épistémique. Parce que la
phrase source est stockée ligne à ligne, chaque indicateur affiché est traçable
jusqu'au texte exact qui le produit.

### 4.5 Négations : stockées à part, jamais fondues

`n_positive` et `n_negated` sont deux colonnes distinctes.

> Une paire vue 10 fois dont 6 négations raconte l'inverse d'une paire vue 10 fois
> toutes positives. Le kappa de 0,44 étant modéré, on affiche le comptage brut
> plutôt que de prétendre trancher.

### 4.6 Le test bilatéral : ne pas masquer les associations protectrices

Le pipeline calcule `pval_fisher` (unilatéral « greater », test primaire) **et**
`pval_fisher_two_sided`, avec ce commentaire dans `association_stats_v2.py` :

> Le test unilatéral « greater » est conçu pour détecter l'enrichissement et est
> **structurellement aveugle à la déplétion**. Une association protectrice
> authentique (OR < 1) ne pourrait jamais être rapportée comme significative.

**Conséquence pour l'UI** : une paire avec OR < 1 et `fdr_two_sided < 0,05` est un
**signal protecteur potentiel**, cliniquement intéressant, que le tri par NPMI
reléguerait en bas de liste. Le prototype doit prévoir un badge distinct
(« signal inverse ») plutôt que de laisser ces paires invisibles.

---

## 5. Prototypes UI/UX

### 5.0 Principe directeur

> **Aucune compétence bibliométrique requise.** Un biologiste ouvre le site et
> sait quoi faire en dix secondes, sans mode d'emploi.

Corollaire : les métriques (NPMI, PMI, AFC-NPMI, log-odds) sont **absentes de la
façade**. Elles gouvernent le tri et le filtrage en arrière-plan, mais ne
s'affichent que sur demande explicite. Elles sont dans la publication ; le site
est un outil d'exploration, pas un tableau de résultats.

### 5.1 L'indicateur de signal

Quatre niveaux qualitatifs remplacent les scores :

| Affiché | Dérivé de |
|---|---|
| ●●●● Signal fort | FDR < 0,05 · n ≥ 10 · NPMI haut |
| ●●●○ Signal net | FDR < 0,05 · n ≥ 3 |
| ●●○○ Signal modéré | FDR < 0,05 · n < 3 |
| ○○○○ Signal faible | FDR ≥ 0,05 — affiché en grisé |
| ◐ Signal inverse | OR < 1 · FDR bilatéral < 0,05 |

**Le nombre d'articles reste affiché en clair** — c'est la seule quantité qu'un
clinicien interprète spontanément et correctement.

### 5.2 Prototype 1 — Landing page

```
┌──────────────────────────────────────────────────────────────────────┐
│   Compagnon d'exploration bibliométrique                             │
│   HLA × Complications en transplantation rénale                      │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │ 🔍  HLA-DQB1*02:01                                    [↵]  │    │
│   └────────────────────────────────────────────────────────────┘    │
│         ↓ autocomplétion FTS5                                        │
│      HLA-DQB1*02:01   4-digit   · 31 articles                        │
│      HLA-DQB1*02      2-digit   · 88 articles                        │
│      DQB1             locus     · 214 articles                       │
│                                                                      │
│   ╭──────────────────────────────────────────────────────────────╮  │
│   │  ⓘ  CE QUE CE SITE MONTRE — ET CE QU'IL NE MONTRE PAS        │  │
│   │                                                              │  │
│   │  Ce site cartographie des CO-OCCURRENCES TEXTUELLES dans     │  │
│   │  la littérature indexée PubMed : quels allèles HLA et        │  │
│   │  quelles complications sont mentionnés ensemble, et à        │  │
│   │  quelle fréquence par rapport au hasard.                     │  │
│   │                                                              │  │
│   │  ⚠ Ce ne sont PAS des associations cliniques ni causales.    │  │
│   │    Un signal fort peut refléter une mode de publication,     │  │
│   │    un biais d'indexation ou une erreur d'extraction.         │  │
│   │                                                              │  │
│   │  Extraction automatique par NLP :                            │  │
│   │  ├─ Précision mesurée ............ 78,75 %                   │  │
│   │  ├─ Accord négation (kappa) ...... 0,44  (modéré)            │  │
│   │  └─ ~1 mention sur 5 est erronée                             │  │
│   │                                                              │  │
│   │  → Toute lecture clinique exige de relire les sources.       │  │
│   │    Le site vous y conduit systématiquement.                  │  │
│   │                                     [Méthodologie complète]  │  │
│   ╰──────────────────────────────────────────────────────────────╯  │
│                                                                      │
│   ── Corpus A · Espace allélique ────────────────────────────────    │
│                                                                      │
│    5 581        21          [n]          1990–2026                   │
│    articles   complications  allèles      couverture                 │
│                                                                      │
│   Version A-1.2 · gelé au 01/07/2026 · SHA d4f8a2…  [Vérifier]      │
│                                                                      │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│   │  Explorer par   │  │  Explorer par   │  │   Parcourir     │    │
│   │     ALLÈLE      │  │  COMPLICATION   │  │   LE GRAPHE     │    │
│   │   (entrée ★)    │  │                 │  │                 │    │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

L'encart est **non refermable**, au-dessus de la ligne de flottaison, et chiffre
l'incertitude en langage clair. « ~1 mention sur 5 est erronée » est la même donnée
que « précision 78,75 % », formulée pour être comprise et retenue.

> **Note** : les compteurs de la barre de statistiques (nombre d'allèles, nombre de
> complications effectivement présentes) sont **calculés au build**, jamais écrits
> en dur. Le nombre d'articles (5 581) et les métriques de validation (78,75 %,
> kappa 0,44) proviennent respectivement de `corpus_version` et de
> `results/validation/`. Le graphisme `[n]` ci-dessus marque une valeur à dériver
> des données, non une valeur connue.

### 5.3 Prototype 2 — Fiche allèle *(page canonique)*

Route : `/allele/HLA-DQB1*02:01`

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← DQB1   ⌂                                          [🔍 Rechercher]  │
├──────────────────────────────────────────────────────────────────────┤
│  HLA-DQB1*02:01                                                      │
│  Classe II · locus DQB1 · résolution 4-digit                         │
│                                                                      │
│  ╭─ ARBORESCENCE ────────────────────────────────────────────────╮  │
│  │  Classe II  ›  DQB1  ›  HLA-DQB1*02  ›  ●HLA-DQB1*02:01       │  │
│  │                            ↑ 88 art.        31 articles       │  │
│  │  Voisins : *02:02 (12) · *03:01 (47) · *06:02 (9)             │  │
│  ╰────────────────────────────────────────────────────────────────╯  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 31 articles    12 complications    1998    2 signaux            │ │
│  │                co-citées           1ʳᵉ      forts               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ── CO-OCCURRENCES ────────────────────────────────────────────────  │
│  Filtres : [Significatifs ✓] [n≥3 ✓] [masquer négations ✗]          │
│                                                                      │
│  ┌── IMMUNISATION ──────────────────────────────────────────────┐   │
│  │ DSA                                                          │   │
│  │ Anticorps anti-HLA du donneur                                │   │
│  │                                                              │   │
│  │ ●●●● Signal fort          18 articles                        │   │
│  │                           dont 4 en sens négatif ⚠           │   │
│  │                                                              │   │
│  │ 1998 ▁▁▂▃▅▇█▇▅ 2026                                          │   │
│  │                     [Détail statistique] [Voir 18 phrases ▾] │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌── REJET ─────────────────────────────────────────────────────┐   │
│  │ Rejet humoral (ABMR)      ●●●○ Signal net     11 articles    │   │
│  │                                   [Voir les 11 phrases ▾]    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌── FONCTION DU GREFFON ───────────────────────────────────────┐   │
│  │ Perte du greffon          ○○○○ Signal faible   4 articles    │   │
│  │ ░ sous le seuil statistique ░      [Voir les 4 phrases ▾]    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│                              [Exporter CSV] [Citer cette page]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Partis pris** :

- **Regroupement par catégorie clinique** (§ 6) : l'utilisateur balaye la page par
  blocs cliniques plutôt que par une liste plate de 21 items.
- **Négations visibles** : « dont 4 en sens négatif » peut signaler une controverse
  active — plus intéressant qu'un signal propre.
- **Non-significatif en grisé** : masquer créerait une illusion de netteté. Voir
  qu'une paire a été *testée* et n'a *pas* passé le seuil est une information.
- **Sparkline temporel** : distingue d'un coup d'œil un signal éteint d'un signal
  actif.

### 5.4 Prototype 3 — Tiroir de phrases *(cœur épistémique)*

**La vue la plus importante du site.**

```
┌──────────────────────────────────────────────────────────────────────┐
│  HLA-DQB1*02:01  ×  Anticorps anti-HLA du donneur (DSA)        [✕]  │
│  18 mentions · 14 positives · 4 négatives                            │
│  [Toutes] [Positives 14] [Négatives 4]          Tri : année ▾       │
├──────────────────────────────────────────────────────────────────────┤
│  ┌ ✓ POSITIVE ─────────────────────────────── 2019 ──────────────┐  │
│  │ « Recipients carrying HLA-DQB1*02:01 showed a significantly    │  │
│  │   higher incidence of de novo DSA at 5 years (p<0.01). »       │  │
│  │    ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                        ▔▔▔                  │  │
│  │      surligné = HLA                    surligné = complication │  │
│  │                                                                │  │
│  │ Wiebe C. et al. — Am J Transplant, 2019                        │  │
│  │ PMID 31234567 · cité 142 fois        [PubMed ↗] [Fiche ↗]     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌ ⚠ NÉGATIVE ─────────────────────────────── 2021 ──────────────┐  │
│  │ « We found no significant association between HLA-DQB1*02:01   │  │
│  │    ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                     │  │
│  │   and dnDSA development in this cohort. »                      │  │
│  │                                                                │  │
│  │ ⓘ Négation détectée : « no significant »                       │  │
│  │   Détection automatique — accord modéré, à vérifier            │  │
│  │                                                                │  │
│  │ Sharma A. et al. — Transplantation, 2021                       │  │
│  │ PMID 33445566                        [PubMed ↗] [Fiche ↗]     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│              ⚠ Extraction automatique — signaler une erreur          │
└──────────────────────────────────────────────────────────────────────┘
```

Le **surlignage des spans** (stockés dans `pair_mentions.hla_span` /
`outcome_span`) permet de vérifier visuellement et instantanément que l'extraction
a vu la bonne chose. C'est le moyen le plus rapide de repérer les ~21 % d'erreurs :
elles sautent aux yeux quand le surlignage porte sur le mauvais segment.

Le lien **« signaler une erreur »** transforme le chef de labo en validateur et
prépare le régime 2 (§ 10). En prototype local, il écrit dans un fichier JSON.

### 5.5 Prototype 4 — Graphe

Le piège est le *hairball* : 340 allèles × 21 complications = pelote illisible.
**Solution : profondeur 1 par défaut, extension au clic.**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Graphe · centré sur HLA-DQB1*02:01           Profondeur : [1] 2  3  │
│  Seuil de signal : ──────●────────    ☑ significatifs  ☐ négations  │
├──────────────────────────────────────────────────────────────────────┤
│                             ╭─────╮                                  │
│                    ┌────────│ DSA │                                  │
│                    │        ╰─────╯                                  │
│              ╔═══════════╗      ╲ ← épaisseur = force du signal      │
│              ║ DQB1*02:01║       ╲  ╭──────╮                         │
│              ║  ● centre ║────────── │ ABMR │                        │
│              ╚═══════════╝          ╰──────╯                         │
│                    │  ╲                                              │
│                    │   ╲──────── ╭────────────╮                      │
│                    │             │ Perte du   │ ░ non signif.        │
│              ╭──────────────╮    │  greffon   │                      │
│              │ Immunisation │    ╰────────────╯                      │
│              ╰──────────────╯                                        │
│                                                                      │
│   ○ = HLA   ▢ = complication   ─── positif   ┄┄┄ négatif            │
│   Couleur du nœud = catégorie clinique                               │
│   Clic sur un nœud → il devient le centre                            │
│   Survol → phrases en aperçu                                         │
└──────────────────────────────────────────────────────────────────────┘
```

Cliquer sur `DSA` recentre le graphe et révèle tous les HLA qui y sont co-cités :
**navigation bidirectionnelle** HLA → complication → autres HLA, indéfiniment, avec
fil d'Ariane.

### 5.6 Prototype 5 — Fiche auteur *(feature secondaire)*

Route : `/author/wiebe-c`

```
┌──────────────────────────────────────────────────────────────────────┐
│  Wiebe, C.                                                           │
│  47 publications dans le corpus · 1998–2026                          │
│  ⓘ Identité déduite par normalisation du nom — homonymes possibles   │
├──────────────────────────────────────────────────────────────────────┤
│  CENTRES D'INTÉRÊT  (déduits des entités de ses articles)            │
│    HLA-DQB1    ████████████████████  24 art.                         │
│    DSA         ███████████████       18 art.                         │
│    ABMR        ███████████           13 art.                         │
│                                                                      │
│  TRAJECTOIRE                                                         │
│    1998 ─────────── 2010 ─────────── 2018 ─────────── 2026           │
│         sérologie      2-digit         4-digit → eplet               │
│         ▂▂▃            ▃▅▅             ▇█████                        │
│                                                                      │
│  CO-AUTEURS                    PUBLICATIONS                          │
│    Nickerson P.  32 ●●●●●       2019 · Class II eplet mismatch…     │
│    Pochinco D.   18 ●●●         2018 · HLA-DQ mismatch and dnDSA…   │
└──────────────────────────────────────────────────────────────────────┘
```

> ⚠ **Réserve à afficher dans l'interface** : la désambiguïsation par nom est
> faillible — deux « Wang J. » distincts fusionnent, un auteur qui change de nom se
> scinde. La mention « identité déduite par normalisation du nom » est obligatoire.
> Un chef de labo qui se voit attribuer l'article d'un homonyme perdra confiance
> dans tout le reste du site.

### 5.7 Navigation d'ensemble

```
                         LANDING
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
      /allele/[id]    /outcome/[id]        /graph
       ★ canonique          │                 │
          │                 │                 │
          └────────┬────────┴─────────────────┘
                   ▼
            TIROIR DE PHRASES  ← point de passage obligé
                   │
                   ▼
            /article/[pmid] ──→ /author/[id] ──→ ses publications
                   │
                   ▼
              PubMed ↗
```

**Toutes les routes convergent vers le tiroir de phrases.** Quel que soit le chemin
emprunté, l'utilisateur finit devant le texte source.

---

## 6. Vocabulaire et libellés

### 6.1 Règles de langue

| ❌ Interdit | ✅ Employé |
|---|---|
| « associé à », « lié à » | **« co-cité avec »**, « co-occurrence » |
| « risque de » | « signal de co-occurrence » |
| « prédit » | « fréquemment mentionné avec » |
| « HLA-DR3 cause… » | « 29 articles mentionnent conjointement… » |

Le mot **« association »** n'apparaît jamais seul en évidence — toujours qualifié :
« association textuelle ».

### 6.2 Table de libellés

Les clés du pipeline sont du jargon de code. L'interface n'affiche **jamais** la
clé brute.

> **À faire relire par le chef de labo** — c'est un choix éditorial, pas une sortie
> du pipeline.

| Clé pipeline | Affiché | Catégorie |
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

**7 catégories** : Rejet · Immunisation · Fonction du greffon · Infection ·
Néoplasie · Métabolique · Récidive. Elles regroupent les cartes de la fiche allèle
et colorent les nœuds du graphe.

Les sigles consacrés (ABMR, DSA, DGF, PTLD, NODAT) sont **conservés** : ce sont les
termes réels du métier.

---

## 7. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Framework | **Next.js** (App Router) + TypeScript | Stack habituelle, SSR pour l'indexation publique |
| BDD | **SQLite** en fichier versionné | Données immuables, versionnement natif, zéro service |
| Accès BDD | `better-sqlite3` + Drizzle (ou Kysely) | Synchrone, parfait en lecture seule, typé |
| Recherche | **FTS5** (SQLite natif) | Autocomplétion instantanée, zéro dépendance |
| Graphes | **Sigma.js + graphology** | Lit le GEXF nativement, WebGL, essai déjà fait |
| Graphiques | **Observable Plot** | API déclarative concise, SVG propre |
| Styles | Tailwind | Rapidité de prototypage |

### Pourquoi SQLite plutôt que Postgres

Le corpus est **immuable par décision** (D4). Toutes les écritures viennent du
pipeline Python, jamais de l'utilisateur. Un SGBD client-serveur résoudrait un
problème de concurrence en écriture qui n'existe pas.

Bénéfices directs :

- **Versionnement trivial** : `corpus_A_v1.2.sqlite` — un fichier = une version
  citable, déposable sur Zenodo avec un DOI.
- **Local et prod identiques** : pas de « ça marchait sur ma machine ».
- **Volume** : ~5 581 articles avec mentions et paires ≈ 20–50 Mo.

**Risque assumé** : le passage au régime 2 (§ 10) demandera une BDD en écriture
pour la file de validation. La migration sera alors ciblée (une table de queue, pas
le corpus) et interviendra quand le besoin sera prouvé.

### Pourquoi les métriques de graphe sont pré-calculées

NetworkX les produit déjà côté pipeline. Calculer une betweenness côté navigateur
sur 400 nœuds, c'est plusieurs secondes de page figée pour un résultat identique à
chaque fois.

---

## 8. Reconstruction de la base

### Commande unique

```bash
python scripts/06_build_db/build_sqlite.py \
    --universe A \
    --version 1.2 \
    --source-dir data/processed/ \
    --out dist/corpus_A_v1.2.sqlite
```

### Étapes

1. **Charge** les CSV du pipeline (couches 1–3 déjà produites)
2. **Valide** — si une seule validation échoue, aucun fichier n'est produit
3. **Écrit** les tables dans l'ordre des dépendances (FK respectées)
4. **Construit** les index et l'index FTS5
5. **Dénormalise** les compteurs (`n_mentions`, `n_publications`, `signal_level`)
6. **Scelle** : `PRAGMA foreign_keys=ON`, `VACUUM`, puis SHA-256 du fichier écrit
   dans `corpus_A_v1.2.sqlite.sha256`

### Validations bloquantes

| # | Contrôle | Motif |
|---|---|---|
| V1 | `COUNT(articles)` == `corpus_version.n_articles` | Le N annoncé est le N réel |
| V2 | Aucune FK orpheline | Toute mention pointe vers un article et une entité existants |
| V3 | `associations.n_cooccurrence` == `COUNT(pair_mentions)` | Tout agrégat est dérivable |
| V4 | `n_positive + n_negated == n_cooccurrence` | Cohérence des polarités |
| V5 | Tout `parent_hla` résout, arbre acyclique | L'arborescence est navigable |
| V6 | `npmi ∈ [-1,1]`, `fdr ∈ [0,1]` | Bornes mathématiques |
| V7 | `year ∈ [1960, année courante]` | Détection d'erreurs de parsing |
| V8 | Toute `outcome` a un `label` et une `category` | Aucune clé brute affichable |

> **V3 et V8 sont les plus importantes.** V3 garantit que le site ne peut pas
> afficher un chiffre non traçable. V8 garantit qu'aucun jargon de code ne fuite
> vers l'utilisateur.

Le SHA-256 rend la base **vérifiable** : le hash est publié avec le papier,
quiconque reconstruit obtient le même fichier — ou découvre que quelque chose a
changé.

---

## 9. État des données et stratégie de développement

### Constat

| Élément | État | Localisation |
|---|---|---|
| **Code du pipeline** | ✅ Complet — 144 scripts, 33 475 lignes | `Downloads/HLA_Bibliometrics_Renal-v2-main/` |
| **Données de sortie** | ❌ 72 CSV en pointeurs Git LFS, 0 avec contenu | idem |
| **Données réelles** | ⚠ Sur le PC personnel | — |
| **Exports anciens** | ⚠ N = 838, run obsolète | `Mon Drive/.../Analyse spécifique +++` |

**Le code est la spécification.** Le contrat de schéma se dérive des `to_csv()` et
des listes de colonnes, plus fiablement que d'un CSV d'exemple issu d'un run
obsolète.

### Contrat de schéma dérivé du code

`extract_hla_v2.py` :

```
hla_mentions_v2.csv      pmid, year, source, hla, hla_locus, hla_class,
                         resolution, span
outcome_mentions_v2.csv  pmid, year, source, outcome, span, negated
hla_outcome_pairs_v2.csv pmid, hla, hla_resolution, hla_locus, hla_class,
                         outcome, negated, year, source
negated_pairs_v2.csv     (mêmes colonnes)
```

`association_stats_v2.py` :

```
association_stats_v2.csv hla, outcome, hla_class, hla_locus, resolution_level,
                         n_co, n_hla, n_outcome, N, pmi, npmi, log_odds,
                         odds_ratio, or_ci_low, or_ci_high, pval_fisher, fdr,
                         pval_fisher_two_sided, fdr_two_sided
```

Valeurs de `resolution` : `4-digit` · `2-digit` · `serological` · `class` ·
`mismatch_count` · `eplet`

### Stratégie en trois temps

1. **Figer le contrat** → `SCHEMA_CONTRACT.md`, dérivé des scripts. Faisable
   immédiatement.
2. **Développer contre des données synthétiques** conformes au contrat : quelques
   centaines de lignes réalistes (vrais noms d'allèles via `SERO_MAP`, vraies
   complications via `OUTCOMES`). Permet de construire et démontrer tout le site.
3. **Basculer sur les vraies données** : le builder tourne sans modification, et
   les validations § 8 signalent immédiatement tout écart au contrat.

> ⚠ **Précaution au rapatriement** : récupérer les sorties du run correspondant aux
> manuscrits (**révision 1.2 du 01/07/2026**). Repère de vérification :
> `merged_corpus_renal.csv` doit contenir **5 581 lignes**. S'il en contient 6 310,
> c'est le run antérieur au correctif de contamination inter-organes, et les
> chiffres du site ne correspondront pas au papier.

---

## 10. Mise à jour PubMed : les trois régimes

| Régime | Description | Verdict |
|---|---|---|
| **1. Figé, versionné** | Snapshot N=5 581. Mise à jour = acte délibéré, nouvelle version datée. | ✅ **Retenu pour le prototype** |
| **2. Incrémental validé** | Job hebdomadaire → file d'attente → validation humaine → recalcul. | 🔜 Cible ultérieure |
| **3. Auto-publication** | Cron ingère et recalcule sans intervention. | ❌ Écarté |

### Pourquoi le régime 3 est écarté

Le pipeline n'est pas un simple scraping : PubMed → filtrage de pertinence →
extraction NLP → stats → réseaux. Or les manuscrits documentent **deux corrections
successives des filtres** pour contamination inter-organes (6 310 → 5 581 pour
Pub1 ; 9 535 → 8 433 pour Pub3). La qualité du corpus dépend d'un jugement humain
sur le vocabulaire d'inclusion.

En régime 3, les NPMI et les FDR bougeraient seuls, le site cesserait de
correspondre au manuscrit, et une contamination de filtre se propagerait
silencieusement. **Scientifiquement indéfendable pour ce projet.**

### Ce que le schéma prévoit déjà pour le régime 2

- `corpus_version` : versionnement en place dès le départ
- `articles.source` : traçabilité de l'origine
- Le lien « signaler une erreur » du tiroir de phrases : embryon de file de
  validation

La migration vers le régime 2 sera un **ajout de service**, pas une refonte.

---

## 11. Du local au public

Développement local, **architecture prise comme si le site allait être public**.
Aucun raccourci qui coûterait une réécriture.

| Point | Décision anticipée |
|---|---|
| URL des fiches | `/allele/HLA-DQB1*02:01` — clé naturelle, stable, citable |
| Versionnement | Un fichier `.sqlite` par version, SHA publié |
| Déploiement | Vercel / Cloudflare / VPS — le passage local → public est un `git push` |
| Rendu | SSR pour que les fiches soient indexables |

### À anticiper avec le labo (hors prototype)

> Une URL de companion site citée dans un article doit **survivre à votre départ du
> labo**. Cela se règle par :
> - un **domaine institutionnel** plutôt que personnel ;
> - un **dépôt Zenodo** du `.sqlite` avec DOI, qui garantit la pérennité des
>   données même si le site tombe.
>
> Décision à prendre avec le laboratoire, pas dans le cadre du prototype.

---

## 12. Questions ouvertes pour le chef de labo

À soumettre lors de la démonstration :

1. **Libellés et catégories** (§ 6.2) — les 21 libellés et les 7 catégories
   cliniques sont-ils les bons ? C'est le point le plus facile à corriger et le
   plus visible.
2. **Seuils de l'indicateur de signal** (§ 5.1) — « signal fort » à n ≥ 10 est-il
   pertinent, ou faut-il un seuil différent ?
3. **Traitement des négations** — les afficher par défaut est-il le bon choix, ou
   préfère-t-il un mode « signaux positifs seulement » par défaut ?
4. **Signaux protecteurs** (§ 4.6) — faut-il leur donner une vue dédiée, ou le
   badge suffit-il ?
5. **Granularité d'entrée** — entre-t-on plus naturellement par l'allèle 4-digit,
   le 2-digit, ou le sérotype (`DR3`, `DQ2`) ? Le `SERO_MAP` du pipeline permet les
   trois ; lequel mettre en avant dans l'autocomplétion ?
6. **Fiche auteur** — utile, ou distraction par rapport au cœur clinique ?

---

## 13. Hors périmètre

| Exclu du prototype | Pourquoi |
|---|---|
| Corpus B (éplétique) | Décision D1 — architecture prête, activation ultérieure |
| Corpus Pub3 (HSCT) | Univers distinct, dénominateur statistique différent |
| Ingestion PubMed temps réel | Régime 2 ou 3, § 10 |
| Authentification / comptes | Local, puis public en lecture seule |
| Mise en ligne effective | Décision D5 |
| Édition de données via l'interface | Toute écriture vient du pipeline |

---

## Annexe — Récapitulatif des tables

| Table | Couche | Clé primaire | Rôle |
|---|---|---|---|
| `corpus_version` | 0 | `version` | Traçabilité du build |
| `articles` | 1 | `pmid` | Notices bibliographiques |
| `authors` | 1 | `author_id` | Auteurs dédupliqués |
| `article_authors` | 1 | `(pmid, author_id)` | N:N + ordre de signature |
| `mesh_terms`, `keywords`, `affiliations`, `countries` | 1 | `(pmid, term)` | Indexation |
| `hla_entities` | 2 | `hla` | Référentiel HLA + arborescence |
| `outcomes` | 2 | `outcome` | Référentiel complications + libellés |
| `hla_mentions` | 2 | `mention_id` | Mentions HLA détectées |
| `outcome_mentions` | 2 | `mention_id` | Mentions complications détectées |
| **`pair_mentions`** | 2 | `pair_mention_id` | **Phrases sources — cœur du site** |
| **`associations`** | 3 | `(hla, outcome)` | **Agrégats — fiche allèle** |
| `graph_edges` | 3 | `(graph_type, source, target)` | Arêtes pré-calculées |
| `node_metrics` | 3 | `(graph_type, node_id)` | Centralités pré-calculées |
| `annual_counts`, `hla_resolution_timeline`, `national_signatures`, `association_timeline` | 3 | — | Séries temporelles |
| `search_index` | — | FTS5 | Recherche unifiée |
