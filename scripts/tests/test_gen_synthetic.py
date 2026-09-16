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


class TestAssociationCoherence(unittest.TestCase):
    """Couverture ajoutee apres revue : coherence interne des statistiques.

    La suite du brief verifiait les bornes de npmi et fdr, mais rien
    n'interdisait a une meme ligne de publier "fortement co-citee" (npmi > 0)
    et "fortement protectrice" (OR < 1, p ~ 1e-8) a partir de deux tables de
    contingence differentes. Ces tests verrouillent la table unique.
    """

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        gen_synthetic.main(out_dir=cls.out, n_articles=200, seed=7)
        cls.assoc = read_csv(cls.out / "associations.csv")
        cls.mentions = read_csv(cls.out / "pair_mentions.csv")
        cls.articles = read_csv(cls.out / "articles.csv")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_npmi_and_odds_ratio_agree_in_direction(self):
        # Le coeur de la revue : une ligne ne peut pas se contredire.
        # On exclut la bande nulle, ou la correction de continuite (+0.5) de
        # Haldane-Anscombe peut faire basculer le signe d'un OR quasi egal a 1
        # sans que cela traduise la moindre contradiction de fond.
        for row in self.assoc:
            npmi = float(row["npmi"])
            odds_ratio = float(row["odds_ratio"])
            if abs(npmi) < 0.05 or abs(odds_ratio - 1.0) < 0.20:
                continue
            self.assertEqual(
                npmi > 0,
                odds_ratio > 1.0,
                f"{row['hla']}/{row['outcome']}: npmi={npmi} "
                f"contredit odds_ratio={odds_ratio}",
            )

    def test_contingency_table_is_reconstructible(self):
        # Un consommateur doit pouvoir refaire le calcul depuis les colonnes
        # publiees : pas de table rescalee, pas d'ajustement invisible.
        for row in self.assoc:
            n_ab = int(row["n_cooccurrence"])
            n_a = int(row["n_hla_total"])
            n_b = int(row["n_outcome_total"])
            n_universe = int(row["n_universe"])
            a = min(n_ab, n_a, n_b)
            b, c = n_a - a, n_b - a
            d = n_universe - a - b - c
            self.assertGreaterEqual(b, 0)
            self.assertGreaterEqual(c, 0)
            self.assertGreaterEqual(d, 0, f"{row['hla']}/{row['outcome']}: d<0")
            self.assertEqual(a + b + c + d, n_universe)

    def test_marginals_match_the_actual_data(self):
        # n_hla_total / n_outcome_total / n_universe doivent decrire le corpus
        # reellement emis, pas des nombres decoratifs.
        from collections import defaultdict

        hla_articles = defaultdict(set)
        outcome_articles = defaultdict(set)
        for m in self.mentions:
            hla_articles[m["hla"]].add(m["pmid"])
            outcome_articles[m["outcome"]].add(m["pmid"])

        for row in self.assoc:
            self.assertEqual(
                int(row["n_hla_total"]), len(hla_articles[row["hla"]]),
                f"n_hla_total incoherent pour {row['hla']}",
            )
            self.assertEqual(
                int(row["n_outcome_total"]), len(outcome_articles[row["outcome"]]),
                f"n_outcome_total incoherent pour {row['outcome']}",
            )
            self.assertEqual(int(row["n_universe"]), len(self.articles))

    def test_all_probability_columns_within_bounds(self):
        # La suite du brief ne testait ni fdr_two_sided ni aucune p-value.
        for row in self.assoc:
            for column in ("pval_fisher", "fdr", "pval_two_sided", "fdr_two_sided"):
                value = float(row[column])
                self.assertGreaterEqual(value, 0.0, f"{column}={value}")
                self.assertLessEqual(value, 1.0, f"{column}={value}")

    def test_pvalues_are_never_exactly_zero(self):
        # Un -log10(p) en aval ne doit jamais produire +inf.
        for row in self.assoc:
            self.assertGreater(float(row["pval_fisher"]), 0.0)
            self.assertGreater(float(row["pval_two_sided"]), 0.0)

    def test_inverse_signals_respect_minimum_n(self):
        # Pas de badge "protecteur" certifie sur une ou deux mentions.
        for row in self.assoc:
            if float(row["odds_ratio"]) < 1.0 and float(row["fdr_two_sided"]) < 0.05:
                self.assertGreaterEqual(
                    int(row["n_cooccurrence"]),
                    gen_synthetic.INVERSE_MIN_N,
                    f"{row['hla']}/{row['outcome']}: signal inverse sous le plancher",
                )

    def test_inverse_signals_are_genuinely_under_cooccurring(self):
        # Le signal inverse doit venir des comptages : l'observe doit etre
        # nettement sous l'attendu sous independance.
        inverse = [
            r for r in self.assoc
            if float(r["odds_ratio"]) < 1.0 and float(r["fdr_two_sided"]) < 0.05
        ]
        for row in inverse:
            n_ab = int(row["n_cooccurrence"])
            expected = (
                int(row["n_hla_total"]) * int(row["n_outcome_total"])
                / int(row["n_universe"])
            )
            self.assertLess(
                n_ab, expected,
                f"{row['hla']}/{row['outcome']}: {n_ab} >= attendu {expected:.1f}",
            )
            self.assertLess(
                float(row["npmi"]), 0.0,
                f"{row['hla']}/{row['outcome']}: signal inverse a npmi positif",
            )

    def test_every_csv_is_byte_identical_across_runs(self):
        # associations.csv porte le formatage des flottants et l'ordre du BH :
        # c'est la que se cacherait un non-determinisme, pas dans articles.csv.
        names = [
            "articles.csv",
            "authors.csv",
            "hla_entities.csv",
            "pair_mentions.csv",
            "associations.csv",
        ]
        with tempfile.TemporaryDirectory() as d2:
            gen_synthetic.main(out_dir=Path(d2), n_articles=200, seed=7)
            for name in names:
                self.assertEqual(
                    (self.out / name).read_bytes(),
                    (Path(d2) / name).read_bytes(),
                    f"{name} non deterministe a seed fixee",
                )


if __name__ == "__main__":
    unittest.main()
