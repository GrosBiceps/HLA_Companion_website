# Sérotypes HLA — table de correspondance et recherche

Le site relie deux notations de la même réalité :

- l'**allèle** (séquence d'ADN, nomenclature IPD-IMGT/HLA) : `HLA-DRB1*15`
  (groupe, « 2-digit »), `HLA-DRB1*15:01` (protéine, « 4-digit ») ;
- le **sérotype** (spécificité reconnue par des anticorps, typage
  sérologique historique) : `DR15`, `B27`, `Cw7`, `DQ2`.

Plusieurs allèles partagent un sérotype, et un groupe peut se répartir entre
plusieurs sérotypes (`DRB1*03:01` est DR17, `DRB1*03:02` est DR18). Les études
anciennes — dont la carte v1 de l'étude antérieure — écrivent en sérologie ;
les récentes en moléculaire. Le site permet de passer de l'une à l'autre.

## Origine de la table

`data/reference/hla_serotypes.csv` — 131 spécificités (loci A, B, C, DR, DQ, DP) :

| colonne | sens |
|---|---|
| `serotype_id` | clé de route et d'affichage (`DR15`, `Cw7`, `DPw4`) |
| `locus` | locus sérologique : A, B, C, DR, DQ, DP |
| `label` | libellé affiché |
| `broad_serotype` | famille large parente (`DR15` → `DR2`, `A24` → `A9`, `B51` → `B5`) |
| `kind` | `specific`, `broad` (famille large), `associated` (DR51/52/53), `cellular` (DPw) |
| `alleles` | allèles séparés par `;`, sans `HLA-` : `B*27` (tout le groupe) ou `DRB1*03:01` (un allèle) |
| `note` | commentaire libre |

> **Approximation pédagogique.** Cette table a été écrite à la main à partir
> des correspondances OMS usuelles. Elle n'est **pas** exhaustive (seuls les
> allèles courants sont cités quand un groupe se répartit entre plusieurs
> sérotypes, p. ex. B62/B63/B75) et n'a pas été relue contre la source de
> référence. Elle doit être remplacée par le fichier officiel dès l'arrivée
> des données réelles. Ce n'est **pas** un résultat du corpus ; les effectifs
> d'articles affichés à côté, eux, le sont.

## Remplacer par le fichier officiel IPD-IMGT/HLA

IPD-IMGT/HLA publie `rel_dna_ser.txt` (dépôt `ANHIG/IMGTHLA`, dossier
`wmda/` pour la version OMS : `rel_dna_ser.txt`, `hla_nom_p.txt`). Procédure :

1. Télécharger `wmda/rel_dna_ser.txt` (colonnes : locus, allèle, sérotype
   « non ambigu », « probable », « possible », « supposé »).
2. Écrire un convertisseur vers le format ci-dessus : une ligne par
   sérotype, `alleles` = allèles à la résolution de la source (4-digit,
   éventuellement regroupés en 2-digit quand tous les allèles du groupe
   portent le sérotype), `broad_serotype` tiré de `hla_nom_p`/de la liste
   OMS des familles larges. Ne garder que les correspondances « non
   ambiguës » pour un premier jet.
3. Remplacer `hla_serotypes.csv`, puis `python scripts/build_sqlite.py`. Le
   builder valide le format (V9) et **projette** la table sur le vocabulaire du
   corpus : un allèle absent du corpus est écarté, un sérotype sans aucun
   allèle retenu aussi (V10 : jamais de lien orphelin). `--strict-serotypes`
   transforme tout allèle absent en erreur.
4. Vérifier `scripts/tests/test_serotypes.py` et `src/__tests__/serotypes.test.ts`
   (étiquettes de la carte v1 résolues, DR17/DR18, DQ8…).

## Tables SQLite

- `serotypes(serotype_id, locus, label, broad_serotype, kind, note)`
- `serotype_alleles(serotype_id, hla, via)` — `via` : `direct` (listé), `group`
  (4-digit hérité d'un groupe listé), `narrow` (hérité d'une spécificité plus
  fine : une famille large est l'**union** de ses spécificités).

Index FTS : une ligne `serotype` par spécificité, et le contenu des allèles
inclut leurs sérotypes.

## Recherche unifiée (palette `Ctrl+K`, accueil, `/api/search?q=`)

Insensible à la casse, aux espaces et séparateurs ; `*` et `:` facultatifs.

| saisie | résultat |
|---|---|
| `A*02`, `a02`, `HLA-A*02`, `A 02` | groupe 2-digit `HLA-A*02` + ses 4-digit les plus cités + sérotype A2 |
| `DQB1*02:01`, `DQB1 02 01`, `dqb10201` | l'allèle 4-digit, son groupe parent, son sérotype (DQ2) |
| `A*02:0` | les 4-digit du groupe dont le 2ᵉ champ commence par `0` |
| `DR15`, `DR 15`, `dr-15` | sérotype DR15 + ses allèles (2-digit et 4-digit) |
| `A2`, `B27`, `DQ2`, `Cw7`, `C7`, `DP4` | sérotype en tête, puis l'allèle correspondant (`A2` = sérotype A2 **et** groupe A*02) |
| `DR2`, `B5` | famille large + ses spécificités plus fines |
| `DRB1`, `dq` | locus (et groupes les plus cités), ou loci/sérotypes dont le nom commence ainsi |

Les résultats sont groupés par type (Allèle, Sérotype, Complication, Article,
Auteur) avec un badge de résolution (`Locus`, `2-digit`, `4-digit`,
`Sérotype`, `Famille large`). Le groupe Sérotype passe en tête quand la
saisie est une graphie de sérotype sans ambiguïté. Un sérotype saisi en
entier ne ramène pas ses voisins par préfixe (`A2` ≠ A23, A24…).

Même logique côté filtres : `/allele` (filtre allèle **ou** sérotype) et
`/serotype` (filtre sérotype **ou** allèle).

## Pages

- `/serotype` — index par locus, familles larges regroupant leurs spécificités.
- `/serotype/DR15` — alèles du sérotype (groupes et 4-digit, liés à leurs
  fiches, avec articles et ▲), effectifs d'articles par complication
  (descriptifs, **sans statistique au niveau du sérotype**), fil d'Ariane,
  lien vers le graphe. Une graphie approchée (`/serotype/dr15`) redirige.
- `/allele/<hla>` — badges de sérotype ; navigation 2-digit ↔ 4-digit.
