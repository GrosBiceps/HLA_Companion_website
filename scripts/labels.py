"""Table de libelles cliniques, vocabulaire des organes et niveau de signal.

Source de verite partagee entre le builder Python et l'interface TypeScript
(cf. src/lib/labels.ts et src/lib/organs.ts, qui doivent rester synchronises :
`src/__tests__/organ-vocabulary.test.ts` compare les deux fichiers).

Les cles techniques (graft_loss, recurrent_GN...) ne doivent JAMAIS etre
affichees a l'utilisateur : l'interface passe toujours par OUTCOME_LABELS.
Il en va de meme des cles d'organes (kidney, hsct...) : l'ecran passe par
ORGANS (libelle francais) et le parametre d'URL par le slug.
"""

# Ordre d'affichage des categories sur la fiche allele.
# (Les cles sont sans accents ; l'ecran passe par CATEGORY_DISPLAY, cf. theme.ts.)
CATEGORIES = [
    "Rejet",
    "Immunisation",
    "Fonction du greffon",
    "Infection",
    "Neoplasie",
    "Metabolique",
    "Recidive",
    "Greffon contre hote",
    "Survie",
]

# ---------------------------------------------------------------------
# ORGANES (cf. docs/ORGANES.md)
# ---------------------------------------------------------------------

# Sentinelle de strate : « tous les organes ». Ce n'est PAS un organe : elle
# nomme la strate calculee sur l'ensemble du corpus.
ALL_ORGANS = "all"

# (cle stable, libelle, libelle court, slug d'URL), dans l'ordre d'affichage.
# Les cles sont stockees en base ; le slug (francais, sans accent) est celui du
# parametre `?organe=`. Miroir TypeScript : src/lib/organs.ts.
ORGANS = [
    ("kidney", "Rein", "Rein", "rein"),
    ("liver", "Foie", "Foie", "foie"),
    ("heart", "Cœur", "Cœur", "coeur"),
    ("lung", "Poumon", "Poumon", "poumon"),
    ("hsct", "Cellules souches hématopoïétiques (GCSH)", "GCSH", "gcsh"),
    ("pancreas", "Pancréas (dont pancréas-rein)", "Pancréas", "pancreas"),
    ("intestine", "Intestin", "Intestin", "intestin"),
]
ORGAN_KEYS = [o[0] for o in ORGANS]
ORGAN_LABELS = {key: label for key, label, _, _ in ORGANS}

# {cle_pipeline: (libelle_affiche, categorie)}
OUTCOME_LABELS = {
    "ABMR": ("Rejet humoral (ABMR)", "Rejet"),
    "TCMR": ("Rejet cellulaire (TCMR)", "Rejet"),
    "acute_rejection": ("Rejet aigu", "Rejet"),
    "chronic_rejection": ("Rejet chronique / IFTA", "Rejet"),
    "mixed_rejection": ("Rejet mixte", "Rejet"),
    "DSA": ("Anticorps anti-HLA du donneur (DSA)", "Immunisation"),
    "sensitization": ("Immunisation / sensibilisation", "Immunisation"),
    "complement_activation": ("Activation du complément", "Immunisation"),
    "HLA_mismatch_outcome": ("Incompatibilité HLA", "Immunisation"),
    "DGF": ("Reprise retardée de fonction (DGF)", "Fonction du greffon"),
    "graft_loss": ("Perte du greffon", "Fonction du greffon"),
    "graft_survival": ("Survie du greffon", "Fonction du greffon"),
    "eGFR": ("Fonction rénale (DFG estimé)", "Fonction du greffon"),
    "BK_nephropathy": ("Néphropathie à BK virus", "Infection"),
    "CMV": ("Infection à CMV", "Infection"),
    "PTLD": ("Syndrome lymphoprolifératif (PTLD)", "Neoplasie"),
    "skin_cancer": ("Cancer cutané", "Neoplasie"),
    "NODAT": ("Diabète post-transplantation (NODAT)", "Metabolique"),
    "recurrent_GN": ("Récidive de glomérulonéphrite", "Recidive"),
    "FSGS": ("Hyalinose segmentaire et focale (HSF)", "Recidive"),
    "IgA_nephropathy": ("Néphropathie à IgA", "Recidive"),
    # --- Plusieurs organes ---------------------------------------------
    "EBV": ("Infection à EBV", "Infection"),
    "patient_mortality": ("Mortalité du receveur", "Survie"),
    # --- Cœur ----------------------------------------------------------
    "cardiac_allograft_vasculopathy": (
        "Vasculopathie du greffon cardiaque (CAV)", "Rejet"),
    # --- Poumon --------------------------------------------------------
    "chronic_lung_allograft_dysfunction": (
        "Dysfonction chronique du greffon pulmonaire (CLAD)", "Rejet"),
    "bronchiolitis_obliterans": (
        "Syndrome de bronchiolite oblitérante (BOS)", "Rejet"),
    "invasive_aspergillosis": ("Aspergillose invasive", "Infection"),
    # --- Cœur et poumon ------------------------------------------------
    "primary_graft_dysfunction": (
        "Dysfonction primaire du greffon (PGD)", "Fonction du greffon"),
    # --- Foie ----------------------------------------------------------
    "liver_chronic_rejection": (
        "Rejet chronique hépatique (ductopénique)", "Rejet"),
    "early_allograft_dysfunction": (
        "Dysfonction précoce du greffon hépatique (EAD)", "Fonction du greffon"),
    "biliary_complications": ("Complications biliaires", "Fonction du greffon"),
    "hepatitis_recurrence": (
        "Récidive de l'hépatite virale (VHB/VHC)", "Recidive"),
    "hcc_recurrence": ("Récidive du carcinome hépatocellulaire", "Recidive"),
    "cholangitis_recurrence": (
        "Récidive de cholangite (CSP/CBP)", "Recidive"),
    # --- Pancréas ------------------------------------------------------
    "pancreas_graft_thrombosis": (
        "Thrombose du greffon pancréatique", "Fonction du greffon"),
    "insulin_independence": ("Insulino-indépendance", "Fonction du greffon"),
    "autoimmune_diabetes_recurrence": (
        "Récidive du diabète auto-immun", "Recidive"),
    # --- Intestin ------------------------------------------------------
    "parenteral_nutrition_dependence": (
        "Dépendance à la nutrition parentérale", "Fonction du greffon"),
    # --- Cellules souches hématopoïétiques (GCSH) ----------------------
    "acute_gvhd": (
        "Réaction du greffon contre l'hôte aiguë (GVH aiguë)",
        "Greffon contre hote"),
    "chronic_gvhd": (
        "Réaction du greffon contre l'hôte chronique (GVH chronique)",
        "Greffon contre hote"),
    "disease_relapse": ("Rechute de la maladie hématologique", "Recidive"),
    "engraftment_failure": ("Échec de prise de greffe", "Fonction du greffon"),
    "hsct_graft_rejection": ("Rejet de greffe de CSH", "Rejet"),
    "HLA_loss_relapse": ("Perte d'HLA à la rechute", "Immunisation"),
    "secondary_malignancy": ("Seconde néoplasie", "Neoplasie"),
    "non_relapse_mortality": ("Mortalité non liée à la rechute", "Survie"),
}

# Organes auxquels chaque complication s'applique. Une complication
# « partagee » en liste plusieurs ; une complication specifique n'en liste
# qu'un ou deux. Ce n'est PAS un resultat du corpus : c'est un fait de
# vocabulaire (le BOS n'existe pas apres une greffe renale), qui sert a
# filtrer les listes et a valider les donnees (V-check du builder).
_SOLID = ("kidney", "liver", "heart", "lung", "pancreas", "intestine")
_ALL = _SOLID + ("hsct",)
OUTCOME_ORGANS = {
    "ABMR": _SOLID,
    "TCMR": _SOLID,
    "acute_rejection": _SOLID,
    "chronic_rejection": ("kidney",),
    "mixed_rejection": ("kidney", "heart"),
    "DSA": _ALL,
    "sensitization": ("kidney", "heart", "lung", "pancreas", "intestine"),
    "complement_activation": ("kidney", "heart", "lung"),
    "HLA_mismatch_outcome": _ALL,
    "DGF": ("kidney",),
    "graft_loss": _SOLID,
    "graft_survival": _SOLID,
    "eGFR": ("kidney",),
    "BK_nephropathy": ("kidney",),
    "CMV": _ALL,
    "PTLD": _ALL,
    "skin_cancer": ("kidney", "liver", "heart", "lung", "pancreas"),
    "NODAT": ("kidney", "liver", "heart", "lung"),
    "recurrent_GN": ("kidney",),
    "FSGS": ("kidney",),
    "IgA_nephropathy": ("kidney",),
    "EBV": _ALL,
    "patient_mortality": _ALL,
    "cardiac_allograft_vasculopathy": ("heart",),
    "chronic_lung_allograft_dysfunction": ("lung",),
    "bronchiolitis_obliterans": ("lung",),
    "invasive_aspergillosis": ("lung", "hsct"),
    "primary_graft_dysfunction": ("heart", "lung"),
    "liver_chronic_rejection": ("liver",),
    "early_allograft_dysfunction": ("liver",),
    "biliary_complications": ("liver",),
    "hepatitis_recurrence": ("liver",),
    "hcc_recurrence": ("liver",),
    "cholangitis_recurrence": ("liver",),
    "pancreas_graft_thrombosis": ("pancreas",),
    "insulin_independence": ("pancreas",),
    "autoimmune_diabetes_recurrence": ("pancreas",),
    "parenteral_nutrition_dependence": ("intestine",),
    "acute_gvhd": ("hsct", "intestine"),
    "chronic_gvhd": ("hsct",),
    "disease_relapse": ("hsct",),
    "engraftment_failure": ("hsct",),
    "hsct_graft_rejection": ("hsct",),
    "HLA_loss_relapse": ("hsct",),
    "secondary_malignancy": ("hsct",),
    "non_relapse_mortality": ("hsct",),
}


def outcomes_for_organ(organ):
    """Cles de complications applicables a un organe (ordre de OUTCOME_LABELS)."""
    return [k for k in OUTCOME_LABELS if organ in OUTCOME_ORGANS[k]]


# Ordre de tri pour l'affichage : le plus fort en premier.
SIGNAL_LEVELS = ["inverse", "strong", "clear", "moderate", "weak"]

SIGNIFICANCE_THRESHOLD = 0.05
STRONG_MIN_N = 10
CLEAR_MIN_N = 3


def compute_signal_level(n_cooccurrence, fdr, odds_ratio, fdr_two_sided):
    """Derive le niveau de signal qualitatif affiche a l'utilisateur.

    Le test unilateral 'greater' du pipeline est structurellement aveugle a
    la depletion : une association protectrice authentique (OR<1) ne peut
    jamais etre significative par ce test. On teste donc 'inverse' EN
    PREMIER, via le test bilateral, pour ne pas la rendre invisible.
    """
    if (
        odds_ratio is not None
        and fdr_two_sided is not None
        and odds_ratio < 1.0
        and fdr_two_sided < SIGNIFICANCE_THRESHOLD
    ):
        return "inverse"

    if fdr is None or fdr >= SIGNIFICANCE_THRESHOLD:
        return "weak"

    if n_cooccurrence >= STRONG_MIN_N:
        return "strong"
    if n_cooccurrence >= CLEAR_MIN_N:
        return "clear"
    return "moderate"
