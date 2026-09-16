import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import gen_synthetic
from labels import OUTCOME_LABELS


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


class TestGenSynthetic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        gen_synthetic.main(out_dir=cls.out, n_articles=120, seed=42)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_all_expected_files_exist(self):
        for name in [
            "articles.csv",
            "authors.csv",
            "hla_entities.csv",
            "pair_mentions.csv",
            "associations.csv",
        ]:
            self.assertTrue((self.out / name).exists(), f"{name} manquant")

    def test_article_count_matches_request(self):
        self.assertEqual(len(read_csv(self.out / "articles.csv")), 120)

    def test_pmids_are_unique(self):
        pmids = [r["pmid"] for r in read_csv(self.out / "articles.csv")]
        self.assertEqual(len(pmids), len(set(pmids)))

    def test_hla_hierarchy_is_acyclic_and_resolves(self):
        rows = read_csv(self.out / "hla_entities.csv")
        known = {r["hla"] for r in rows}
        parents = {r["hla"]: (r["parent_hla"] or None) for r in rows}
        for hla, parent in parents.items():
            if parent:
                self.assertIn(parent, known, f"{hla}: parent {parent} inconnu")
        # acyclicite : remonter jusqu'a la racine termine toujours
        for hla in parents:
            seen, cur, depth = set(), hla, 0
            while cur and depth < 20:
                self.assertNotIn(cur, seen, f"cycle detecte sur {hla}")
                seen.add(cur)
                cur = parents.get(cur)
                depth += 1
            self.assertLess(depth, 20, f"{hla}: chaine trop profonde")

    def test_pair_mentions_reference_known_entities(self):
        articles = {r["pmid"] for r in read_csv(self.out / "articles.csv")}
        hlas = {r["hla"] for r in read_csv(self.out / "hla_entities.csv")}
        for row in read_csv(self.out / "pair_mentions.csv"):
            self.assertIn(row["pmid"], articles)
            self.assertIn(row["hla"], hlas)
            self.assertIn(row["outcome"], OUTCOME_LABELS)

    def test_sentence_contains_its_spans(self):
        # Le surlignage cote UI depend de cette propriete.
        for row in read_csv(self.out / "pair_mentions.csv"):
            self.assertIn(row["hla_span"], row["sentence"])
            self.assertIn(row["outcome_span"], row["sentence"])

    def test_negated_rows_carry_a_trigger(self):
        for row in read_csv(self.out / "pair_mentions.csv"):
            if row["polarity"] == "negated":
                self.assertTrue(row["negation_trigger"])

    def test_associations_counts_are_coherent(self):
        for row in read_csv(self.out / "associations.csv"):
            n = int(row["n_cooccurrence"])
            self.assertEqual(n, int(row["n_positive"]) + int(row["n_negated"]))

    def test_associations_match_pair_mention_counts(self):
        # Validation V3 du builder : tout agregat est derivable.
        from collections import Counter

        counts = Counter(
            (r["hla"], r["outcome"]) for r in read_csv(self.out / "pair_mentions.csv")
        )
        for row in read_csv(self.out / "associations.csv"):
            key = (row["hla"], row["outcome"])
            self.assertEqual(int(row["n_cooccurrence"]), counts[key], f"{key}")

    def test_metrics_within_bounds(self):
        for row in read_csv(self.out / "associations.csv"):
            self.assertGreaterEqual(float(row["npmi"]), -1.0)
            self.assertLessEqual(float(row["npmi"]), 1.0)
            self.assertGreaterEqual(float(row["fdr"]), 0.0)
            self.assertLessEqual(float(row["fdr"]), 1.0)

    def test_years_are_plausible(self):
        for row in read_csv(self.out / "articles.csv"):
            self.assertGreaterEqual(int(row["year"]), 1990)
            self.assertLessEqual(int(row["year"]), 2026)

    def test_generation_is_deterministic(self):
        with tempfile.TemporaryDirectory() as d2:
            gen_synthetic.main(out_dir=Path(d2), n_articles=120, seed=42)
            a = (self.out / "articles.csv").read_text(encoding="utf-8")
            b = (Path(d2) / "articles.csv").read_text(encoding="utf-8")
            self.assertEqual(a, b, "generation non deterministe a seed fixee")

    def test_includes_at_least_one_inverse_signal_candidate(self):
        # L'UI doit pouvoir demontrer le badge "signal inverse".
        rows = read_csv(self.out / "associations.csv")
        inverse = [
            r
            for r in rows
            if float(r["odds_ratio"]) < 1.0 and float(r["fdr_two_sided"]) < 0.05
        ]
        self.assertGreater(len(inverse), 0, "aucun signal inverse genere")


if __name__ == "__main__":
    unittest.main()
