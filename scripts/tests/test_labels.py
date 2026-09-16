import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from labels import OUTCOME_LABELS, CATEGORIES, compute_signal_level


class TestLabels(unittest.TestCase):
    def test_exactly_21_outcomes(self):
        self.assertEqual(len(OUTCOME_LABELS), 21)

    def test_exactly_7_categories(self):
        self.assertEqual(len(CATEGORIES), 7)

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
