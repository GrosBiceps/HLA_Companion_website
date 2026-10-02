# Visualisations — graphe, matrice, carte v1

Ce document décrit les trois vues de données du site (`/graph`, `/matrice`,
`/carte-v1`), les choix qui les fondent et les composants réutilisables qui
les portent. Il complète [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (jetons,
primitives) ; les règles épistémiques du projet priment sur toute
considération esthétique.

Captures : [`docs/screenshots/visualisations/`](screenshots/visualisations/)
(bureau 1440 px et mobile 390 px, clair et sombre, avec interactions :
survol, filtre, tri, recherche).

> **Organes.** `/graph` et `/matrice` suivent l'organe choisi (`?organe=`) :
> le graphe se recalcule sur la strate (voisinage, centre par défaut), la
> matrice ne garde que les complications applicables à l'organe et signale les
> paires multi-organes exclues. `/carte-v1` reste propre au rein, sélecteur
> désactivé. Voir [`ORGANES.md`](ORGANES.md).

---

## 1. Règles communes

| Règle | Comment elle est tenue |
|---|---|
| Jamais de vocabulaire causal | Textes relus + `vocabulary.test.ts` (scanne tout `src/`, y compris les nouveaux fichiers) |
| Jamais de métrique brute à l'écran (NPMI, OR, p, FDR) | Infobulles et panneaux parlent en **niveau de signal** (`SIGNAL_DISPLAY`) et en **nombre d'articles**. La matrice retire même `npmi` de la charge utile envoyée au navigateur (`toClientMatrix`, testé). |
| Jamais de clé technique (`graft_loss`) | Les nœuds et colonnes affichent le libellé clinique joint par la requête |
| La couleur n'est jamais seule | Chaque pastille de légende porte son libellé ; chaque case de matrice et chaque nœud a un nom accessible complet |
| Le faible est estompé, jamais masqué | Par défaut tout est dessiné ; les filtres sont des choix du lecteur, signalés par un encart « Filtre actif » avec « Tout réafficher » |
| Panne ≠ vide | Erreur de chargement = `Callout tone="danger"` (« ce n'est pas un résultat ») |
| Couleurs | Uniquement via `src/lib/theme.ts` (`SIGNAL_COLORS`, `CATEGORY_COLORS`, `HLA_CLASS_COLORS`, `CHART_NEUTRALS`) sous leur forme `.css` = `rgb(var(--token))` : le mode sombre est automatique, aucun hexadécimal en dur |

Encodages partagés : `src/lib/viz-encoding.ts` (épaisseur et ordre de dessin
des liens par niveau, opacité du faible selon la densité, couleur d'un nœud
HLA, taille d'une case de matrice). La légende dessine exactement ce que la
vue dessine.

---

## 2. Choix de bibliothèque : d3-force + d3-zoom, rendu SVG

La spec recommandait Sigma.js + graphology (WebGL). Après examen, le rendu
retenu est **SVG piloté par React**, avec deux modules d3 ciblés :

- `d3-force` — disposition par forces (collisions, attraction radiale,
  liens), **sans DOM**, donc testable sous Vitest et déterministe (générateur
  pseudo-aléatoire à graine fixe) ;
- `d3-zoom` (+ `d3-selection`, sa dépendance) — zoom molette / pincement,
  déplacement, boutons, recadrage.

**Pourquoi pas Sigma.js.**

1. **Échelle.** Le plafond anti-hairball est de 150 nœuds (au plus ~2 200
   liens à la profondeur 2) ; la carte v1 en a 80. Le SVG reste fluide à
   cette taille ; WebGL n'apporte son avantage qu'à partir de milliers
   d'éléments.
2. **Thème.** Un moteur WebGL ne lit pas le CSS : il faudrait choisir les
   hexadécimaux clair/sombre en JS et redessiner au changement de thème. En
   SVG, `rgb(var(--signal-strong))` suit le mode sombre sans code.
3. **Texte.** Étiquettes nettes à tout zoom, chasse fixe pour les allèles,
   halo de lisibilité (`paint-order: stroke`), coupure sur deux lignes.
4. **Accessibilité.** Chaque nœud est un `<g role="button" tabIndex=0>` avec
   un nom accessible ; Entrée recentre, Espace sélectionne, Échap
   désélectionne. Un canvas WebGL est opaque pour les lecteurs d'écran.
5. **Poids.** Le morceau JS chargé par `/graph` et `/carte-v1` (d3 + vue
   réseau) pèse **~72 Ko, ~25 Ko gzip**, chargé en `dynamic(..., { ssr:
   false })` uniquement sur ces deux pages. Sigma + graphology dépassent
   largement ce budget.

Performance : le zoom écrit la transformation directement dans le DOM (pas
de rendu React par image) ; seul un niveau de zoom quantifié recalcule les
étiquettes. Les ~2 000 liens de base sont mémoïsés ; le survol redessine
seulement les liens du nœud survolé dans un calque supérieur.

Si un corpus réel imposait un jour des vues de plusieurs milliers de nœuds,
`NetworkView` est le seul composant à remplacer : il reçoit des nœuds et des
liens déjà placés et stylés.

---

## 3. `/graph` — explorateur de co-mentions

Fichiers : `src/app/graph/page.tsx` (serveur : résolution du centre,
cadrage), `src/components/GraphExplorerClient.tsx` (coquille `ssr: false`),
`src/components/GraphExplorer.tsx` (client), `src/lib/network-layout.ts`,
`src/lib/graph-view.ts`, `src/lib/graph-url.ts`.

### Disposition « radiale ordonnée + forces »

- **Ossature radiale** : le centre au milieu, un anneau par saut. La
  distance au centre reste lisible, c'est la question d'une navigation de
  proche en proche.
- **Ordre angulaire signifiant** (et non arbitraire comme l'ancien rendu en
  anneaux) : au premier saut, les complications sont groupées en **secteurs
  par catégorie clinique** et les allèles par **classe puis locus**, avec un
  espace entre groupes ; aux sauts suivants, chaque nœud se place près des
  nœuds auxquels le relient ses signaux **marqués** (moyenne circulaire
  pondérée ; les liens faibles, omniprésents, ne servent qu'à départager).
- **Affinage par forces** (`d3-force`, 240 itérations synchrones) :
  collisions résolues, et les nœuds portant un signal marqué vers le centre
  sont **tirés vers l'intérieur** de leur anneau. La proximité au centre
  redouble donc l'encodage du signal : les quelques co-mentions fortes
  ressortent d'emblée parmi des dizaines de faibles.
- La disposition est calculée sur le voisinage **complet** : filtrer ne fait
  pas sauter les nœuds restants.

### Encodage

| Élément | Encodage |
|---|---|
| Allèle HLA | cercle, couleur = classe I / II (`HLA_CLASS_COLORS`), gris neutre pour une entité hors locus (eplet, mismatch…) |
| Complication | carré arrondi, couleur = catégorie clinique (`CATEGORY_COLORS`) |
| Taille | aire ~ nombre de mentions dans le corpus (racine carrée, bornée) |
| Centre | anneau indigo + contour encre, étiquette en gras |
| Lien | couleur **et** épaisseur = niveau de signal (`SIGNAL_COLORS`, `EDGE_WIDTH`) ; `inverse` en orange, hors échelle bleue |
| Faible | trait fin, opacité dégressive avec la densité (0,45 → 0,06) |
| Majoritairement nié | pointillé |
| Profondeur ≥ 2 | les liens qui ne touchent pas le centre sont du **contexte** (plus fins, plus pâles) ; le survol d'un nœud les fait ressortir |

### Interaction

- **Survol** : le nœud, ses voisins et ses liens restent nets, le reste
  s'estompe ; infobulle (type, catégorie/classe, mentions, nombre de liens
  par niveau en toutes lettres). Au doigt, pas de survol : la sélection
  suffit.
- **Clic** : sélection → **panneau latéral** (sous le graphe sur mobile) :
  libellé, classe ou catégorie, distance au centre, voisins triés par
  signal avec leur nombre d'articles, boutons « Recentrer ici » et « Ouvrir
  la fiche » (`/allele/…` ou `/complication/…`).
- **Recentrage** : double-clic, Entrée, second clic sur le nœud
  sélectionné, ou bouton du panneau. L'URL `?center=` est construite par
  `graphHref` (`URLSearchParams`) : `HLA-DQB1*02:01` devient
  `HLA-DQB1*02%3A01` et revient intact ; un lien entièrement encodé
  (`%2A%3A`) est aussi accepté. Testé dans `graph-url.test.ts`, y compris
  avec `&`, `+`, `%`, `#`.
- **Profondeur** 1 / 2 / 3 (dans l'URL), **filtres** par niveau de signal et
  par catégorie (pastilles avec compteurs, repliées derrière un bouton
  « Filtres » sous `lg`).
- **Troncature** : dès la profondeur 2, le voisinage atteint le plafond de
  150 nœuds ; un encart « Voisinage tronqué à 150 nœuds » le dit et explique
  la règle de coupe.
- **Vue Liste** : alternative accessible (tableau allèle / complication /
  signal / articles, liens vers les fiches et vers le recentrage), mêmes
  filtres, pagination par 60.
- Zoom : molette, pincement, glisser ; boutons +, −, recadrer. Le cadrage
  initial cherche l'échelle qui fait tenir nœuds **et** étiquettes.

---

## 4. `/matrice` — heatmap allèles × complications

Fichiers : `src/app/matrice/page.tsx` (serveur), `src/lib/matrix.ts`
(mise en forme pure), `src/components/charts/MatrixHeatmap.tsx` (client).

- Données lues côté serveur par `getAssociationMatrix()` ; `toClientMatrix`
  retire `npmi` avant l'envoi au navigateur. Résolution dans l'URL :
  `/matrice` (2 chiffres, 47 lignes) ou `/matrice?resolution=4-digit`
  (97 lignes).
- **Lignes** groupées par classe puis locus (A, B, C, DRB1, DQB1, DPB1), avec
  une barre discrète du nombre de mentions de l'allèle. Tris : par locus,
  par mentions, par nombre de signaux marqués.
- **Colonnes** groupées par catégorie clinique (bandeau coloré + nom), libellés
  inclinés à 58°, liens vers la fiche complication.
- **Case** : couleur = niveau de signal ; **taille** = nombre d'articles
  (aire ~ effectif, `cellScale`) ; le faible est atténué. Trois états jamais
  confondus : **vide** (point discret : jamais co-mentionnés), **filtrée**
  (contour pointillé : existe mais niveau décoché), **visible**.
- En-têtes **collants** (ligne et colonne) dans un conteneur à défilement
  propre (`isolate`, défilement horizontal sur mobile).
- **Survol / focus** : infobulle (allèle, complication, catégorie, niveau en
  toutes lettres, « N articles mentionnent les deux termes », mentions
  niées) et mise en évidence de la ligne et de la colonne par une règle CSS
  (les ~2 000 cases ne sont pas re-rendues).
- **Clic** → fiche de l'allèle (aucune ancre par association n'existe sur la
  fiche ; la carte de la complication y est regroupée par catégorie).
- Option « Masquer les allèles sans case visible ».

---

## 5. `/carte-v1` — la carte réelle de l'étude antérieure

Fichiers : `src/app/carte-v1/page.tsx` (serveur), `src/lib/legacy-map.ts`
(chargement et normalisation, testé), `src/components/LegacyMapClient.tsx`,
`src/components/LegacyMapExplorer.tsx`.

- `data/legacy/carte_v1_renal.json` est **importé à la construction** (import
  statique côté serveur) : 80 nœuds (53 HLA, 27 complications), 125 liens
  pondérés par le nombre de PMID uniques.
- **Encadré de cadrage** : données réelles du dépôt
  `GrosBiceps/Renal-HLA-Bibliometric` (le bandeau synthétique ne concerne pas
  cette page), comptes bruts sans test statistique, libellés non normalisés
  (« HLA-*A23 » sérologique, doublon « TMA » / « thrombotic
  microangiopathy »), ni PMID ni phrases sources, co-occurrence ≠
  association clinique.
- **Réseau** : même `NetworkView` que le graphe. Positions = disposition
  **Gephi d'origine** (axe y inversé), avec une légère compression radiale
  (`compressRadially`, angles conservés) pour que deux nœuds excentrés
  n'écrasent pas le cœur du réseau, puis desserrage anti-chevauchement
  (`relaxPositions`).
- Les liens sont tracés à l'**encre neutre** (`CHART_NEUTRALS`), épaisseur
  selon le compte (1, 2, 3 PMID) : **jamais** les couleurs de l'échelle de
  signal, qui feraient croire à une analyse que cette carte ne porte pas.
- Ajouts **indicatifs**, signalés comme tels : classe HLA déduite du libellé,
  regroupement des complications dans les catégories du site (5 restent
  « hors catégories »), traduction française à côté du libellé d'origine.
  Les libellés sérologiques ont un contour pointillé.
- Recherche (libellé d'origine ou traduction) qui met en évidence les nœuds
  trouvés ; filtre « ≥ 2 PMID » ; panneau des partenaires d'un nœud.
- **Tableau des paires** (rendu serveur, alternative accessible) : les 12
  paires à ≥ 2 PMID, puis les 125 dans un dépliant. 113 liens reposent sur
  un seul article : la page le dit.

---

## 6. Composants réutilisables (`src/components/charts/`)

| Composant | Type | Rôle |
|---|---|---|
| `NetworkView` | client | Réseau SVG générique : zoom/déplacement, survol des voisins, sélection/activation, étiquettes sans chevauchement, clavier, infobulle fournie par l'appelant |
| `MatrixHeatmap` | client | Heatmap de la matrice (tri, filtre, infobulle, en-têtes collants) |
| `FilterChips` | client | Filtre multiple en pastilles `aria-pressed` avec compteur ; une pastille décochée reste visible, barrée |
| `Legend`, `LegendGroup`, `LegendItem` | serveur | Structure de légende (pastille + libellé) |
| `NodeSwatch`, `EdgeSwatch` | serveur | Pastille de nœud (cercle/carré, anneau, pointillé), échantillon de lien |
| `SignalSwatch`, `CellSizeScale` | serveur | Niveau de signal sous forme de trait ou de case ; échelle des tailles de case |
| `SignalScale`, `CategoryScale` | serveur | Ruban ordinal faible → fort avec l'inverse à part ; liste des catégories |

Logique pure et testée : `src/lib/network-layout.ts`, `src/lib/graph-view.ts`,
`src/lib/graph-url.ts`, `src/lib/matrix.ts`, `src/lib/legacy-map.ts`,
`src/lib/viz-encoding.ts` — tests `graph-view`, `graph-url`, `matrix`,
`legacy-map` dans `src/__tests__/`.

---

## 7. Points ouverts

- `favicon.ico` absent (404 dans la console sur toutes les pages) — relève
  de la coquille partagée.
- À la profondeur 2 depuis un allèle, ~150 liens marqués relient
  complications et allèles lointains : la vue reste dense ; le survol et les
  filtres sont le mode de lecture prévu. Un regroupement d'arêtes (edge
  bundling) serait la prochaine étape si le corpus réel est plus dense.
- La matrice renvoie vers la fiche allèle entière : une ancre par
  complication sur la fiche permettrait un lien profond vers la paire.
