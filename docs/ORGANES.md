# Organes — corpus multi-organe et strates statistiques

Le site était pensé pour la seule transplantation rénale. Il rassemble désormais
les articles de **sept organes** et permet de trier, filtrer et recalculer
chaque statistique par organe. Ce document décrit le modèle, les choix de
conception et les garde-fous.

## 1. Vocabulaire

| Clé stable | Libellé | Court | Slug d'URL | Couleur (clair / sombre) | Forme |
|---|---|---|---|---|---|
| `kidney` | Rein | Rein | `rein` | #B04A5E / #E58C9D | cercle |
| `liver` | Foie | Foie | `foie` | #A8861C / #E3CE72 | carré |
| `heart` | Cœur | Cœur | `coeur` | #8A1F55 / #D86AA6 | losange |
| `lung` | Poumon | Poumon | `poumon` | #3C8DBE / #8CCBF0 | triangle |
| `hsct` | Cellules souches hématopoïétiques | GCSH | `gcsh` | #8B3F94 / #C98AD0 | hexagone |
| `pancreas` | Pancréas (dont pancréas-rein) | Pancréas | `pancreas` | #7A7F1F / #BEC450 | pentagone |
| `intestine` | Intestin | Intestin | `intestin` | #2A8C7C / #5CC5B3 | barre |
| `all` (sentinelle) | Tous les organes | Tous | (aucun) | neutre #64697C / #8B91A3 | anneau |

- La source unique est `scripts/labels.py` ; `src/lib/organ.ts` et
  `src/lib/labels.ts` en sont le miroir, vérifié entrée par entrée par
  `organ-vocabulary.test.ts` (qui charge le module Python lui-même).
- **La couleur n'est jamais seule** : chaque organe a une forme propre
  (`ORGAN_SHAPES`). Les teintes ne reprennent aucune teinte de signal ni de
  catégorie (testé) et restent distinguables en vision des couleurs altérée.
- Jetons CSS `--organ-*` (clair/sombre) et classes Tailwind `organ-*` dans
  `globals.css` et `tailwind.config.ts`, entre marqueurs délimités.
- Deux catégories de complications ont été ajoutées : `cat-gvh` (réaction du
  greffon contre l'hôte) et `cat-survie`.

## 2. Données

- 7 000 articles : rein 2 794, foie 969, cœur 798, poumon 880, GCSH 1 103,
  pancréas 685, intestin 198. 427 articles sont **multi-organes** (table
  `article_organs`, clé `(pmid, organ)`).
- 46 complications (25 ajoutées). Chacune porte les organes auxquels elle
  s'applique (`outcome_organs`) : rein 23, foie 19, cœur 18, poumon 19,
  GCSH 15, pancréas 16, intestin 14. EBV et mortalité du patient sont communes.
- 25 774 lignes d'association ; base de 37,3 Mo (budget : 45 Mo).
- Le nom `corpus_A_synthetic` est conservé pour éviter des remaniements ; le
  `.sqlite` n'est jamais commité, seul `dist/corpus_A_synthetic.sqlite.sha256` l'est.
- Construction déterministe (empreinte SHA-256 identique à chaque exécution).

### Validations du constructeur (`scripts/build_sqlite.py`)

V11 à V16 : organe connu pour chaque article, au moins un organe par article,
complication applicable à l'organe de son article, comptes précalculés
(`hla_organ_counts`, `outcome_organ_counts`) égaux aux recomptages, cohérence
des strates, et V16 (drapeau pour les données réelles : refuse un organe
inféré sans source). V15 est une redondance défensive.

## 3. Statistiques stratifiées

La strate est un couple **(organe | `all`)**. Pour chaque strate, **tout est
recalculé sur les seuls articles de l'organe** : tableau 2×2, NPMI, odds ratio
(Haldane-Anscombe), test exact de Fisher, famille de correction BH-FDR, et
surtout le **dénominateur** `n_universe` propre à la strate.

Conséquences assumées :

- un article multi-organe compte dans **chacune** de ses strates d'organe ;
- la strate « tous » **n'est pas la somme** des strates d'organe, elle est
  calculée sur l'ensemble des articles distincts (un article multi-organe n'y
  compte qu'une fois) ;
- un signal peut exister dans « tous » sans exister dans un organe, et
  inversement : c'est un effet de dénominateur, pas une erreur.

## 4. Requêtes (`src/lib/queries.ts`)

Chaque requête accepte un `organ` optionnel (défaut `'all'`, ce qui préserve
les appelants existants : page d'accueil, présentation).

- `getAssociationsForAllele(hla, organ?)`, `getAssociationsForOutcome(outcome, organ?)`,
  `getPairMentions(hla, outcome, organ?)`
- `getCorpusStats(organ?)`, `getPublicationsByYear(organ?)`, `getOutcomesByCategory(organ?)`
- `getNeighborhood(center, depth, minSignal?, organ?)`, `getDefaultGraphCenter(organ?)`
- `getAssociationMatrix(resolution, locus?, organ?)`, `getMatrixLoci(resolution, organ?)`
- `getSignalHighlights({levels, resolutions, limit, organ})`, `getLocusOverview(perLocus, organ?)`
- `getAlleleCatalog(organ?)`, `getOutcomeCatalog(topN, organ?)`, `getTopAuthors(limit, organ?)`
- `searchEntities(q, limit, organ?)`
- nouveaux : `getOrgans()`, `getArticleOrgans(pmid)`, `getAlleleOrganCounts`,
  `getOutcomeOrganCounts`, `getAuthorOrganMix`, `getOrganMap`, `getSerotypeOrganCounts`

Le filtrage passe par une jointure sur `article_organs` ; les effectifs
fréquents sont précalculés. Budget de latence : < 100 ms par requête, pour
chaque organe (`performance.test.ts`).

## 5. Interface

- **Sélecteur d'organe** dans l'en-tête (`OrganSelector`), liste à 8 choix avec
  effectifs, clavier complet (flèches, Échap). Sur mobile, il s'ouvre en feuille.
- **L'URL est la seule source de vérité** : `?organe=coeur`. Pas de cookie, pour
  qu'un lien partagé reproduise exactement la même vue. Les valeurs inconnues
  valent « tous ».
- `withOrgan(href, organ)` reporte l'organe sur tous les liens internes (menu,
  logo, fiches, matrice, graphe, résultats de recherche, API). Exemptés : les
  pages de contenu `/methode` et `/guide`, les liens externes, les ancres.
- **Recherche** : l'organe courant est transmis ; un mot d'organe saisi
  (« DR15 cœur ») est lu comme un filtre.
- **Bandeau « Trier par organe »** sur les index (allèles, sérotypes,
  complications, matrice), cartes « Par organe » sur les fiches, puces d'organe
  sur les articles et les auteurs, mélange d'organes d'un auteur.
- **Bandeau de strate** : sous un organe, chaque fiche annonce la strate
  affichée, son nombre d'articles, et que les mesures sont recalculées.
- **Matrice** : colonnes limitées aux complications applicables à l'organe ;
  les paires multi-organes exclues sont signalées (`nCellsOutsideOrgan`).
- **Index des complications** : seules celles de l'organe, avec un interrupteur
  pour voir les autres (marquées « Ne s'applique pas à … »).
- **`/carte-v1`** reste propre au rein ; le sélecteur y est désactivé et le dit.
- Les mesures de qualité d'extraction (précision 78,75 %, κ 0,44) sont
  explicitement présentées comme **mesurées sur le corpus rein uniquement**
  (`extraction-metrics.ts`, `/methode`).

## 6. Garde-fous

- Aucune formulation causale (« associé à », « lié à », « risque de »…).
- Aucune clé brute à l'écran (complications, organes) ; les libellés viennent de
  `labels.ts` / `organ.ts`.
- Aucune métrique brute (NPMI, OR, FDR) hors d'un `<details>`.
- Ces règles sont vérifiées sur le rendu de chaque page, pour chaque organe
  (`organ-pages.test.tsx`), avec un « crawler » qui exige `organe=<slug>` sur
  tous les liens internes (hors commutateurs d'organe, par nature).

## 7. Tests

| Fichier | Couvre |
|---|---|
| `scripts/tests/test_labels.py`, `test_gen_synthetic.py`, `test_organs.py` | vocabulaire, génération, validations V11-V16 |
| `organ.test.ts` | lecture/écriture de l'URL, `withOrgan`, mot d'organe |
| `organ-vocabulary.test.ts` | synchronisation Python/TS, couleurs, formes |
| `organ-queries.test.ts` | statistiques stratifiées recalculées à la main |
| `organ-pages.test.tsx` | rendu par organe, report de l'organe, en-tête, sélecteur, recherche |
| `performance.test.ts` | < 100 ms par organe |
| `routes.test.ts` | aucun lien en dur vers une route sensible à l'organe |

## 8. Points ouverts

- Données réelles : le drapeau V16 doit être activé à la bascule
  (voir `BASCULE_DONNEES_REELLES.md`).
- Les mesures d'extraction n'existent que pour le rein ; une validation par
  organe reste à faire.
- L'intestin est peu fourni (198 articles) : ses strates sont fragiles et
  l'interface affiche les effectifs plutôt que de les masquer.

Captures d'écran : `docs/screenshots/organes/`.
