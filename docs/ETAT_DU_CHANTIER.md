# État du chantier — 21/09/2026

Document de reprise. Il dit où en est le prototype, ce qui reste à faire, et
les décisions prises en cours de route.

---

## Avancement : 5 tâches terminées sur 10, 1 en attente de relecture

| # | Tâche | État | Tests |
|---|---|---|---|
| 1 | Schéma SQLite + libellés cliniques | ✅ relu | 12 |
| 2 | Générateur de données synthétiques | ✅ relu *(1 correctif)* | 21 |
| 3 | Builder + 8 validations bloquantes | ✅ relu | 15 |
| 4 | Scaffolding Next.js + accès données | ✅ relu *(1 correctif)* | 13 |
| 5 | Landing page + cadrage épistémique | ✅ relu *(1 correctif)* | 26 |
| 6 | **Fiche allèle** | ⚠️ **code écrit, NON RELU** | 36 |
| 7 | Tiroir de phrases | ⬜ à faire | — |
| 8 | Fiches complication / article / auteur | ⬜ à faire | — |
| 9 | Explorateur de graphe | ⬜ à faire | — |
| 10 | Garde-fous + doc de bascule | ⬜ à faire | — |

**Vérifié au 21/09** : 36 tests passent, `tsc --noEmit` propre, `npm run build`
réussit, routes `/`, `/allele/[hla]`, `/api/search` générées.

---

## ⚠️ La tâche 6 n'est pas relue

Le commit `2a9b50f` a été écrit puis interrompu par une limite de session,
**avant de passer par la boucle de revue** qui a validé les tâches 1 à 5.

Les tests passent et le build tient, mais aucun relecteur n'a vérifié la
conformité au brief ni la qualité. Les revues précédentes ont trouvé des
défauts que les tests ne voyaient pas (voir plus bas) — ne pas considérer
cette tâche comme close sans relecture.

À vérifier en priorité sur cette tâche :

- Le rappel de cadrage global (`GlobalFramingReminder.tsx`) rend-il bien sur
  **toutes** les routes, y compris en accès direct par URL ?
- `AssociationCard` masque-t-elle vraiment toutes les métriques par défaut ?
- Les négations sont-elles affichées, et le non-significatif grisé plutôt que
  masqué ?
- L'URL `/allele/HLA-DQB1*02:01` résout-elle correctement (le `*` et le `:`
  doivent être encodés) ?

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

Ces quatre défauts ont en commun d'être invisibles aux tests. C'est l'argument
pour faire relire la tâche 6 avant de l'utiliser.
