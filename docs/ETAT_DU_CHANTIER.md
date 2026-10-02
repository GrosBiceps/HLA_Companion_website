# État du chantier — 21/09/2026

Document de reprise. Il dit où en est le prototype, ce qui reste à faire, et
les décisions prises en cours de route.

---

## Jeu synthétique élargi (02/10/2026)

Le générateur (`scripts/gen_synthetic.py`) produit désormais par défaut un
corpus **toujours fictif** (`is_synthetic = 1`, bandeau maintenu) mais
nettement plus riche, pour développer les visualisations sur un paysage
crédible :

| Élément | Avant | Maintenant (seed 42) |
|---|---|---|
| Articles | 400 | **3 000** (1990–2026, croissance ~7 %/an) |
| Auteurs distincts | 42 | **2 611** (215 avec ≥ 15 publications, max 63 ; 449 auteurs à 1 article) |
| Revues / pays | 5 / 10 | **25 / 20** |
| Entités HLA | 46 | **154** : 47 allèles 2-digit, 97 allèles 4-digit, 6 loci, 2 classes, `HLA-mismatch`, `HLA-eplet` |
| Complications présentes | 19 | **21 / 21** (les 7 catégories) |
| Phrases sources (`pair_mentions`) | 862 | **15 522** |
| Associations | 127 | **2 365** — strong 80 · clear 52 · moderate 12 · inverse 13 · weak 2 208 |
| Base SQLite | ~1 Mo | **13,9 Mo** (génération + build < 2 s) |

Le vocabulaire 2-digit s'inspire de la carte v1 réelle
(`data/legacy/carte_v1_renal.json`). Le modèle génératif a changé : un article
cite un *ensemble* d'allèles et de complications et émet une mention pour
chaque paire du produit cartésien, ce qui rend la table de contingence
cohérente (l'ancien modèle déprimait mécaniquement tous les NPMI). Les signaux
planifiés passent par une co-citation conditionnelle ; les niveaux `moderate`
et une partie des `clear` viennent d'allèles rares cités par 2 à 6 articles.
Les popularités varient avec les années (eplets, DSA, ABMR en hausse ; rejet
aigu en baisse), d'où quelques associations de « mode de publication ». Les
noms d'auteurs sont des patronymes courants + initiales tirées au hasard :
aucun article fictif n'est attribué à un chercheur réel identifiable.

**Performance** (mesurée sous Vitest sur la base de 3 000 articles) : voisinage
de graphe 0,3 ms (profondeur 1) à 18 ms (profondeur 3), recherche FTS < 2 ms,
fiches allèle / complication / auteur < 1 ms, `getAssociationMatrix` 2 ms.
Aucun index supplémentaire n'a été jugé nécessaire.

**Nouvelles requêtes pour les visualisations** (`src/lib/queries.ts`, testées
dans `src/__tests__/overview-queries.test.ts`) : `getAssociationMatrix()`
(matrice creuse HLA 2-digit × complication), `getPublicationsByYear()` et
`getCorpusStats()` étendu (auteurs, revues, pays, associations par niveau de
signal, allèles par résolution).

⚠ Le voisinage de graphe **dépasse désormais le plafond de 150 nœuds** dès la
profondeur 2 (≈ 170 nœuds atteignables) : la troncature par force de signal
est exercée en conditions réelles, et l'interface doit afficher son
avertissement de troncature.

---

## Avancement : 10 tâches sur 10 écrites ; tâche 9 en attente de revue

| # | Tâche | État | Tests |
|---|---|---|---|
| 1 | Schéma SQLite + libellés cliniques | ✅ relu | 12 |
| 2 | Générateur de données synthétiques | ✅ relu *(1 correctif)* | 21 |
| 3 | Builder + 8 validations bloquantes | ✅ relu | 15 |
| 4 | Scaffolding Next.js + accès données | ✅ relu *(1 correctif)* | 13 |
| 5 | Landing page + cadrage épistémique | ✅ relu *(1 correctif)* | 26 |
| 6 | Fiche allèle | ✅ relu *(1 correctif)* | 36 |
| 7 | Tiroir de phrases | ✅ relu, zéro finding | 47 |
| 8 | Fiches complication / article / auteur | ✅ relu *(1 correctif)* | 74 |
| 9 | **Explorateur de graphe** | ⚠️ **code écrit, commit `c15c6c3`, REVUE INTERROMPUE** | 96 |
| 10 | Garde-fous + doc de bascule | ✅ relu *(1 correctif : fuite de clé technique)* | 109 |

**Vérifié au 21/09** : 109 tests TS + 48 tests Python passent, `tsc --noEmit`
propre, `npm run build` réussit, aucun serveur de dev orphelin.

La tâche 10 a trouvé et corrigé une fuite réelle : `article/[pmid]/page.tsx`
retombait sur la clé technique brute (`graft_loss`…) comme libellé affiché dès
que `getOutcome()` rendait `null`. Voir `docs/BASCULE_DONNEES_REELLES.md` pour
la procédure de bascule, dont le chantier de transformation des CSV (des champs
de phrase manquent aux sorties documentées du pipeline).

## ⚠️ La tâche 9 n'a pas terminé sa revue

Le code est écrit, commité (`c15c6c3`) et poussé — 96 tests passent, build
propre — mais la revue a été **interrompue par l'utilisateur** avant tout
verdict (contrairement à la tâche 6, où l'implémenteur avait été coupé : ici
c'est la relecture elle-même qui n'a pas eu lieu). Ne pas considérer cette
tâche comme close.

Points à vérifier en priorité à la reprise (déjà signalés par l'implémenteur
lui-même, à confirmer par un relecteur indépendant) :

- **Sigma.js et graphology ne sont pas installés** (vérifié : absents de
  `package.json`), alors que la spec les recommandait. L'implémenteur a
  substitué un rendu SVG en anneaux concentriques, en faisant valoir qu'aucune
  dépendance lourde n'est justifiée pour un corpus qui plafonnait à 54 nœuds
  (ce n'est plus vrai depuis le jeu élargi : ≈ 170 nœuds atteignables)
  atteignables (sur les 150 permis). À juger : le rendu est-il réellement
  utilisable (lisibilité, distinction HLA/complication, style des arêtes) ?
- Le plafond de 150 nœuds ne peut pas être atteint par le corpus réel — la
  troncature par force de signal a été testée séparément sur un graphe
  synthétique de 300 nœuds. Vérifier que ce test exerce vraiment la logique.
- La promesse de **bidirectionnalité** (HLA ↔ complication) : interroger
  `getNeighborhood` avec une complication en centre, pas seulement un allèle.
- Un lien mort `/graphe` vs `/graph` a été trouvé et corrigé par
  l'implémenteur — même classe de bug que celui de la tâche 8 (`SearchBar`
  pointant vers des routes inexistantes). Un test de garde générique a été
  ajouté ; vérifier qu'il contrôle vraiment `page.tsx` contre le système de
  fichiers, pas seulement les chemins actuels.
- Round-trip de l'URL `?center=` pour les clés HLA contenant `*` et `:`.
- Aucune métrique brute (NPMI/FDR/OR) ne doit apparaître dans les
  tooltips/labels du graphe — seulement le vocabulaire qualitatif de signal.

---

## La tâche 6 a été relue a posteriori

L'implémenteur de la tâche 6 a été coupé par une limite de session avant
d'écrire son rapport. Le code était néanmoins complet et fonctionnel
(36 tests, build propre) ; il a été commité tel quel puis **relu comme une
première revue complète**, avec la même rigueur que les tâches précédentes —
vérifications en direct sur la base (`HLA-DQB1*02:01`, `HLA-A*01`), sondes
HTTP sur le serveur de dev, balayage du vocabulaire causal sur le rendu réel.

Un point notable : l'implémenteur a **corrigé un bug du brief lui-même**. Le
brief demandait deux assertions de test mutuellement insatisfaisables
(`textContent` concatène tout le sous-arbre, y compris un `<details>` fermé,
donc « aucune métrique dans le texte » et « NPMI dans un `<details>` enfant »
se contredisaient). L'implémenteur a mesuré le texte réellement visible à la
place, documenté le choix, et gardé le test aussi mordant. Bonne pratique à
retenir : quand un test du plan est intenable, corriger l'intention plutôt que
l'affaiblir, et le dire explicitement.

Deux correctifs mineurs appliqués après revue : un lien « Voir les N phrases »
pointait vers une route `/paire/...` qui n'existe pas et n'est pas prévue (la
tâche 7 ouvre un tiroir côté client sur la même page, pas une route dédiée) —
transformé en bouton désactivé avec explication ; et une pluralisation
française incorrecte au singulier (« 1 articles »).

---

## Reprendre le travail

Le plan complet est dans
[docs/superpowers/plans/2026-09-16-compagnon-hla-prototype.md](superpowers/plans/2026-09-16-compagnon-hla-prototype.md).
Chaque tâche y porte ses tests écrits intégralement.

```bash
npm install
python scripts/build_sqlite.py --source data/synthetic \
    --out dist/corpus_A_synthetic.sqlite --version A-synthetic --synthetic
npx vitest run
npm run dev
```

La base `.sqlite` n'est pas versionnée (artefact de build) — la reconstruire
avec la commande ci-dessus. Seul son `.sha256` est suivi.

---

## Décisions prises en cours de route

Elles sont toutes révocables. Chacune indique ce qu'elle coûte si elle est
mauvaise.

**Duplication `labels.py` / `labels.ts`.** Le builder est en Python, l'UI en
TypeScript ; aucun ne peut importer l'autre. Générer l'un depuis l'autre
ajouterait une étape de build pour 21 lignes stables.
*Coût si erroné* : une divergence de libellé, attrapée par les tests (vérifié :
les deux fichiers concordent 21/21).

**`src/lib/queries.ts` étendu par ajout pur**, jamais réécrit, par les tâches
successives. *Coût si erroné* : un conflit d'édition, détecté par les tests.

**La table `outcomes` ne contient que les complications présentes dans le
corpus**, pas nécessairement les 21 du référentiel (19 dans l'ancien jeu de
400 articles ; les 21 dans le jeu élargi). Cohérent avec « tout agrégat est
dérivable des extractions » : une complication jamais mentionnée n'a pas de
ligne. *Coût si erroné* : sur un corpus réel incomplet, la page « Explorer par
complication » listera moins de 21 entrées. Rattrapable en une requête.

**La validation V1 reste tautologique** (elle compare `len(articles)` à
lui-même). Un compte déclaré n'a de sens que face à une source indépendante —
à câbler à la bascule vers les données réelles, où N = 5 581 deviendra
vérifiable. Ses autres branches (doublons de `pmid`, de `hla`, de paires) ont
bien des dents.
*Coût si erroné* : un décompte erroné passerait, mais V3 et
`foreign_key_check` couvrent les incohérences qui en découleraient.

**Le garde-fou de vocabulaire (tâche 10) restera une analyse textuelle**, mais
devra **dépouiller les commentaires** avant de scanner. Un parseur JSX est
disproportionné pour un prototype ; en revanche un développeur a déjà dû
contorsionner un commentaire pour éviter un faux positif.
*Coût si erroné* : quelques faux positifs, contournables.

**Le cadrage épistémique est global (`layout.tsx`), pas par route.** Le cadrage
par route est *opt-in* : il échoue en mode ouvert, car chaque future route doit
y penser et celle qui oublie expédie une page sans cadrage. `layout.tsx` rend
déjà `SyntheticBanner` globalement.
*Coût si erroné* : un rappel redondant sur la page d'accueil, trivial à retirer.

---

## Points laissés ouverts

- `/methodologie` renvoie un 404. **Délibérément non édulcoré** : c'est
  l'échappatoire « relire les sources » de l'encart de cadrage, et l'affaiblir
  pour une raison de calendrier coûterait plus que le lien mort. Une page
  d'erreur stylée coûterait peu.
- ~~Le bloc `CONTRAT STATISTIQUE` surestime la reconstructibilité~~ : la
  garantie est désormais scopée à `npmi` / `odds_ratio` / `pval_fisher`, avec
  l'exception de censure de `pval_two_sided` documentée.
- Le générateur a trois régimes de taille, documentés dans sa docstring :
  < 300 articles (2 paires inverses portées par des « porteurs » fréquents,
  pour les tests), ≥ 300 (12 paires inverses planifiées), ≥ 1 500 (allèles
  rares des niveaux `moderate` / `clear`). Seed 42 : 2 inverses à n=299,
  aucun à n=300 (le test bilatéral manque encore de puissance), 3 à n=1 000,
  13 à n=3 000.
- Les échecs en phase d'écriture du builder lèvent `IntegrityError`, non
  attrapée par le CLI → traceback au lieu du message « Aucun fichier produit ».
  Cosmétique, l'atomicité est intacte.
- Le slug auteur n'applique pas de normalisation NFKD : « Müller H » et
  « Muller H » donnent deux auteurs distincts. Stable et déterministe, mais à
  surveiller si les chaînes PubMed arrivent inconsistamment accentuées.
- Le SHA-256 de la base dépend de la version de SQLite. À documenter avant
  toute vérification du `.sha256` en CI sur un autre runner.
- Le tableau « État du projet » du README est resté à 🔜 alors que plusieurs
  briques sont faites. À mettre à jour.

---

## Ce que la boucle de revue a attrapé

Utile à savoir pour calibrer la confiance dans le code non relu.

**Tâche 2** — le générateur fabriquait les « signaux inverses » en gonflant
artificiellement deux cases de la table de contingence. La paire la plus
fortement co-citée du jeu sortait simultanément badgée « protecteur,
p = 2×10⁻⁸ ». Corrigé à la racine : une seule table alimente désormais toutes
les métriques. Le relecteur a vérifié que le test ajouté **échoue sur l'ancien
code**.

**Tâche 3** — 13 corruptions adversariales construites par le relecteur. Les
validations tiennent, y compris aux deux endroits où une implémentation
superficielle serait quand même passée : V5 détecte de vrais cycles (pas
seulement un parent manquant), V3 attrape les écarts dans les deux directions.

**Tâche 4** — un octet NUL dans la recherche (`?q=%00x`) faisait planter la
page. Trouvé en fuzzant 37 entrées hostiles.

**Tâche 5** — **tous les tests passaient**, et pourtant l'encart de cadrage
était contournable : le panneau de résultats, en `absolute z-20`, se peignait
par-dessus. Un utilisateur qui tapait immédiatement atteignait une fiche sans
avoir lu une ligne du cadrage. Le `meta description` du site disait par
ailleurs « associations » — le mot exact que l'encart existe pour réfuter.

Ces quatre défauts ont en commun d'être invisibles aux tests — d'où l'intérêt
de relire même du code dont les tests passent tous, ce qui a été fait pour la
tâche 6 malgré l'absence de rapport d'implémenteur.
