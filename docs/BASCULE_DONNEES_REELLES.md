# Bascule vers les données réelles

Ce document décrit le passage du jeu **synthétique** de développement aux
**sorties réelles du pipeline** PubMed → filtrage → NLP → statistiques.

Il est écrit pour être suivi par quelqu'un qui n'a pas construit le prototype.
Chaque affirmation ci-dessous a été vérifiée contre le code, pas contre le plan.

---

## 1. Repère de vérification préalable — le compte de lignes

> **`merged_corpus_renal.csv` doit contenir 5 581 lignes.**

C'est le contrôle à faire **avant toute chose**.

| Lignes | Signification | Action |
|---|---|---|
| **5 581** | Run correct, après le correctif de contamination inter-organes | ✅ Utiliser |
| **6 310** | Run **antérieur** au correctif : le corpus contient des articles d'autres organes (cœur, foie, poumon) | ❌ **Ne pas utiliser** |

À 6 310 lignes, les dénominateurs statistiques sont faux : le NPMI et les
odds ratios sont calculés contre un corpus qui n'est pas le corpus rénal. Les
signaux affichés seraient trompeurs sans qu'aucune validation ne le détecte —
le builder vérifie la *cohérence interne*, pas la *provenance*.

```bash
wc -l data/processed/merged_corpus_renal.csv   # attendu : 5581
```

Le périmètre annoncé dans le README (« Corpus A — espace allélique, N = 5 581 »)
et le chiffre affiché par l'interface découlent tous deux de ce fichier.

---

## 2. Correspondance des CSV — ce n'est pas un simple renommage

Le pipeline produit ses fichiers sous ses propres noms **et sous son propre
schéma de colonnes**. Le builder attend les noms et les colonnes de la forme
synthétique. Les deux ne sont pas identiques.

| Sortie du pipeline | Entrée attendue par le builder |
|---|---|
| `hla_outcome_pairs_v2.csv` | `pair_mentions.csv` |
| `association_stats_v2.csv` | `associations.csv` |
| `merged_corpus_renal.csv` | `articles.csv` |

> ⚠️ **Un `mv` ne suffira pas.** Les noms de colonnes diffèrent très
> probablement entre la sortie brute du pipeline et la forme que le builder
> lit. Il faut écrire **une petite étape de transformation** (un script de
> conversion, ~50 lignes de `pandas` ou de `csv`) qui renomme les colonnes et
> projette les champs attendus.

Trois fichiers supplémentaires sont attendus par le builder et **n'ont pas de
correspondance directe** dans la liste ci-dessus — vérifier d'où ils viennent
dans le pipeline avant de commencer :

- `hla_entities.csv` (les allèles, avec leur `parent_hla`)
- `authors.csv` (liaison pmid → auteur)
- `outcomes` — dérivé des libellés, cf. validation V8 ci-dessous.

**Méthode recommandée :** lancer le builder une première fois sur les données
réelles et **laisser les validations échouer**. Les messages d'erreur (V1…V8)
nomment précisément la colonne ou la clé manquante, et constituent la
spécification la plus fiable de l'étape de transformation à écrire.

---

## 3. Commande de build réel

```bash
python scripts/build_sqlite.py --source data/processed --out dist/corpus_A_v1.2.sqlite --version A-1.2
```

Points d'attention, lus dans `scripts/build_sqlite.py` :

- **Ne pas passer `--synthetic`.** Ce drapeau (`action="store_true"`) écrit
  `is_synthetic = 1` en base. Son absence écrit `0` — c'est exactement ce que
  l'on veut ici (cf. §5).
- Les valeurs par défaut visent le synthétique (`--source data/synthetic`,
  `--out dist/corpus_A_synthetic.sqlite`) : les trois arguments ci-dessus
  doivent donc être fournis explicitement.
- `--universe` vaut `A` par défaut. Le corpus B (épletique, N = 359) est
  **strictement disjoint** et ne doit jamais être mélangé au corpus A.
- La base produite est un **artefact de build**, vérifiable par son SHA-256.
  Elle n'est jamais éditée à la main.

---

## 4. Les 8 validations du builder

Elles s'exécutent dans `validate()` (`scripts/build_sqlite.py`) et lèvent une
`ValidationError` qui **interrompt le build**. Aucune base incohérente ne peut
donc être produite silencieusement. Description d'après l'implémentation
réelle, dont l'ordre d'exécution diffère de la numérotation :

| # | Ce qui est réellement vérifié |
|---|---|
| **V1** | Le nombre d'articles lus est égal au nombre déclaré ; aucun `pmid` dupliqué dans `articles.csv` ; aucun `hla` dupliqué dans `hla_entities.csv` ; aucune paire dupliquée dans `associations.csv`. |
| **V8** | Tout `outcome` présent possède un libellé **et** une catégorie dans `OUTCOME_LABELS`. **Exécutée avant V2**, car l'ensemble des outcomes validés sert ensuite de référence. |
| **V2** | Toute clé étrangère référencée existe : `authors.csv` et `pair_mentions.csv` pointent vers des `pmid` connus, `pair_mentions.csv` et `associations.csv` vers des `hla` connus. Re-vérifiée après insertion par un `PRAGMA foreign_key_check`. |
| **V5** | Tout `parent_hla` déclaré se résout vers un allèle existant, et la hiérarchie HLA est **acyclique**. |
| **V7** | L'année de chaque article est présente et plausible (bornée par `MAX_YEAR`, qui dépend de l'année courante). |
| **V3** | Cohérence des agrégats : le `n_cooccurrence` déclaré dans `associations.csv` correspond au décompte réel des mentions ; et **toute paire mentionnée possède une ligne d'association**. |
| **V4** | `n_positive + n_negated` est cohérent avec le total — les mentions **négées sont comptées séparément**, jamais fondues dans le total positif. |
| **V6** | Domaines numériques : `npmi ∈ [-1, 1]`, et les probabilités (p-values, FDR) dans `[0, 1]`. |

**V8 est la validation la plus susceptible d'échouer à la bascule** : le
pipeline réel produira vraisemblablement des `outcome` absents des 21 clés
actuelles. Deux réponses possibles — ajouter l'entrée dans **`scripts/labels.py`
ET dans `src/lib/labels.ts`** (les deux fichiers sont un miroir manuel l'un de
l'autre et doivent rester synchronisés), ou filtrer l'outcome en amont.

**Ne jamais afficher une clé technique brute pour contourner V8.** C'est la
règle que `src/__tests__/vocabulary.test.ts` protège.

---

## 5. Retrait du bandeau synthétique — mécanisme réel

Le bandeau n'est **pas** retiré en modifiant le code : il est piloté par une
donnée en base.

**La chaîne exacte, vérifiée dans le code :**

1. `scripts/build_sqlite.py` écrit `is_synthetic` dans la table
   `corpus_version` : `1` si `--synthetic` est passé, `0` sinon.
   Le schéma contraint la valeur (`CHECK (is_synthetic IN (0, 1))`).
2. `getCorpusVersion()` (`src/lib/db.ts`) lit cette ligne et expose le booléen
   `isSynthetic: row.is_synthetic === 1`. Le résultat est **mis en cache** dans
   le module (`cachedVersion`).
3. `src/app/layout.tsx:48` est le **seul** point de décision :
   ```tsx
   {corpus.isSynthetic ? <SyntheticBanner version={corpus.version} /> : null}
   ```

Donc : **construire la base sans `--synthetic` suffit.** Aucune modification de
composant n'est nécessaire.

> ### Précision importante — `EpistemicNotice` et `GlobalFramingReminder` ne sont PAS concernés
>
> Contrairement à ce qu'on pourrait supposer, ces deux composants **ne testent
> jamais `isSynthetic`** (vérifié : aucune occurrence). Ils s'affichent
> **toujours**, sur données réelles comme synthétiques — et c'est voulu. Le
> cadrage épistémique (« ce sont des co-occurrences textuelles, pas des
> associations cliniques ») reste vrai, et même **plus important**, sur données
> réelles. Seul `SyntheticBanner` disparaît.

**Cache :** `cachedVersion` étant mémorisé au niveau du module, un serveur déjà
lancé continuera d'afficher l'ancienne valeur après remplacement du fichier
SQLite. **Redémarrer le serveur** après la bascule.

**Chemin de la base :** `src/lib/db.ts` lit `process.env.CORPUS_DB_PATH`, avec
pour défaut `dist/corpus_A_synthetic.sqlite`. Après la bascule, il faut donc
soit définir `CORPUS_DB_PATH=dist/corpus_A_v1.2.sqlite`, soit changer ce défaut.
**Sans cela, l'interface continuera de servir les données synthétiques**, en
silence.

---

## 6. Checklist de re-vérification après bascule

### Littéraux spécifiques au synthétique repérés dans le code

Recherche effectuée sur `src/` et `scripts/` :

| Emplacement | Contenu | Action requise |
|---|---|---|
| `src/lib/db.ts:30` | défaut `dist/corpus_A_synthetic.sqlite` | ✅ **À traiter** — définir `CORPUS_DB_PATH` ou changer le défaut |
| `src/lib/extraction-metrics.ts:50` | `measuredAgainstCorpus: "A-synthetic"` | ✅ **À traiter** — voir ci-dessous |
| `src/app/page.tsx:8` | `SHOWCASE_ALLELE = "HLA-DQB1*02:01"` | ✅ **À traiter** — voir ci-dessous |
| `scripts/gen_synthetic.py:218` | `SHOWCASE_HLA` | ⚪ Générateur synthétique uniquement — sans effet sur le build réel |
| `scripts/build_sqlite.py:592-597` | défauts `data/synthetic`, `A-synthetic` | ⚪ Neutralisés en passant les arguments explicitement (§3) |

Les nombreuses occurrences de `HLA-DQB1*02:01` dans les **commentaires** (`db.ts`,
`GraphExplorer.tsx`, `HighlightedSentence.tsx`, `SearchBar.tsx`…) sont des
exemples d'encodage d'URL et de métacaractères regex. Elles restent valides :
c'est la *forme* IPD-IMGT qui est illustrée, pas cet allèle en particulier.

### Les métriques d'extraction se signalent toutes seules

`areMetricsStale()` (`src/lib/extraction-metrics.ts`) compare
`measuredAgainstCorpus` à la version du corpus rendu :

```ts
return EXTRACTION_METRICS.measuredAgainstCorpus !== corpusVersion;
```

Avec `--version A-1.2`, la comparaison `"A-synthetic" !== "A-1.2"` devient vraie
et **l'encart affiche de lui-même un avertissement de péremption**. C'est le
comportement voulu : les chiffres de précision (78,75 %) et de kappa (0,44) ont
été mesurés sur un autre corpus et ne sont pas transposables tels quels.

→ **Action :** remesurer précision et kappa sur le corpus réel, puis mettre à
jour `EXTRACTION_METRICS` (y compris `measuredAgainstCorpus: "A-1.2"`).
Ne pas se contenter de changer la chaîne pour faire taire l'avertissement.

### L'allèle vedette de la page d'accueil

`SHOWCASE_ALLELE = "HLA-DQB1*02:01"` alimente une carte d'entrée de la landing
page. Cet allèle a été choisi parce qu'il est **fabriqué comme saillant** dans
les données synthétiques (`SHOWCASE_HLA` dans `gen_synthetic.py`).

Rien ne garantit qu'il soit représentatif du corpus réel. S'il y est marginal,
la page d'accueil ouvre sur une fiche quasi vide.

→ **Action :** après le build, interroger la base pour l'allèle le mieux
documenté et ajuster la constante :

```sql
SELECT hla, COUNT(*) AS n FROM pair_mentions GROUP BY hla ORDER BY n DESC LIMIT 5;
```

### Checklist finale

- [ ] `wc -l data/processed/merged_corpus_renal.csv` → **5581**
- [ ] Étape de transformation des colonnes écrite et versionnée
- [ ] Build réel passé sans `--synthetic`, les 8 validations vertes
- [ ] `labels.py` et `labels.ts` synchronisés si V8 a révélé de nouveaux outcomes
- [ ] `CORPUS_DB_PATH` pointe sur `dist/corpus_A_v1.2.sqlite`
- [ ] Serveur redémarré (cache `cachedVersion`)
- [ ] Bandeau synthétique absent ; `EpistemicNotice` toujours présent
- [ ] `EXTRACTION_METRICS` remesurées et `measuredAgainstCorpus` mis à jour
- [ ] `SHOWCASE_ALLELE` vérifié contre les données réelles
- [ ] `npx vitest run` vert — **dont `vocabulary.test.ts`**, qui garantit
      qu'aucune clé technique réelle n'a fui à l'écran
- [ ] SHA-256 de la base consigné
- [ ] N affiché par l'interface cohérent avec 5 581

---

## 7. Pourquoi le garde-fou vocabulaire compte particulièrement ici

La bascule est le moment où de nouvelles clés d'outcome entrent dans le
système. `src/__tests__/vocabulary.test.ts` vérifie que :

- aucune formulation causale (« associé à », « prédit », « provoque »…)
  n'apparaît dans le texte visible ;
- **aucune des 21 clés techniques** n'est affichée telle quelle ;
- aucun code ne **retombe sur la clé technique** en guise de libellé —
  motif `?? outcome`, qui est précisément le bug trouvé et corrigé lors de la
  mise en place du garde-fou (`article/[pmid]/page.tsx`), et dont le
  déclencheur naturel est un outcome inconnu de la table `outcomes`, c'est-à-dire
  exactement ce que la bascule peut produire.

Lancer ce test après la bascule n'est donc pas une formalité.
