"""Table de libelles cliniques et derivation du niveau de signal.

Source de verite partagee entre le builder Python et l'interface TypeScript
(cf. src/lib/labels.ts, qui doit rester synchronise).

Les cles techniques (graft_loss, recurrent_GN...) ne doivent JAMAIS etre
affichees a l'utilisateur : l'interface passe toujours par OUTCOME_LABELS.
"""

# Ordre d'affichage des categories sur la fiche allele.
CATEGORIES = [
    "Rejet",
    "Immunisation",
    "Fonction du greffon",
    "Infection",
    "Neoplasie",
    "Metabolique",
    "Recidive",
]

# {cle_pipeline: (libelle_affiche, categorie)}
OUTCOME_LABELS = {
    "ABMR": ("Rejet humoral (ABMR)", "Rejet"),
    "TCMR": ("Rejet cellulaire (TCMR)", "Rejet"),
    "acute_rejection": ("Rejet aigu", "Rejet"),
    "chronic_rejection": ("Rejet chronique / IFTA", "Rejet"),
    "mixed_rejection": ("Rejet mixte", "Rejet"),
    "DSA": ("Anticorps anti-HLA du donneur (DSA)", "Immunisation"),
    "sensitization": ("Immunisation / sensibilisation", "Immunisation"),
    "complement_activation": ("Activation du complement", "Immunisation"),
    "HLA_mismatch_outcome": ("Incompatibilite HLA", "Immunisation"),
    "DGF": ("Reprise retardee de fonction (DGF)", "Fonction du greffon"),
    "graft_loss": ("Perte du greffon", "Fonction du greffon"),
    "graft_survival": ("Survie du greffon", "Fonction du greffon"),
    "eGFR": ("Fonction renale (DFG estime)", "Fonction du greffon"),
    "BK_nephropathy": ("Nephropathie a BK virus", "Infection"),
    "CMV": ("Infection a CMV", "Infection"),
    "PTLD": ("Syndrome lymphoproliferatif (PTLD)", "Neoplasie"),
    "skin_cancer": ("Cancer cutane", "Neoplasie"),
    "NODAT": ("Diabete post-transplantation (NODAT)", "Metabolique"),
    "recurrent_GN": ("Recidive de glomerulonephrite", "Recidive"),
    "FSGS": ("Hyalinose segmentaire et focale (HSF)", "Recidive"),
    "IgA_nephropathy": ("Nephropathie a IgA", "Recidive"),
}

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
