import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from labels import (
    ALL_ORGANS,
    CATEGORIES,
    ORGANS,
    ORGAN_KEYS,
    OUTCOME_LABELS,
    OUTCOME_ORGANS,
    compute_signal_level,
    outcomes_for_organ,
)

# Les 21 complications du corpus rein d'origine : elles ne changent pas.
KIDNEY_ORIGINAL_21 = [
    "ABMR", "TCMR", "acute_rejection", "chronic_rejection", "mixed_rejection",
    "DSA", "sensitization", "complement_activation", "HLA_mismatch_outcome",
    "DGF", "graft_loss", "graft_survival", "eGFR", "BK_nephropathy", "CMV",
    "PTLD", "skin_cancer", "NODAT", "recurrent_GN", "FSGS", "IgA_nephropathy",
]


class TestLabels(unittest.TestCase):
    def test_outcome_vocabulary_size(self):
        # 21 complications du rein + 25 propres aux autres organes ou partagees.
        self.assertEqual(len(OUTCOME_LABELS), 46)

    def test_the_original_21_kidney_outcomes_are_kept_verbatim(self):
        for key in KIDNEY_ORIGINAL_21:
            self.assertIn(key, OUTCOME_LABELS)
            self.assertIn("kidney", OUTCOME_ORGANS[key], key)
        self.assertEqual(
            OUTCOME_LABELS["FSGS"],
            ("Hyalinose segmentaire et focale (HSF)", "Recidive"),
        )

    def test_exactly_9_categories(self):
        self.assertEqual(len(CATEGORIES), 9)
        self.assertEqual(CATEGORIES[:7], [
            "Rejet", "Immunisation", "Fonction du greffon", "Infection",
            "Neoplasie", "Metabolique", "Recidive",
        ])

    def test_every_outcome_has_label_and_known_category(self):
        for key, (label, category) in OUTCOME_LABELS.items():
            self.assertTrue(label, f"{key} sans libelle")
            self.assertIn(category, CATEGORIES, f"{key}: categorie inconnue")

    def test_no_technical_key_leaks_into_label(self):
        # Un libelle ne doit jamais etre la cle brute
        for key, (label, _) in OUTCOME_LABELS.items():
            self.assertNotEqual(label, key, f"{key}: libelle == cle brute")
            self.assertNotIn("_", label, f"{key}: underscore dans le libelle")

    def test_known_labels_verbatim(self):
        self.assertEqual(OUTCOME_LABELS["ABMR"], ("Rejet humoral (ABMR)", "Rejet"))
        self.assertEqual(
            OUTCOME_LABELS["DSA"],
            ("Anticorps anti-HLA du donneur (DSA)", "Immunisation"),
        )
        self.assertEqual(
            OUTCOME_LABELS["graft_loss"], ("Perte du greffon", "Fonction du greffon")
        )


class TestOrganVocabulary(unittest.TestCase):
    def test_seven_organs_with_stable_keys_and_french_labels(self):
        self.assertEqual(
            ORGAN_KEYS,
            ["kidney", "liver", "heart", "lung", "hsct", "pancreas", "intestine"],
        )
        self.assertNotIn(ALL_ORGANS, ORGAN_KEYS)
        labels = {key: label for key, label, _, _ in ORGANS}
        self.assertEqual(labels["heart"], "Cœur")
        self.assertIn("GCSH", labels["hsct"])
        self.assertIn("hématopoïétiques", labels["hsct"])

    def test_slugs_are_unique_ascii_and_not_keys_in_disguise(self):
        slugs = [slug for _, _, _, slug in ORGANS]
        self.assertEqual(len(slugs), len(set(slugs)))
        for slug in slugs:
            self.assertRegex(slug, r"^[a-z]+$")
        self.assertEqual(
            dict((k, s) for k, _, _, s in ORGANS)["heart"], "coeur"
        )

    def test_every_outcome_has_organs_and_only_known_ones(self):
        self.assertEqual(set(OUTCOME_ORGANS), set(OUTCOME_LABELS))
        for key, organs in OUTCOME_ORGANS.items():
            self.assertTrue(organs, f"{key}: aucun organe")
            for organ in organs:
                self.assertIn(organ, ORGAN_KEYS, f"{key}: organe {organ} inconnu")
            self.assertEqual(len(organs), len(set(organs)))

    def test_every_organ_has_a_workable_outcome_list(self):
        for organ in ORGAN_KEYS:
            self.assertGreaterEqual(len(outcomes_for_organ(organ)), 12, organ)
        self.assertEqual(len(outcomes_for_organ("kidney")), 23)

    def test_organ_specific_outcomes_are_not_shared_by_accident(self):
        self.assertEqual(OUTCOME_ORGANS["cardiac_allograft_vasculopathy"], ("heart",))
        self.assertEqual(OUTCOME_ORGANS["bronchiolitis_obliterans"], ("lung",))
        self.assertEqual(OUTCOME_ORGANS["chronic_gvhd"], ("hsct",))
        self.assertNotIn("kidney", OUTCOME_ORGANS["acute_gvhd"])
        # Les complications partagees couvrent tous les organes.
        for key in ("DSA", "CMV", "PTLD", "patient_mortality", "HLA_mismatch_outcome"):
            self.assertEqual(set(OUTCOME_ORGANS[key]), set(ORGAN_KEYS), key)

    def test_labels_never_use_causal_wording(self):
        causal = ("associé à", "lié à", "risque de", "provoque", "entraîne")
        for key, (label, _) in OUTCOME_LABELS.items():
            for term in causal:
                self.assertNotIn(term, label.lower(), key)


class TestSignalLevel(unittest.TestCase):
    def test_inverse_wins_over_everything(self):
        # OR<1 + FDR bilateral significatif => inverse, meme avec n eleve
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=50, fdr=0.001, odds_ratio=0.3, fdr_two_sided=0.01
            ),
            "inverse",
        )

    def test_strong_requires_fdr_and_n10(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=10, fdr=0.01, odds_ratio=5.0, fdr_two_sided=0.02
            ),
            "strong",
        )

    def test_clear_at_n3(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=3, fdr=0.01, odds_ratio=5.0, fdr_two_sided=0.02
            ),
            "clear",
        )

    def test_moderate_below_n3(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=2, fdr=0.01, odds_ratio=5.0, fdr_two_sided=0.02
            ),
            "moderate",
        )

    def test_weak_when_not_significant(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=99, fdr=0.5, odds_ratio=5.0, fdr_two_sided=0.6
            ),
            "weak",
        )

    def test_or_below_1_but_not_significant_is_not_inverse(self):
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=4, fdr=0.5, odds_ratio=0.4, fdr_two_sided=0.9
            ),
            "weak",
        )

    def test_handles_none_values(self):
        # odds_ratio et fdr_two_sided peuvent etre absents
        self.assertEqual(
            compute_signal_level(
                n_cooccurrence=12, fdr=0.001, odds_ratio=None, fdr_two_sided=None
            ),
            "strong",
        )


if __name__ == "__main__":
    unittest.main()
