# Compagnon d'exploration bibliométrique HLA × Complications

Site compagnon permettant d'explorer la cartographie des co-occurrences
textuelles entre **allèles HLA** et **complications de transplantation rénale**,
avec accès systématique aux publications sources.

> ## ⚠️ Nature des données
>
> Ce site cartographie des **co-occurrences textuelles** dans la littérature
> indexée PubMed : quels allèles HLA et quelles complications sont mentionnés
> ensemble, et à quelle fréquence par rapport au hasard.
>
> **Ce ne sont pas des associations cliniques ni causales.** Un signal fort peut
> refléter une mode de publication, un biais d'indexation ou une erreur
> d'extraction.
>
> Extraction automatique par NLP — précision mesurée **78,75 %**, accord sur la
> détection de négation **kappa = 0,44** (modéré). Environ **1 mention sur 5 est
> erronée**. Toute lecture clinique exige de relire les sources ; le site y
> conduit systématiquement.

---

## État du projet

**Prototype en cours de construction.** Objectif : support de discussion avec le
chef du laboratoire HLA avant passage à l'échelle.

| Élément | État |
|---|---|
| Document de conception | ✅ [docs/specs](docs/specs/2026-09-16-compagnon-hla-design.md) |
| Schéma SQLite + builder | 🔜 |
| Données synthétiques de développement | 🔜 |
| Interface Next.js | 🔜 |
| Bascule vers les données réelles | 🔜 |

---

## Périmètre

| | Inclus | Exclu |
|---|---|---|
| **Corpus** | A — espace allélique, N = 5 581 | B — espace éplétique, N = 359 |
| **Navigation** | HLA → complication → articles | — |
| **Mise à jour** | Corpus figé, versionné | Ingestion PubMed temps réel |

Les univers A (allélique) et B (éplétique) sont **strictement scindés** : corpus
distincts, dénominateurs statistiques distincts, vocabulaires d'entités
distincts. Aucune vue ne les combine.

---

## Architecture

```
Pipeline Python (externe)          Ce dépôt
─────────────────────────          ──────────────────────────────
PubMed → filtrage → NLP → stats
            │
            ▼
      CSV versionnés  ──────────►  build_sqlite.py
                                        │
                                        ▼
                                  corpus_A_v1.2.sqlite
                                  (artefact de build, + SHA-256)
                                        │
                                        ▼
                                   Next.js (lecture seule)
```

**Principes** :

- La base est un **artefact de build**, reconstructible et vérifiable par son
  SHA-256. Elle n'est jamais éditée via l'interface.
- **Clés naturelles** partout : `pmid`, forme IPD-IMGT (`HLA-DQB1*02:01`). Deux
  builds sur les mêmes sources produisent des clés identiques.
- Chaque valeur agrégée est **traçable en deux clics** jusqu'aux phrases sources
  qui la produisent.

---

## Stack

| Couche | Choix |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Base de données | SQLite en fichier versionné, lecture seule |
| Recherche | FTS5 (SQLite natif) |
| Graphes | Sigma.js + graphology |
| Graphiques | Observable Plot |
| Styles | Tailwind |

---

## Données de développement

Le prototype se développe sur un **jeu de données synthétique** conforme au
contrat de schéma, en attendant le rapatriement des sorties réelles du pipeline.

> ⚠️ Toute interface alimentée par les données synthétiques affiche un bandeau
> explicite. Les chiffres synthétiques ne doivent jamais être pris pour des
> résultats.

Le builder est écrit pour avaler les CSV réels sans modification. Bascule par une
commande.

---

## Documentation

- [Document de conception complet](docs/specs/2026-09-16-compagnon-hla-design.md)
  — modèle de données, prototypes UI, décisions et justifications.

---

## Contexte scientifique

Ce site accompagne une série de publications bibliométriques sur le rôle du
typage HLA dans les complications de transplantation, suivant la méthodologie de
Donthu et al. (2021) — Performance Analysis + Science Mapping.
