"""Generateur de donnees synthetiques pour le compagnon bibliometrique HLA.

Les donnees produites sont FICTIVES. Elles respectent le contrat de schema du
vrai pipeline (cf. scripts/schema.sql) pour que toute l'interface puisse etre
developpee et testee sans acces aux donnees reelles, mais elles ne doivent
JAMAIS etre presentees comme des resultats : un bandeau les signale partout.

Les noms d'auteurs sont des patronymes courants combines a des initiales
tirees au hasard : ils ne designent personne, et aucun article fictif n'est
attribue a un chercheur reel identifiable.

Proprietes garanties par construction (les tests en dependent) :

* Determinisme : a seed fixee, les CSV sont identiques octet pour octet.
  Toute l'alea passe par une instance locale `random.Random(seed)` ; le module
  `random` global n'est jamais utilise.
* Les spans sont des sous-chaines litterales de leur phrase : l'UI surligne par
  recherche de sous-chaine, une violation casserait la vue la plus importante.
* Les `associations` sont AGREGEES a partir des `pair_mentions` reellement
  emis, jamais tirees independamment : la validation V3 du builder verifie
  `associations.n_cooccurrence == COUNT(pair_mentions)` pour chaque paire.

MODELE GENERATIF — un article = un ensemble d'entites, pas une liste de paires
------------------------------------------------------------------------------
Chaque article retient un petit ensemble d'alleles H et de complications O,
puis emet une mention pour CHAQUE paire de H x O (produit cartesien). C'est ce
qui donne un sens a la table de contingence : deux entites presentes dans le
meme article y sont toujours comptees comme co-occurrentes. (L'ancien modele
tirait des paires isolees ; deux entites d'un meme article mais de paires
differentes n'etaient pas comptees ensemble, ce qui deprimait mecaniquement
tous les NPMI.)

    * une paire « principale » est tiree selon pop(h) x pop(o) x enrichissement ;
    * 0 a 2 alleles et 0 a 2 complications « secondaires » sont tires selon
      leur seule popularite (independants de la paire principale) ;
    * un allele 4-digit entraine souvent son parent 2-digit (et inversement) :
      c'est ainsi que la litterature les cite.

Sous ce modele, une paire SANS enrichissement est proche de l'independance
(npmi ~ 0, niveau `weak`) ; une paire enrichie devient `clear` ou `strong` ;
les popularites varient avec les annees (le typage haute resolution, les
eplets, les DSA et l'ABMR montent ; le rejet aigu decline), ce qui produit
aussi quelques associations de « mode de publication » — exactement ce que le
cadrage epistemique du site met en garde de ne pas lire comme de la clinique.

CONTRAT STATISTIQUE — table de contingence unique et reconstructible
--------------------------------------------------------------------
Toutes les metriques d'une ligne (`pmi`, `npmi`, `log_odds`, `odds_ratio`,
`or_ci_low/high`, `pval_fisher`, `pval_two_sided` et les FDR) sont calculees
sur UNE SEULE table 2x2, construite ainsi a partir des colonnes publiees :

    a = min(n_cooccurrence, n_hla_total, n_outcome_total)
    b = n_hla_total - a
    c = n_outcome_total - a
    d = n_universe - a - b - c          # la table somme a n_universe

Consequences, toutes verifiees par les tests :

* Aucune metrique ne peut en contredire une autre. En particulier `npmi > 0`
  equivaut a `odds_ratio > 1` : une ligne ne peut pas se declarer a la fois
  fortement co-citee et fortement protectrice.
* `npmi`, `odds_ratio` et `pval_fisher` sont RECONSTRUCTIBLES : un
  consommateur qui refait le calcul depuis `n_cooccurrence`, `n_hla_total`,
  `n_outcome_total` et `n_universe` retrouve exactement les valeurs du
  fichier. (`pval_two_sided` aussi, SAUF sous `INVERSE_MIN_N` co-occurrences
  ou elle est censuree a 1.0 — cf. ci-dessous.)
* Le signal inverse est DELIBERE mais produit en amont, par les comptages
  (cf. `_build_model`) : un HLA tres present dans le corpus, et une
  complication tres presente, que les articles evitent de citer ensemble.
  Il n'est jamais fabrique en gonflant la table apres coup.
* Sous `INVERSE_MIN_N` co-occurrences, aucune conclusion de depletion n'est
  publiee (`pval_two_sided = 1.0`) : une paire vue une ou deux fois ne peut
  pas decrocher le badge "signal inverse".

REGIMES DE TAILLE (seuils `SMALL_CORPUS` et `RARE_PAIRS_MIN_ARTICLES`)
---------------------------------------------------------------------
* Sous 300 articles (suites de tests), le test de Fisher manque de
  puissance : pour qu'un signal inverse reste demontrable, deux paires
  protectrices sont portees par des « porteurs » tres frequents
  (cf. `CARRIER_RATES`).
* A partir de 300, les douze paires protectrices de `INVERSE_PAIRS` sont
  planifiees, avec un portage modeste ; elles ne deviennent significatives
  qu'a partir de ~1 000 articles.
* A partir de 1 500, les alleles rares (`MODERATE_PAIRS`,
  `RARE_CLEAR_PAIRS`) recoivent leurs articles reserves : ce sont eux qui
  peuplent les niveaux `moderate` et une partie des `clear`.

Ces nombres restent FICTIFS et ne sont pas comparables aux sorties du vrai
pipeline : ils sont seulement internement coherents.

Usage :
    python scripts/gen_synthetic.py --out data/synthetic --n-articles 4000 --seed 42
"""

import argparse
import bisect
import csv
import math
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from random import Random

sys.path.insert(0, str(Path(__file__).resolve().parent))

from labels import OUTCOME_LABELS

# =====================================================================
# CONSTANTES DE DOMAINE
# =====================================================================

YEAR_MIN = 1990
YEAR_MAX = 2026

DEFAULT_N_ARTICLES = 4000

# Sous ce seuil, regime « petit corpus » (cf. docstring du module).
SMALL_CORPUS = 300

# Croissance annuelle de la litterature (~7 %/an) ; l'annee en cours n'est
# que partiellement indexee.
YEAR_GROWTH = 0.07
CURRENT_YEAR_FRACTION = 0.6

# (titre, abreviation, poids, premiere annee de parution dans le corpus)
JOURNALS = [
    ("American Journal of Transplantation", "Am J Transplant", 10, 2001),
    ("Transplantation", "Transplantation", 10, 1990),
    ("Nephrology Dialysis Transplantation", "Nephrol Dial Transplant", 6, 1990),
    ("HLA", "HLA", 6, 2016),
    ("Tissue Antigens", "Tissue Antigens", 6, 1990),
    ("Human Immunology", "Hum Immunol", 7, 1990),
    ("Kidney International", "Kidney Int", 5, 1990),
    ("Journal of the American Society of Nephrology", "J Am Soc Nephrol", 5, 1990),
    ("Clinical Transplantation", "Clin Transplant", 5, 1990),
    ("Transplant International", "Transpl Int", 5, 1990),
    ("Transplant Immunology", "Transpl Immunol", 4, 1993),
    ("Transplantation Proceedings", "Transplant Proc", 6, 1990),
    ("Frontiers in Immunology", "Front Immunol", 4, 2010),
    ("Clinical Journal of the American Society of Nephrology", "Clin J Am Soc Nephrol", 3, 2006),
    ("Kidney International Reports", "Kidney Int Rep", 2, 2016),
    ("Pediatric Transplantation", "Pediatr Transplant", 2, 1997),
    ("Transplantation Direct", "Transplant Direct", 2, 2015),
    ("International Journal of Immunogenetics", "Int J Immunogenet", 3, 2005),
    ("BMC Nephrology", "BMC Nephrol", 2, 2000),
    ("PLoS One", "PLoS One", 3, 2006),
    ("Scientific Reports", "Sci Rep", 2, 2011),
    ("Journal of Clinical Medicine", "J Clin Med", 2, 2012),
    ("American Journal of Kidney Diseases", "Am J Kidney Dis", 3, 1990),
    ("Transplant Infectious Disease", "Transpl Infect Dis", 2, 1999),
    ("Immunogenetics", "Immunogenetics", 2, 1990),
]

# (pays, poids, premiere annee d'activite des equipes, patronymes courants)
# Patronymes volontairement communs : ils ne designent personne.
COUNTRY_PROFILES = [
    ("United States", 18, 1985, [
        "Smith", "Johnson", "Brown", "Miller", "Davis", "Wilson", "Moore",
        "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Clark",
        "Lewis", "Walker", "Young", "Allen", "Wright", "Scott", "Baker"]),
    ("France", 10, 1985, [
        "Martin", "Bernard", "Petit", "Durand", "Leroy", "Moreau", "Simon",
        "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand",
        "Roux", "Vincent", "Fournier", "Girard", "Bonnet", "Mercier", "Blanc"]),
    ("China", 9, 2002, [
        "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu",
        "Zhou", "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Lin"]),
    ("United Kingdom", 7, 1985, [
        "Jones", "Williams", "Evans", "Roberts", "Hughes", "Edwards", "Green",
        "Hall", "Wood", "Turner", "Hill", "Cooper", "Ward", "Morris"]),
    ("Germany", 7, 1985, [
        "Mueller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer",
        "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Klein",
        "Wolf"]),
    ("Italy", 6, 1988, [
        "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano",
        "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo"]),
    ("Japan", 6, 1988, [
        "Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito",
        "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada"]),
    ("Netherlands", 5, 1985, [
        "de Jong", "Jansen", "de Vries", "van den Berg", "van Dijk", "Bakker",
        "Visser", "Smit", "Meijer", "de Boer", "Mulder", "Bos"]),
    ("Spain", 5, 1990, [
        "Fernandez", "Gonzalez", "Rodriguez", "Lopez", "Martinez", "Sanchez",
        "Perez", "Gomez", "Ruiz", "Diaz", "Moreno", "Alvarez"]),
    ("Canada", 5, 1988, [
        "Tremblay", "Gagnon", "Roy", "Cote", "Bouchard", "Gauthier",
        "Morin", "Lavoie", "Fortin", "Gagne", "MacDonald", "Campbell"]),
    ("Australia", 4, 1990, [
        "Kelly", "Murphy", "Ryan", "O'Brien", "Walsh", "Mitchell", "King",
        "Robinson", "Thompson", "Lee"]),
    ("South Korea", 4, 2004, [
        "Kim", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim",
        "Han"]),
    ("Brazil", 4, 2000, [
        "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa",
        "Rodrigues", "Almeida", "Nascimento", "Lima"]),
    ("Belgium", 3, 1990, [
        "Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems",
        "Claes", "Goossens"]),
    ("Switzerland", 3, 1990, [
        "Mueller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Steiner",
        "Gerber"]),
    ("India", 3, 2006, [
        "Sharma", "Kumar", "Singh", "Gupta", "Patel", "Reddy", "Rao",
        "Iyer", "Nair", "Joshi"]),
    ("Iran", 3, 2006, [
        "Hosseini", "Mohammadi", "Ahmadi", "Rezaei", "Karimi", "Moradi",
        "Rahimi", "Jafari"]),
    ("Turkey", 3, 2002, [
        "Yilmaz", "Kaya", "Demir", "Sahin", "Celik", "Yildiz", "Aydin",
        "Ozturk"]),
    ("Sweden", 2, 1988, [
        "Andersson", "Johansson", "Karlsson", "Nilsson", "Eriksson",
        "Larsson", "Olsson", "Persson"]),
    ("Poland", 2, 1998, [
        "Nowak", "Kowalski", "Wisniewski", "Wojcik", "Kowalczyk",
        "Kaminski", "Lewandowski", "Zielinski"]),
]

GIVEN_INITIALS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M",
                  "N", "P", "R", "S", "T", "V", "Y"]

TITLE_OPENERS = [
    "Impact of {hla} on {outcome} after kidney transplantation",
    "{hla} and the risk of {outcome} in renal transplant recipients",
    "Association between {hla} mismatch and {outcome}: a cohort study",
    "{outcome} in kidney transplantation: the role of {hla}",
    "Long-term outcomes of {hla}-mismatched kidney transplantation: focus on {outcome}",
    "Revisiting {hla} as a predictor of {outcome} in renal allograft recipients",
    "Eplet-level {hla} matching and {outcome} after renal transplantation",
    "A single-center analysis of {hla} and {outcome} in kidney transplant recipients",
    "{hla} typing and {outcome}: a registry-based analysis",
    "Donor {hla} and recipient {outcome} after deceased-donor kidney transplantation",
    "Is {hla} a marker of {outcome} in kidney transplantation? A multicenter study",
    "{outcome} and {hla} in pediatric kidney transplant recipients",
    "High-resolution {hla} typing refines the assessment of {outcome}",
    "{hla} in living-donor kidney transplantation: incidence of {outcome}",
    "Ten-year follow-up of {outcome} according to {hla} status",
    "{hla} and {outcome}: a systematic review and meta-analysis",
]

ABSTRACT_BACKGROUND = [
    "The contribution of HLA compatibility to long-term renal allograft outcome remains debated.",
    "Donor-specific alloimmunity is a leading cause of late kidney allograft failure.",
    "Molecular-level HLA matching has been proposed to refine immunological risk stratification.",
    "Risk stratification at transplantation still relies largely on antigen-level HLA matching.",
    "Infectious and malignant complications remain frequent after kidney transplantation.",
    "The relationship between recipient HLA genotype and post-transplant complications is poorly characterized.",
    "Solid-phase antibody assays have transformed the monitoring of transplant recipients.",
    "Recurrence of the native kidney disease is an under-recognized cause of graft loss.",
]

ABSTRACT_METHODS = [
    "We retrospectively analyzed a single-center cohort of consecutive kidney transplant recipients.",
    "Recipients transplanted over a ten-year period were included and followed prospectively.",
    "High-resolution HLA typing was imputed from antigen-level data for donor-recipient pairs.",
    "Multivariable Cox regression was used to adjust for recipient age, sex and induction therapy.",
    "Data were extracted from a national transplant registry.",
    "Single-antigen bead assays were performed at transplantation and yearly thereafter.",
    "Eplet mismatches were computed with HLAMatchmaker.",
    "Protocol and for-cause biopsies were graded according to the Banff classification.",
]

ABSTRACT_RESULTS = [
    "Baseline characteristics were comparable between the exposed and unexposed groups.",
    "Median follow-up was 7.4 years after transplantation.",
    "Protocol biopsies were available for a subset of the cohort.",
    "Sensitivity analyses excluding retransplant recipients gave consistent estimates.",
    "A total of {n} recipients were included in the analysis.",
    "Event rates differed markedly between transplant eras.",
    "Results were consistent across deceased and living donor subgroups.",
    "Missing typing data were handled by multiple imputation.",
]

ABSTRACT_CONCLUSION = [
    "These findings support incorporating molecular HLA compatibility into allocation algorithms.",
    "Prospective validation in an independent cohort is required before clinical implementation.",
    "Our results should be interpreted with caution given the observational design.",
    "Antigen-level matching alone may be insufficient to capture immunological risk.",
    "Larger multicenter studies are needed to confirm these observations.",
    "Residual confounding cannot be excluded.",
]

# Formes de surface plausibles pour chaque outcome. La forme retenue est
# INSEREE TELLE QUELLE dans la phrase, et ressortie comme outcome_span :
# la propriete "span est une sous-chaine de la phrase" est donc structurelle.
OUTCOME_SPANS = {
    "ABMR": ["ABMR", "antibody-mediated rejection", "acute ABMR"],
    "TCMR": ["TCMR", "T cell-mediated rejection", "borderline TCMR"],
    "acute_rejection": ["acute rejection", "biopsy-proven acute rejection"],
    "chronic_rejection": ["chronic rejection", "IFTA", "interstitial fibrosis and tubular atrophy"],
    "mixed_rejection": ["mixed rejection", "mixed ABMR and TCMR"],
    "DSA": ["DSA", "de novo DSA", "donor-specific antibodies"],
    "sensitization": ["sensitization", "HLA sensitization", "broad sensitization"],
    "complement_activation": ["complement activation", "C1q-binding DSA", "C4d deposition"],
    "HLA_mismatch_outcome": ["HLA mismatch", "eplet mismatch load", "antigen mismatch"],
    "DGF": ["DGF", "delayed graft function"],
    "graft_loss": ["graft loss", "death-censored graft loss", "allograft failure"],
    "graft_survival": ["graft survival", "death-censored graft survival"],
    "eGFR": ["eGFR decline", "impaired eGFR", "reduced estimated GFR"],
    "BK_nephropathy": ["BK nephropathy", "BK virus nephropathy", "BK viremia"],
    "CMV": ["CMV infection", "CMV disease", "CMV viremia"],
    "PTLD": ["PTLD", "post-transplant lymphoproliferative disorder"],
    "skin_cancer": ["skin cancer", "cutaneous squamous cell carcinoma"],
    "NODAT": ["NODAT", "new-onset diabetes after transplantation"],
    "recurrent_GN": ["recurrent glomerulonephritis", "GN recurrence"],
    "FSGS": ["recurrent FSGS", "FSGS recurrence", "focal segmental glomerulosclerosis"],
    "IgA_nephropathy": ["IgA nephropathy", "recurrent IgA nephropathy"],
}

POSITIVE_TEMPLATES = [
    "Recipients carrying {hla} showed a higher incidence of {outcome} in this cohort.",
    "{hla} was more frequent among patients who developed {outcome}.",
    "The rate of {outcome} was increased in {hla}-positive recipients.",
    "In multivariable analysis, {hla} remained associated with {outcome}.",
    "We observed an excess of {outcome} among carriers of {hla}.",
    "Episodes of {outcome} occurred more often when the donor expressed {hla}.",
]
# (gabarit, declencheur) : le declencheur est une sous-chaine litterale du
# gabarit, donc de la phrase produite.
NEGATED_TEMPLATES = [
    ("We found no significant association between {hla} and {outcome} in this cohort.",
     "no significant"),
    ("{hla} was not associated with {outcome} after adjustment.",
     "not associated"),
    ("There was no difference in {outcome} between {hla}-positive and negative recipients.",
     "no difference"),
    ("The incidence of {outcome} did not differ according to {hla} status.",
     "did not differ"),
]
NEGATED_RATE = 0.12
# Une minorite de paires est « contestee » : majoritairement rapportee en
# negatif. Le graphe les dessine en pointille.
CONTESTED_RATE = 0.05
CONTESTED_NEGATED_RATE = 0.6

# Plancher de co-occurrence en deca duquel une paire n'est pas eligible a une
# conclusion de depletion. Certifier une association protectrice a p<0.005 sur
# une seule mention, c'est badger du bruit comme du signal : sous ce seuil, les
# p-values bilaterales sont ramenees a 1.0 (aucune conclusion), ce qui neutralise
# le badge "signal inverse" via labels.compute_signal_level.
INVERSE_MIN_N = 5

# Plancher de co-occurrence pour entrer dans la famille de tests FDR.
MIN_TEST_COOCCURRENCE = 2

# Plancher numerique des p-values : math.exp sous-deborde a 0.0 sur les tables
# tres deseequilibrees, et un -log10(p) en aval produirait alors +inf.
MIN_PVALUE = 1e-300

# =====================================================================
# HIERARCHIE HLA
# =====================================================================

CLASS_ROOTS = [("HLA-class-I", "I"), ("HLA-class-II", "II")]
CLASS_ROOTS_IDS = CLASS_ROOTS
# Vocabulaire allelique (loci, groupes 2-digit, enfants 4-digit, popularites) :
# cf. hla_vocabulary.py. Il est volontairement plus large que ce que le corpus
# finit par citer : les alleles jamais mentionnes sont elagues apres la
# generation (cf. `_prune_unmentioned`), ce qui laisse une longue traine
# d'alleles cites 1 a 5 fois.
from hla_vocabulary import ALLELE_GROUPS, LOCI  # noqa: E402

# Entites non alleliques citees par le pipeline.
SPECIAL_ENTITIES = [
    # (hla, locus, resolution, popularite)
    ("HLA-mismatch", "mismatch", "mismatch_count", 1.30),
    ("HLA-eplet", "eplet", "eplet", 0.80),
]

CLASS_OF_LOCUS = dict(LOCI)
CLASS_ROOT_OF_CLASS = {"I": "HLA-class-I", "II": "HLA-class-II"}

# L'allele vitrine du prototype : les taches ulterieures l'interrogent
# nommement et attendent une couverture genereuse (dont un signal faible).
SHOWCASE_HLA = "HLA-DQB1*02:01"


def _two_digit_key(locus, group):
    return f"HLA-{locus}*{group}"


def build_hla_entities():
    """Construit la hierarchie HLA sur 4 niveaux, acyclique par construction.

    Retourne une liste de dicts prets a ecrire, dans un ordre stable
    (racines, loci, 2-digit, 4-digit, entites speciales).
    """
    rows = []

    for root, hla_class in CLASS_ROOTS:
        rows.append({
            "hla": root, "locus": root, "hla_class": hla_class,
            "resolution": "class", "parent_hla": "",
        })

    for locus, hla_class in LOCI:
        rows.append({
            "hla": locus, "locus": locus, "hla_class": hla_class,
            "resolution": "class", "parent_hla": CLASS_ROOT_OF_CLASS[hla_class],
        })

    for locus, _ in LOCI:
        for group in ALLELE_GROUPS[locus]:
            rows.append({
                "hla": _two_digit_key(locus, group), "locus": locus,
                "hla_class": CLASS_OF_LOCUS[locus],
                "resolution": "2-digit", "parent_hla": locus,
            })

    for locus, _ in LOCI:
        for group, (_, children) in ALLELE_GROUPS[locus].items():
            two = _two_digit_key(locus, group)
            for suffix in children:
                rows.append({
                    "hla": f"{two}:{suffix}", "locus": locus,
                    "hla_class": CLASS_OF_LOCUS[locus],
                    "resolution": "4-digit", "parent_hla": two,
                })

    for hla, locus, resolution, _ in SPECIAL_ENTITIES:
        rows.append({
            "hla": hla, "locus": locus, "hla_class": "unknown",
            "resolution": resolution, "parent_hla": "",
        })

    return rows


def _prune_unmentioned(hla_rows, mentioned):
    """Elague les alleles que le corpus genere n'a jamais cites.

    Le vocabulaire candidat est large (cf. hla_vocabulary.py) ; un allele cite
    par aucun article n'existerait pas dans une sortie reelle du pipeline
    (qui n'extrait que ce qui est ecrit). On garde : les entites mentionnees,
    les ancetres d'une entite gardee (la hierarchie reste connexe), et les
    entites non alleliques. Les racines de classe sont toujours gardees.
    """
    by_id = {r["hla"]: r for r in hla_rows}
    keep = set()
    for r in hla_rows:
        if r["hla"] in mentioned or r["resolution"] in (
            "mismatch_count", "eplet",
        ):
            node = r["hla"]
            while node and node not in keep:
                keep.add(node)
                node = by_id[node]["parent_hla"]
    keep.update(h for h, _ in CLASS_ROOTS_IDS)
    return [r for r in hla_rows if r["hla"] in keep]


def _hla_popularity():
    """Popularite de citation de chaque entite mentionnable.

    Un 4-digit est cite moins souvent que son groupe 2-digit (le typage haute
    resolution est plus rare) ; le premier enfant (l'allele le plus frequent
    du groupe) en prend la plus grosse part.
    """
    pop = {}
    for locus, _ in LOCI:
        for group, (p, children) in ALLELE_GROUPS[locus].items():
            two = _two_digit_key(locus, group)
            pop[two] = p
            for rank, suffix in enumerate(children):
                share = 0.55 if rank == 0 else 0.30 / rank
                pop[f"{two}:{suffix}"] = round(p * share, 4)
    for hla, _, _, p in SPECIAL_ENTITIES:
        pop[hla] = p
    # L'allele vitrine est l'un des plus documentes du corpus.
    pop[SHOWCASE_HLA] = 0.60
    # Alleles rares des paires « moderees » : jamais tires au fond, cites
    # seulement par leurs articles reserves (cf. MODERATE_PAIRS).
    for hla, _ in MODERATE_PAIRS + RARE_CLEAR_PAIRS:
        pop[hla] = 0.0
    return pop


# Popularite des complications : DSA, ABMR et rejet dominent la litterature.
OUTCOME_POPULARITY = {
    "DSA": 1.00, "ABMR": 0.90, "acute_rejection": 0.85, "graft_loss": 0.80,
    "graft_survival": 0.70, "sensitization": 0.60, "HLA_mismatch_outcome": 0.60,
    "chronic_rejection": 0.50, "TCMR": 0.45, "CMV": 0.45, "DGF": 0.40,
    "eGFR": 0.40, "BK_nephropathy": 0.35, "complement_activation": 0.35,
    "mixed_rejection": 0.15, "PTLD": 0.13, "skin_cancer": 0.18, "NODAT": 0.13,
    "recurrent_GN": 0.18, "IgA_nephropathy": 0.14, "FSGS": 0.10,
}


def _hla_era_factor(hla, resolution, year):
    """Modulation temporelle de la popularite d'un allele."""
    if hla == "HLA-eplet":
        # HLAMatchmaker et les eplets n'entrent dans la litterature qu'au
        # milieu des annees 2000, puis s'imposent.
        if year < 2005:
            return 0.0
        return min(2.0, 0.4 + 0.12 * (year - 2005))
    if hla == "HLA-mismatch":
        return 1.3 if year < 2000 else 1.0
    if resolution == "4-digit":
        # Le typage haute resolution se generalise apres 2000.
        if year < 2000:
            return 0.35
        return min(1.4, 0.6 + 0.05 * (year - 2000))
    return 1.0


def _outcome_era_factor(outcome, year):
    """Modulation temporelle de la popularite d'une complication."""
    if outcome == "complement_activation":
        return 0.0 if year < 2004 else 1.0
    if outcome == "BK_nephropathy":
        return 0.0 if year < 1996 else 1.0
    if outcome in ("DSA", "ABMR"):
        if year < 2003:
            return 0.5
        return 1.3 if year >= 2010 else 1.0
    if outcome == "acute_rejection":
        if year < 2000:
            return 1.5
        return 0.8 if year >= 2010 else 1.0
    if outcome == "TCMR":
        return 0.4 if year < 2005 else 1.0
    return 1.0


# =====================================================================
# PAYSAGE DE SIGNAL PLANIFIE
# =====================================================================

# Paires « fortes » : enrichissement net de la paire principale.
# Inspirees des aretes les plus lourdes de la carte v1 reelle (rejet / ABMR x
# DQ2, DQ5, DQ7 ; CMV x DR1, B51 ; BK x B13, B44, DR3 ; PTLD x DQ2 ...).
STRONG_PAIRS = [
    (SHOWCASE_HLA, "DSA"),
    (SHOWCASE_HLA, "ABMR"),
    (SHOWCASE_HLA, "graft_loss"),
    ("HLA-DQB1*02", "DSA"),
    ("HLA-DRB1*03", "ABMR"),
    ("HLA-mismatch", "acute_rejection"),
    ("HLA-eplet", "DSA"),
    ("HLA-DRB1*15", "IgA_nephropathy"),
    ("HLA-B*08", "sensitization"),
    ("HLA-A*02", "CMV"),
    ("HLA-DQB1*05", "ABMR"),
    ("HLA-DQB1*03:01", "TCMR"),
    ("HLA-DRB1*01", "CMV"),
    ("HLA-B*51", "CMV"),
    ("HLA-B*44", "BK_nephropathy"),
    ("HLA-DRB1*11", "recurrent_GN"),
    ("HLA-mismatch", "graft_survival"),
    ("HLA-eplet", "ABMR"),
]

# Paires « nettes » : enrichissement modere, attendues en `clear`/`strong`
# selon leur effectif.
CLEAR_PAIRS = [
    ("HLA-B*13", "BK_nephropathy"),
    ("HLA-DRB1*03", "BK_nephropathy"),
    ("HLA-DQB1*02", "PTLD"),
    ("HLA-B*55:01", "PTLD"),
    ("HLA-B*18", "skin_cancer"),
    ("HLA-A*11", "eGFR"),
    ("HLA-A*31", "CMV"),
    ("HLA-B*39", "NODAT"),
    ("HLA-A*33", "NODAT"),
    ("HLA-B*46", "recurrent_GN"),
    ("HLA-A*68", "recurrent_GN"),
    ("HLA-C*03", "chronic_rejection"),
    ("HLA-C*07", "TCMR"),
    ("HLA-DRB1*15", "ABMR"),
    ("HLA-DRB1*07", "FSGS"),
    ("HLA-DQB1*06:02", "complement_activation"),
    ("HLA-DQB1*06", "chronic_rejection"),
    ("HLA-DPB1*04:01", "sensitization"),
    ("HLA-B*27:05", "IgA_nephropathy"),
    ("HLA-A*24:02", "DGF"),
    ("HLA-B*35", "CMV"),
    ("HLA-DRB1*04:01", "NODAT"),
    ("HLA-DRB1*13", "mixed_rejection"),
    ("HLA-A*01:01", "skin_cancer"),
    ("HLA-B*57:01", "eGFR"),
    ("HLA-B*58:01", "eGFR"),
    ("HLA-C*06:02", "skin_cancer"),
    ("HLA-DQB1*03:02", "NODAT"),
    ("HLA-B*07:02", "complement_activation"),
    ("HLA-A*03", "HLA_mismatch_outcome"),
]

# En plus des paires nettes nommees ci-dessus, `RANDOM_CLEAR_PAIRS` paires
# tirees au hasard (a seed fixee) recoivent une co-citation modeste : la
# litterature reelle compte bien plus de signaux modestes que de vedettes.
RANDOM_CLEAR_PAIRS = 160

# Les paires modestes tirees au hasard ne portent que sur des alleles assez
# cites pour que la co-citation soit observable (pas sur la longue traine).
RANDOM_CLEAR_MIN_POP = 0.03

# Paires vitrine a signal faible : l'UI doit pouvoir montrer un "weak"
# sur la fiche de l'allele vedette. Aucun enrichissement : independance.
WEAK_PAIRS = [
    (SHOWCASE_HLA, "NODAT"),
    (SHOWCASE_HLA, "skin_cancer"),
    (SHOWCASE_HLA, "BK_nephropathy"),
]

# Paires « moderees » : un allele RARE (absent du tirage de fond, cite par
# deux articles seulement, tous deux sur la meme complication rare). Deux
# co-occurrences suffisent a un FDR < 0.05 quand l'attendu est quasi nul :
# c'est exactement le niveau `moderate` (significatif, effectif < 3).
MODERATE_PAIRS = [
    ("HLA-A*25:14", "FSGS"),
    ("HLA-C*17:01", "PTLD"),
    ("HLA-B*15:11", "NODAT"),
    ("HLA-DRB1*01:02", "IgA_nephropathy"),
    ("HLA-A*02:11", "mixed_rejection"),
    ("HLA-B*35:08", "FSGS"),
    ("HLA-DRB1*04:05", "NODAT"),
    ("HLA-B*40:02", "mixed_rejection"),
    ("HLA-DQB1*03:03", "FSGS"),
    ("HLA-C*14:02", "PTLD"),
    ("HLA-A*33:03", "PTLD"),
    ("HLA-DPB1*04:02", "IgA_nephropathy"),
]
MODERATE_COUNT = 2

# Meme mecanisme pour le niveau `clear` (significatif, 3 a 9 co-occurrences) :
# des alleles rares cites par une poignee d'articles (3 a 6), tous sur la meme
# complication. Un allele frequent n'y parviendrait pas : son attendu sous
# independance est deja de plusieurs co-occurrences.
RARE_CLEAR_PAIRS = [
    ("HLA-A*02:17", "DSA"),
    ("HLA-A*24:03", "BK_nephropathy"),
    ("HLA-B*07:05", "chronic_rejection"),
    ("HLA-B*15:17", "CMV"),
    ("HLA-B*27:04", "TCMR"),
    ("HLA-B*44:05", "DGF"),
    ("HLA-B*51:08", "eGFR"),
    ("HLA-C*07:04", "complement_activation"),
    ("HLA-DRB1*03:02", "recurrent_GN"),
    ("HLA-DRB1*11:03", "graft_loss"),
    ("HLA-DRB1*13:03", "ABMR"),
    ("HLA-DQB1*06:09", "sensitization"),
    ("HLA-A*68:03", "skin_cancer"),
    ("HLA-A*11:03", "HLA_mismatch_outcome"),
    ("HLA-DQB1*05:03", "acute_rejection"),
    ("HLA-B*35:05", "graft_survival"),
]
RARE_CLEAR_COUNT = (3, 6)
RARE_PAIRS_MIN_ARTICLES = 1500

# Part des paires de fond recevant un enrichissement non planifie.
UNPLANNED_ENRICH_RATE = 0.10

# Paires protectrices : demonstration du badge "signal inverse". Les deux
# premieres servent aussi au regime « petit corpus ».
INVERSE_PAIRS = [
    ("HLA-DRB1*04", "acute_rejection"),
    ("HLA-A*01", "graft_loss"),
    ("HLA-A*02", "ABMR"),
    ("HLA-DPB1*04", "graft_survival"),
    ("HLA-DRB1*15", "graft_loss"),
    ("HLA-B*07", "DSA"),
    ("HLA-DRB1*11", "acute_rejection"),
    ("HLA-B*44", "ABMR"),
    ("HLA-DQB1*03", "DSA"),
    ("HLA-DQB1*06", "acute_rejection"),
    ("HLA-A*24", "ABMR"),
    ("HLA-B*35", "graft_loss"),
]
SMALL_CORPUS_INVERSE = 2

# Taux de « portage » des paires protectrices : probabilite qu'un article
# cite l'allele (resp. la complication) d'une paire protectrice en plus de
# son contenu propre. Necessaire en petit corpus pour donner de la puissance
# au test bilateral ; modeste en grand corpus.
CARRIER_RATES = {
    "small": (0.30, 0.70),
    "large": (0.05, 0.0),
}

# Probabilite d'ecarter une co-citation protectrice hors quota : 1.0 en petit
# corpus (comptage exact), un peu moins en grand corpus (comptages varies).
INVERSE_REJECTION = {"small": 1.0, "large": 0.97}


# =====================================================================
# STATISTIQUES (stdlib uniquement)
# =====================================================================

def _log_comb(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def _hypergeom_pmf(a, row1, row2, col1):
    """P(X = a) pour la loi hypergeometrique de la table 2x2.

    row1 = a+b, row2 = c+d, col1 = a+c, total = row1+row2.
    """
    total = row1 + row2
    b = row1 - a
    c = col1 - a
    d = row2 - c
    if min(a, b, c, d) < 0:
        return 0.0
    return math.exp(
        _log_comb(row1, a) + _log_comb(row2, c) - _log_comb(total, col1)
    )


def fisher_exact(a, b, c, d):
    """Test exact de Fisher sur la table [[a, b], [c, d]].

    Retourne (p_greater, p_two_sided). Le pipeline reel utilise le test
    unilateral 'greater' ; on fournit aussi le bilateral, seul capable de
    rendre visible une depletion (OR < 1) — cf. labels.compute_signal_level.
    """
    row1, row2, col1 = a + b, c + d, a + c
    lo = max(0, col1 - row2)
    hi = min(row1, col1)

    probs = {k: _hypergeom_pmf(k, row1, row2, col1) for k in range(lo, hi + 1)}
    total = sum(probs.values())
    if total <= 0:
        return 1.0, 1.0

    p_greater = sum(p for k, p in probs.items() if k >= a) / total

    # Bilateral par la methode des densites (comme scipy.stats.fisher_exact).
    p_obs = probs[a] * (1 + 1e-9)
    p_two = sum(p for p in probs.values() if p <= p_obs) / total

    # Clampe a MIN_PVALUE : math.exp sous-deborde a 0.0 sur les tables tres
    # deseequilibrees, et -log10(0) vaudrait +inf cote consommateur.
    return (
        min(1.0, max(MIN_PVALUE, p_greater)),
        min(1.0, max(MIN_PVALUE, p_two)),
    )


def _format_pvalue(p):
    """Formate une p-value/FDR a 6 chiffres significatifs.

    Preserve les tres petites valeurs (2e-17 reste 2e-17) la ou un
    `round(p, 8)` les ecraserait a 0.0. Le resultat est un float, donc le
    module csv l'ecrit de facon reproductible.
    """
    p = min(1.0, max(MIN_PVALUE, float(p)))
    return float(f"{p:.6g}")


def benjamini_hochberg(pvals):
    """Correction FDR de Benjamini-Hochberg, monotone, valeurs dans [0,1]."""
    n = len(pvals)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: (pvals[i], i))
    adjusted = [0.0] * n
    running = 1.0
    for rank, idx in enumerate(reversed(order), start=1):
        i = n - rank + 1  # rang 1-based dans l'ordre croissant
        value = pvals[idx] * n / i
        running = min(running, value)
        adjusted[idx] = min(1.0, max(0.0, running))
    return adjusted


def pmi_npmi(n_ab, n_a, n_b, n_universe):
    """PMI et PMI normalisee (Bouma). npmi est borne dans [-1, 1]."""
    if n_ab <= 0 or n_a <= 0 or n_b <= 0 or n_universe <= 0:
        return 0.0, 0.0
    p_ab = n_ab / n_universe
    p_a = n_a / n_universe
    p_b = n_b / n_universe
    pmi = math.log(p_ab / (p_a * p_b))
    denom = -math.log(p_ab)
    if denom == 0:
        npmi = 0.0
    else:
        npmi = pmi / denom
    return pmi, min(1.0, max(-1.0, npmi))


def odds_ratio_with_ci(a, b, c, d):
    """OR de Haldane-Anscombe (correction +0.5) et IC 95 % de Woolf."""
    a_, b_, c_, d_ = a + 0.5, b + 0.5, c + 0.5, d + 0.5
    orr = (a_ * d_) / (b_ * c_)
    log_or = math.log(orr)
    se = math.sqrt(1 / a_ + 1 / b_ + 1 / c_ + 1 / d_)
    return orr, log_or, math.exp(log_or - 1.96 * se), math.exp(log_or + 1.96 * se)


# =====================================================================
# GENERATION
# =====================================================================

class _Cumulative:
    """Tirage pondere avec remise en O(log n), deterministe pour un rng donne.

    Les elements de poids nul ne peuvent jamais sortir : `bisect_right` saute
    les intervalles de largeur nulle.
    """

    def __init__(self, items, weights):
        self.items = list(items)
        self.cum = []
        acc = 0.0
        for w in weights:
            acc += max(0.0, w)
            self.cum.append(acc)
        self.total = acc

    def pick(self, rng):
        if self.total <= 0:
            raise ValueError("aucun element de poids positif")
        r = rng.random() * self.total
        i = bisect.bisect_right(self.cum, r)
        return self.items[min(i, len(self.items) - 1)]


def _year_weights():
    """Poids annuels : croissance exponentielle, annee courante partielle.

    Les sparklines doivent avoir une forme plausible : la litterature HLA en
    transplantation croit d'environ 7 % par an depuis 1990.
    """
    years = list(range(YEAR_MIN, YEAR_MAX + 1))
    weights = [math.exp(YEAR_GROWTH * (y - YEAR_MIN)) for y in years]
    weights[-1] *= CURRENT_YEAR_FRACTION
    return years, weights


def _weighted_sample(rng, population, weights, k):
    """Tirage sans remise pondere, deterministe pour un rng donne."""
    pop = list(population)
    wts = list(weights)
    picked = []
    k = min(k, len(pop))
    for _ in range(k):
        total = sum(wts)
        if total <= 0:
            break
        r = rng.random() * total
        acc = 0.0
        # `r < acc` (strict) avec r tire dans [0, total) garantit que la
        # boucle trouve toujours un element : le cumul final vaut total > r.
        for i, w in enumerate(wts):
            acc += w
            if r < acc:
                picked.append(pop.pop(i))
                wts.pop(i)
                break
    return picked


def _build_model(rng, hla_rows, n_articles):
    """Planifie le paysage de signal et precalcule les tables de tirage.

    Le signal inverse est produit PAR LES COMPTAGES, jamais par un correctif
    applique apres coup a la table de contingence : une paire protectrice
    relie un allele et une complication tous deux frequents, mais que les
    articles evitent de citer ensemble (hors d'un petit quota fixe). La
    co-occurrence observee tombe alors sous n_a*n_b/N, et la depletion se lit
    directement dans les donnees : npmi, odds_ratio et Fisher s'accordent
    tous en signe parce qu'ils decoulent tous de la meme table.
    """
    regime = "small" if n_articles < SMALL_CORPUS else "large"
    resolution_of = {r["hla"]: r["resolution"] for r in hla_rows}
    parent_of = {r["hla"]: r["parent_hla"] for r in hla_rows}
    children_of = defaultdict(list)
    for r in hla_rows:
        if r["resolution"] == "4-digit":
            children_of[r["parent_hla"]].append(r["hla"])

    mentionable = [
        r["hla"] for r in hla_rows
        if r["resolution"] in ("4-digit", "2-digit", "mismatch_count", "eplet")
    ]
    outcomes = list(OUTCOME_LABELS)
    pop_h = _hla_popularity()

    inverse = INVERSE_PAIRS[:SMALL_CORPUS_INVERSE] if regime == "small" else list(INVERSE_PAIRS)
    planned = (STRONG_PAIRS + CLEAR_PAIRS + WEAK_PAIRS + MODERATE_PAIRS
               + RARE_CLEAR_PAIRS + inverse)
    for hla, outcome in planned:
        # Garde-fou : une faute de frappe dans un plan ne doit pas produire
        # silencieusement une paire jamais tiree.
        if hla not in resolution_of or outcome not in OUTCOME_LABELS:
            raise ValueError(f"paire planifiee inconnue : {(hla, outcome)}")

    # Deux leviers distincts :
    #  * `enrich` MULTIPLIE pop(h) x pop(o) dans le tirage de la paire
    #    principale — heterogeneite de fond, enrichissements non planifies ;
    #  * `boost` est une CO-CITATION CONDITIONNELLE : un article qui cite h
    #    (par quelque voie que ce soit) cite aussi o avec la probabilite q.
    #    C'est le levier des paires planifiees. Il ne gonfle pas n_hla_total
    #    (contrairement a une part d'articles reservee a la paire, qui
    #    deprimerait mecaniquement toutes les AUTRES paires de h et ferait
    #    apparaitre de faux signaux inverses), et il donne a un allele peu
    #    cite un effectif proportionne a sa presence dans le corpus.
    enrich = {}
    boost = {}
    for pair in STRONG_PAIRS:
        # Les paires de l'allele vitrine ont la co-citation la plus nette : la
        # fiche d'accueil doit montrer des signaux forts quel que soit le seed.
        low, high = (0.40, 0.50) if pair[0] == SHOWCASE_HLA else (0.25, 0.45)
        boost[pair] = rng.uniform(low, high)
    for pair in CLEAR_PAIRS:
        boost[pair] = rng.uniform(0.10, 0.22)
    for pair in WEAK_PAIRS:
        enrich[pair] = 1.0
    reserved = set(planned) | {h for h, _ in MODERATE_PAIRS + RARE_CLEAR_PAIRS}
    # Candidats : paires de fond PEU attendues (entites peu citees), pour
    # que quelques co-citations supplementaires s'y lisent comme un signal.
    candidates = [
        (h, o) for h in mentionable for o in outcomes
        if (h, o) not in reserved and h not in reserved
        and 0 < pop_h[h] * OUTCOME_POPULARITY[o] < 0.08
        and pop_h[h] >= RANDOM_CLEAR_MIN_POP
        # Les complications les plus rares sont laissees aux paires
        # « moderees », dont la significativite exige un attendu quasi nul.
        and OUTCOME_POPULARITY[o] >= 0.18
        and not any(h == ih for ih, _ in inverse)
    ]
    n_random = RANDOM_CLEAR_PAIRS if regime == "large" else 0
    for pair in rng.sample(candidates, n_random):
        boost[pair] = rng.uniform(0.12, 0.35)
    for pair in inverse:
        enrich[pair] = 0.0
    for pair in MODERATE_PAIRS + RARE_CLEAR_PAIRS:
        enrich[pair] = 0.0
    boosts_of = defaultdict(list)
    for (h, o), q in sorted(boost.items()):
        boosts_of[h].append((o, q))

    negated_rate = {}
    pair_keys = []
    for hla in mentionable:
        for outcome in outcomes:
            pair = (hla, outcome)
            pair_keys.append(pair)
            if pair not in enrich:
                # Heterogeneite de fond, et quelques enrichissements non
                # planifies : la litterature reelle n'est pas un plan.
                factor = math.exp(rng.gauss(0.0, 0.3))
                if rng.random() < UNPLANNED_ENRICH_RATE:
                    factor *= rng.uniform(2.5, 5.0)
                enrich[pair] = factor
            if pair in inverse:
                negated_rate[pair] = 0.45
            elif rng.random() < CONTESTED_RATE:
                negated_rate[pair] = CONTESTED_NEGATED_RATE
            else:
                negated_rate[pair] = NEGATED_RATE

    years, _ = _year_weights()
    lead_by_year = {}
    hla_by_year = {}
    outcome_by_year = {}
    for year in years:
        w_h = {h: pop_h[h] * _hla_era_factor(h, resolution_of[h], year) for h in mentionable}
        w_o = {o: OUTCOME_POPULARITY[o] * _outcome_era_factor(o, year) for o in outcomes}
        weights = [w_h[h] * w_o[o] * enrich[(h, o)] for h, o in pair_keys]
        lead_by_year[year] = _Cumulative(pair_keys, weights)
        hla_by_year[year] = _Cumulative(mentionable, [w_h[h] for h in mentionable])
        outcome_by_year[year] = _Cumulative(outcomes, [w_o[o] for o in outcomes])

    # Quota d'articles reserves a chaque paire protectrice : il assure de
    # franchir INVERSE_MIN_N (sans quoi la depletion serait supprimee comme du
    # bruit) tout en restant tres en dessous de l'attendu n_a*n_b/N.
    quota = INVERSE_MIN_N + 1 + n_articles // 1000

    return {
        "regime": regime,
        "resolution_of": resolution_of,
        "parent_of": parent_of,
        "children_of": children_of,
        "pop_h": pop_h,
        "inverse": inverse,
        "quota": quota,
        # Paires a effectif reserve (alleles rares) : grand corpus seulement.
        # Sous RARE_PAIRS_MIN_ARTICLES, leurs ~120 articles reserves
        # satureraient le corpus et ecraseraient tout le reste du paysage.
        "rare": (
            [(pair, MODERATE_COUNT) for pair in MODERATE_PAIRS]
            + [(pair, rng.randint(*RARE_CLEAR_COUNT)) for pair in RARE_CLEAR_PAIRS]
        ) if n_articles >= RARE_PAIRS_MIN_ARTICLES else [],
        "carrier_rates": CARRIER_RATES[regime],
        "rejection": INVERSE_REJECTION[regime],
        "negated_rate": negated_rate,
        "boosts_of": boosts_of,
        "outcome_era": {
            (o, y): _outcome_era_factor(o, y) for o in outcomes for y in years
        },
        "lead_by_year": lead_by_year,
        "hla_by_year": hla_by_year,
        "outcome_by_year": outcome_by_year,
    }


# ---------------------------------------------------------------------
# Auteurs : equipes nationales autour de chefs de laboratoire
# ---------------------------------------------------------------------

def _build_author_model(rng, n_articles):
    """Population d'auteurs structuree en equipes.

    * Des CHEFS d'equipe (dernier auteur), environ un pour 27 articles, actifs
      sur une fenetre de carriere : ce sont les auteurs prolifiques (15 a 40+
      publications sur un corpus de 3 000 articles).
    * Chaque chef a un LABORATOIRE de 5 a 12 collaborateurs recurrents, tires
      du vivier de son pays : les co-auteurs reviennent, la fiche auteur et
      son reseau de co-signatures ont donc une forme lisible.
    * Une longue traine d'auteurs occasionnels (1 a 3 articles), et quelques
      collaborations internationales.
    """
    used = set()

    def new_name(surnames):
        for attempt in range(200):
            surname = rng.choice(surnames)
            initials = rng.choice(GIVEN_INITIALS)
            if attempt > 20 or rng.random() < 0.3:
                initials += rng.choice(GIVEN_INITIALS)
            name = f"{surname} {initials}"
            if name not in used:
                used.add(name)
                return name
        raise RuntimeError("vivier de noms epuise")

    total_weight = sum(p[1] for p in COUNTRY_PROFILES)
    n_heads = max(len(COUNTRY_PROFILES), round(n_articles / 24))

    # Repartition des chefs par pays : plus forts restes, deterministe.
    quotas = [n_heads * p[1] / total_weight for p in COUNTRY_PROFILES]
    alloc = [max(1, int(q)) for q in quotas]
    remainders = sorted(
        range(len(quotas)), key=lambda i: (-(quotas[i] - int(quotas[i])), i)
    )
    i = 0
    while sum(alloc) < n_heads:
        alloc[remainders[i % len(remainders)]] += 1
        i += 1

    heads = []
    tails_by_country = {}
    for (country, _, first_year, surnames), n_country_heads in zip(COUNTRY_PROFILES, alloc):
        tails = []
        for _ in range(n_country_heads * 20 + 10):
            tails.append({
                "name": new_name(surnames),
                "country": country,
                "weight": math.exp(rng.gauss(0.0, 0.5)),
            })
        tails_by_country[country] = tails
        # Les laboratoires se partagent le vivier sans chevauchement (sauf
        # epuisement) : un collaborateur appartient en general a UNE equipe.
        free = list(tails)
        rng.shuffle(free)
        for _ in range(n_country_heads):
            start = rng.randint(max(first_year, YEAR_MIN - 5), 2016)
            end = min(YEAR_MAX, start + rng.randint(14, 36))
            size = rng.randint(5, 12)
            if len(free) < size:
                free = list(tails)
                rng.shuffle(free)
            lab, free = free[:size], free[size:]
            heads.append({
                "name": new_name(surnames),
                "country": country,
                # Normalise par la duree de carriere : sans cela, les
                # carrieres longues accumuleraient mecaniquement les articles.
                "weight": rng.uniform(0.6, 1.4) * 25.0 / (end - start + 1),
                "start": start,
                "end": end,
                "lab": lab,
            })

    years, _ = _year_weights()
    head_by_year = {}
    for year in years:
        active = [h for h in heads if h["start"] <= year <= h["end"]] or heads
        head_by_year[year] = _Cumulative(active, [h["weight"] for h in active])

    heads_by_country = defaultdict(list)
    for h in heads:
        heads_by_country[h["country"]].append(h)

    return {
        "heads": heads,
        "head_by_year": head_by_year,
        "heads_by_country": heads_by_country,
        "tails_by_country": tails_by_country,
        "countries": [p[0] for p in COUNTRY_PROFILES],
    }


def _article_authors(rng, authors_model, head):
    """Liste ordonnee des signataires d'un article ; le chef signe en dernier."""
    n_authors = rng.choices(
        [1, 2, 3, 4, 5, 6, 7, 8, 10, 12],
        weights=[3, 8, 14, 18, 17, 14, 10, 8, 5, 3],
    )[0]
    country = head["country"]
    chosen = [head["name"]]
    others = []
    tries = 0
    while len(chosen) < n_authors and tries < n_authors * 4:
        tries += 1
        r = rng.random()
        if r < 0.55 and head["lab"]:
            cand = _weighted_sample(
                rng, head["lab"], [t["weight"] for t in head["lab"]], 1
            )[0]["name"]
        elif r < 0.62:
            pool = (
                authors_model["heads_by_country"][country]
                if rng.random() < 0.7 else authors_model["heads"]
            )
            cand = rng.choice(pool)["name"]
        elif r < 0.94:
            cand = rng.choice(authors_model["tails_by_country"][country])["name"]
        else:
            other = rng.choice(authors_model["countries"])
            cand = rng.choice(authors_model["tails_by_country"][other])["name"]
        if cand not in chosen:
            chosen.append(cand)
            others.append(cand)
    rng.shuffle(others)
    return others + [head["name"]]


def _sentence_for(rng, hla, outcome, negated):
    """Construit une phrase et ses spans.

    Les spans sont extraits des valeurs effectivement interpolees, donc
    litteralement presents dans la phrase — propriete verifiee par les tests
    et dont depend le surlignage de l'UI. Retourne aussi le declencheur de
    negation, sous-chaine litterale du gabarit negatif retenu.
    """
    outcome_span = rng.choice(OUTCOME_SPANS[outcome])
    hla_span = hla
    if negated:
        template, trigger = rng.choice(NEGATED_TEMPLATES)
    else:
        template, trigger = rng.choice(POSITIVE_TEMPLATES), ""
    sentence = template.format(hla=hla_span, outcome=outcome_span)
    return sentence, hla_span, outcome_span, trigger


def _article_entities(rng, model, year, forced):
    """Ensembles (alleles, complications) cites par un article.

    Retourne deux listes ordonnees ; l'article emettra une mention pour
    chaque paire du produit cartesien.
    """
    lead_h, lead_o = model["lead_by_year"][year].pick(rng)
    hlas = [lead_h]
    outs = [lead_o]

    # Compagnon hierarchique : un 4-digit cite souvent son groupe 2-digit,
    # et un 2-digit parfois l'un de ses 4-digit.
    resolution = model["resolution_of"][lead_h]
    if resolution == "4-digit" and rng.random() < 0.35:
        hlas.append(model["parent_of"][lead_h])
    elif resolution == "2-digit" and model["children_of"].get(lead_h) and rng.random() < 0.2:
        kids = model["children_of"][lead_h]
        # Un enfant de popularite nulle (allele rare) n'est jamais tire.
        picked = _weighted_sample(rng, kids, [model["pop_h"][k] for k in kids], 1)
        hlas.extend(picked)

    for _ in range(rng.choices([0, 1, 2], weights=[60, 30, 10])[0]):
        h = model["hla_by_year"][year].pick(rng)
        if h not in hlas:
            hlas.append(h)
    for _ in range(rng.choices([0, 1, 2], weights=[45, 40, 15])[0]):
        o = model["outcome_by_year"][year].pick(rng)
        if o not in outs:
            outs.append(o)

    # Co-citations conditionnelles des paires planifiees (cf. `boost`).
    for h in list(hlas):
        for o, q in model["boosts_of"].get(h, ()):
            if o not in outs and model["outcome_era"][(o, year)] > 0 and rng.random() < q:
                outs.append(o)

    # Porteurs des paires protectrices.
    carrier_h, carrier_o = model["carrier_rates"]
    for h, o in model["inverse"]:
        if carrier_h and rng.random() < carrier_h and h not in hlas:
            hlas.append(h)
        if carrier_o and rng.random() < carrier_o and o not in outs:
            outs.append(o)

    if forced is not None:
        h, o = forced
        if h not in hlas:
            hlas.append(h)
        if o not in outs:
            outs.append(o)

    # Evitement : hors quota, une paire protectrice n'est (presque) jamais
    # co-citee. On retire l'entite secondaire, jamais la paire principale.
    for h, o in model["inverse"]:
        if (h, o) == forced or h not in hlas or o not in outs:
            continue
        if rng.random() < model["rejection"]:
            if o != lead_o:
                outs.remove(o)
            elif h != lead_h:
                hlas.remove(h)

    return hlas, outs


def _generate(rng, n_articles):
    """Coeur de la generation. Retourne (articles, authors, hla_rows,
    pair_mentions, associations), tous deja ordonnes pour l'ecriture."""

    hla_rows = build_hla_entities()
    candidate_rows = hla_rows
    model = _build_model(rng, hla_rows, n_articles)
    authors_model = _build_author_model(rng, n_articles)
    years, year_weights = _year_weights()
    year_picker = _Cumulative(years, year_weights)

    # File deterministe des paires protectrices a placer, une par article,
    # etalee sur le corpus pour que first_year et les timelines restent
    # plausibles.
    forced_queue = []
    for pair in sorted(model["inverse"]):
        forced_queue.extend([pair] * model["quota"])
    for pair, count in model["rare"]:
        forced_queue.extend([pair] * count)
    # Entrelace les paires plutot que de les placer en blocs : chaque paire
    # est ainsi etalee sur toute la periode couverte.
    forced_queue = [
        forced_queue[i] for i in sorted(
            range(len(forced_queue)),
            key=lambda i: (forced_queue[:i].count(forced_queue[i]), i),
        )
    ]
    forced_every = max(1, n_articles // (len(forced_queue) + 1))

    pmids = set()
    articles = []
    authors = []
    pair_mentions = []

    for article_idx in range(n_articles):
        while True:
            pmid = str(rng.randint(10_000_000, 99_999_999))
            if pmid not in pmids:
                pmids.add(pmid)
                break

        year = year_picker.pick(rng)
        head = authors_model["head_by_year"][year].pick(rng)
        country = head["country"]

        journals = [j for j in JOURNALS if j[3] <= year]
        journal, abbrev, _, _ = rng.choices(journals, weights=[j[2] for j in journals])[0]

        forced = None
        if forced_queue and article_idx % forced_every == 0:
            forced = forced_queue.pop(0)

        hlas, outs = _article_entities(rng, model, year, forced)
        pairs = [(h, o) for h in hlas for o in outs]

        lead_hla, lead_outcome = hlas[0], outs[0]
        lead_label = OUTCOME_SPANS[lead_outcome][0]
        title = rng.choice(TITLE_OPENERS).format(hla=lead_hla, outcome=lead_label)
        title = title[0].upper() + title[1:]

        abstract = " ".join([
            rng.choice(ABSTRACT_BACKGROUND),
            rng.choice(ABSTRACT_METHODS),
            f"Patients were transplanted in {country}.",
            rng.choice(ABSTRACT_RESULTS).format(n=rng.randint(60, 4000)),
            rng.choice(ABSTRACT_CONCLUSION),
        ])

        articles.append({
            "pmid": pmid,
            "doi": f"10.1111/synth.{pmid}",
            "title": title,
            "abstract": abstract,
            "year": year,
            "journal": journal,
            "journal_abbrev": abbrev,
            "country": country,
            "language": "eng",
            # Les articles anciens ont eu plus de temps pour etre cites.
            "cited_by": max(0, int(rng.expovariate(1 / 18.0) * (1 + (YEAR_MAX - year) / 12))),
            "source": "synthetic",
            "graft_assignment": "Kidney" if rng.random() < 0.88 else rng.choice(
                ["Multi-organ", "Unspecified"]
            ),
        })

        # --- Auteurs ---
        for position, name in enumerate(_article_authors(rng, authors_model, head), start=1):
            authors.append({"pmid": pmid, "author": name, "position": position})

        # --- pair_mentions ---
        # Emis AVANT toute agregation : les associations en decoulent.
        slots = rng.sample(range(max(12, len(pairs) + 2)), len(pairs))
        for (hla, outcome), sentence_idx in zip(pairs, slots):
            negated = rng.random() < model["negated_rate"][(hla, outcome)]
            sentence, hla_span, outcome_span, trigger = _sentence_for(
                rng, hla, outcome, negated
            )
            pair_mentions.append({
                "pmid": pmid,
                "hla": hla,
                "outcome": outcome,
                "sentence": sentence,
                "hla_span": hla_span,
                "outcome_span": outcome_span,
                "polarity": "negated" if negated else "positive",
                "negation_trigger": trigger,
                "sentence_idx": sentence_idx,
            })

    # --- Associations : AGREGEES depuis pair_mentions -------------------
    year_of = {a["pmid"]: a["year"] for a in articles}

    pair_counts = Counter()
    pair_positive = Counter()
    pair_negated = Counter()
    pair_first_year = {}
    hla_articles = defaultdict(set)
    outcome_articles = defaultdict(set)

    for m in pair_mentions:
        key = (m["hla"], m["outcome"])
        pair_counts[key] += 1
        if m["polarity"] == "negated":
            pair_negated[key] += 1
        else:
            pair_positive[key] += 1
        y = year_of[m["pmid"]]
        pair_first_year[key] = min(pair_first_year.get(key, y), y)
        hla_articles[m["hla"]].add(m["pmid"])
        outcome_articles[m["outcome"]].add(m["pmid"])

    n_universe = len(articles)

    rows = []
    for key in sorted(pair_counts):
        hla, outcome = key
        n_ab = pair_counts[key]
        n_a = len(hla_articles[hla])
        n_b = len(outcome_articles[outcome])

        # ---------------------------------------------------------------
        # TABLE 2x2 UNIQUE — toutes les metriques publiees en decoulent.
        #
        # Une seule table sert npmi, odds_ratio, l'IC et les deux tests de
        # Fisher. C'est la condition pour que les metriques ne puissent pas
        # se contredire : un npmi positif implique OR > 1, et inversement.
        # Toute correction appliquee ici vaut donc pour tous les nombres de
        # la ligne. Le signal inverse est produit en amont, par les
        # comptages (cf. _build_pair_plan), jamais par un ajustement local.
        #
        # a est le nombre d'articles portant la paire ; n_ab compte les
        # mentions et peut le majorer, donc on borne par les marges.
        # ---------------------------------------------------------------
        a = min(n_ab, n_a, n_b)
        b = max(0, n_a - a)          # articles avec l'HLA, sans cet outcome
        c = max(0, n_b - a)          # articles avec l'outcome, sans cet HLA
        # Complement honnete : la table somme exactement a n_universe, donc
        # un consommateur qui reconstruit a, b, c a partir des colonnes
        # publiees retrouve d et recalcule les memes p-values.
        d = max(0, n_universe - a - b - c)

        pmi, npmi = pmi_npmi(a, a + b, a + c, a + b + c + d)
        orr, log_or, ci_low, ci_high = odds_ratio_with_ci(a, b, c, d)
        p_greater, p_two = fisher_exact(a, b, c, d)

        # Plancher de depletion : sous INVERSE_MIN_N co-occurrences, une
        # conclusion "protectrice" ne reposerait que sur du bruit. On rend la
        # paire non concluante du cote bilateral (p=1.0) sans toucher ni aux
        # comptages ni a l'OR, qui restent affichables a titre descriptif.
        if orr < 1.0 and n_ab < INVERSE_MIN_N:
            p_two = 1.0

        rows.append({
            "hla": hla,
            "outcome": outcome,
            "n_cooccurrence": n_ab,
            "n_positive": pair_positive[key],
            "n_negated": pair_negated[key],
            "n_hla_total": n_a,
            "n_outcome_total": n_b,
            "n_universe": n_universe,
            "pmi": round(pmi, 6),
            "npmi": round(npmi, 6),
            "log_odds": round(log_or, 6),
            "odds_ratio": round(orr, 6),
            "or_ci_low": round(ci_low, 6),
            "or_ci_high": round(ci_high, 6),
            "pval_fisher": p_greater,
            "fdr": None,
            "pval_two_sided": p_two,
            "fdr_two_sided": None,
            "first_year": pair_first_year[key],
        })

    # La famille de tests de la correction FDR ne compte que les paires vues au
    # moins MIN_TEST_COOCCURRENCE fois, comme un pipeline qui ecarte les
    # singletons avant de tester : avec un vocabulaire de ~900 alleles, les
    # milliers de paires vues une seule fois noieraient autrement la
    # correction de Benjamini-Hochberg. Une paire non testee a fdr = 1.0.
    testable = [i for i, r in enumerate(rows)
                if r["n_cooccurrence"] >= MIN_TEST_COOCCURRENCE]
    fdr = [1.0] * len(rows)
    fdr_two = [1.0] * len(rows)
    for i, f1, f2 in zip(
        testable,
        benjamini_hochberg([rows[i]["pval_fisher"] for i in testable]),
        benjamini_hochberg([rows[i]["pval_two_sided"] for i in testable]),
    ):
        fdr[i], fdr_two[i] = f1, f2
    for r, f1, f2 in zip(rows, fdr, fdr_two):
        # Format a chiffres significatifs, jamais round(x, 8) : un p de 2e-17
        # y serait ecrase a 0.0, reintroduisant l'underflow que MIN_PVALUE
        # cherche a eviter (-log10(0) = +inf cote consommateur).
        r["pval_fisher"] = _format_pvalue(r["pval_fisher"])
        r["pval_two_sided"] = _format_pvalue(r["pval_two_sided"])
        r["fdr"] = _format_pvalue(f1)
        r["fdr_two_sided"] = _format_pvalue(f2)

    pair_mentions.sort(key=lambda m: (m["pmid"], m["hla"], m["outcome"], m["sentence_idx"]))

    hla_rows = _prune_unmentioned(candidate_rows, {m["hla"] for m in pair_mentions})

    return articles, authors, hla_rows, pair_mentions, rows


# =====================================================================
# ECRITURE
# =====================================================================

ARTICLE_COLUMNS = ["pmid", "doi", "title", "abstract", "year", "journal",
                   "journal_abbrev", "country", "language", "cited_by",
                   "source", "graft_assignment"]
AUTHOR_COLUMNS = ["pmid", "author", "position"]
HLA_COLUMNS = ["hla", "locus", "hla_class", "resolution", "parent_hla"]
PAIR_MENTION_COLUMNS = ["pmid", "hla", "outcome", "sentence", "hla_span",
                        "outcome_span", "polarity", "negation_trigger",
                        "sentence_idx"]
ASSOCIATION_COLUMNS = ["hla", "outcome", "n_cooccurrence", "n_positive",
                       "n_negated", "n_hla_total", "n_outcome_total",
                       "n_universe", "pmi", "npmi", "log_odds", "odds_ratio",
                       "or_ci_low", "or_ci_high", "pval_fisher", "fdr",
                       "pval_two_sided", "fdr_two_sided", "first_year"]


def _write_csv(path, columns, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main(out_dir, n_articles=DEFAULT_N_ARTICLES, seed=42):
    """Genere les cinq CSV synthetiques dans out_dir (cree si absent).

    Deterministe : a seed fixee, les fichiers sont identiques octet pour octet.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    rng = Random(seed)
    articles, authors, hla_rows, pair_mentions, associations = _generate(rng, n_articles)

    _write_csv(out / "articles.csv", ARTICLE_COLUMNS, articles)
    _write_csv(out / "authors.csv", AUTHOR_COLUMNS, authors)
    _write_csv(out / "hla_entities.csv", HLA_COLUMNS, hla_rows)
    _write_csv(out / "pair_mentions.csv", PAIR_MENTION_COLUMNS, pair_mentions)
    _write_csv(out / "associations.csv", ASSOCIATION_COLUMNS, associations)

    return {
        "articles": len(articles),
        "authors": len(authors),
        "hla_entities": len(hla_rows),
        "pair_mentions": len(pair_mentions),
        "associations": len(associations),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Genere un jeu de donnees synthetique deterministe."
    )
    parser.add_argument("--out", default="data/synthetic",
                        help="Repertoire de sortie (cree si absent).")
    parser.add_argument("--n-articles", type=int, default=DEFAULT_N_ARTICLES,
                        help="Nombre d'articles a generer.")
    parser.add_argument("--seed", type=int, default=42,
                        help="Graine aleatoire (determinisme).")
    args = parser.parse_args()

    stats = main(out_dir=args.out, n_articles=args.n_articles, seed=args.seed)
    for name, count in stats.items():
        print(f"{name:>15} : {count}")
    print(f"\nEcrit dans {os.path.abspath(args.out)}")
