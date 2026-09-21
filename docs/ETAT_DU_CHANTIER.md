# État du chantier — 21/09/2026

Document de reprise. Il dit où en est le prototype, ce qui reste à faire, et
les décisions prises en cours de route.

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
  dépendance lourde n'est justifiée pour un corpus qui plafonne à 54 nœuds
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

**La table `outcomes` ne contient que les 19 complications présentes dans le
corpus**, pas les 21 du référentiel. Cohérent avec « tout agrégat est dérivable
des extractions » : une complication jamais mentionnée n'a pas de ligne.
*Coût si erroné* : la page « Explorer par complication » listera 19 entrées au
lieu de 21. Rattrapable en une requête.

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
- Le bloc `CONTRAT STATISTIQUE` de `gen_synthetic.py` surestime la
  reconstructibilité : `pval_two_sided` est censuré à 1.0 sous `INVERSE_MIN_N`
  (16 lignes sur 127). Scoper la garantie à `npmi` / `odds_ratio` /
  `pval_fisher`.
- Le générateur change de régime à `n_articles == 300` (29 signaux inverses sur
  170 à n=299, contre 3 sur 129 à n=300). Non documenté en magnitude.
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
