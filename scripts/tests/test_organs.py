"""Tests de la dimension ORGANE : generation, strates statistiques, builder.

La stratification est la garantie centrale du site multi-organe : un chiffre
affiche pour le coeur ne doit JAMAIS etre calcule avec un denominateur d'un
autre organe (ni avec celui de « tous les organes »). Ces tests le verrouillent
sur un exemple minuscule recalcule a la main, puis sur un corpus construit.
"""

import csv
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_sqlite
import gen_synthetic
from build_sqlite import ValidationError
from labels import ALL_ORGANS, ORGAN_KEYS, OUTCOME_LABELS, OUTCOME_ORGANS


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------------
# Exemple recalcule a la main
# ---------------------------------------------------------------------

def _article(pmid, organs, year=2015):
    return {"pmid": pmid, "year": year, "organs": organs}


def _mention(pmid, hla, outcome, polarity="positive"):
    return {"pmid": pmid, "hla": hla, "outcome": outcome, "polarity": polarity}


class TestHandComputedStrata(unittest.TestCase):
    """Cinq articles : rein (A1, A2), coeur (A3, A4), rein+coeur (A5).

        A1 [rein]        A*02-DSA, A*02-CMV
        A2 [rein]        A*02-DSA
        A3 [coeur]       B*07-DSA
        A4 [coeur]       A*02-CMV
        A5 [rein;coeur]  A*02-DSA

    Denominateurs : all = 5, rein = 3 (A1, A2, A5), coeur = 3 (A3, A4, A5).
    """

    @classmethod
    def setUpClass(cls):
        articles = [
            _article("1", "kidney"), _article("2", "kidney"),
            _article("3", "heart"), _article("4", "heart"),
            _article("5", "kidney;heart"),
        ]
        mentions = [
            _mention("1", "HLA-A*02", "DSA"), _mention("1", "HLA-A*02", "CMV"),
            _mention("2", "HLA-A*02", "DSA"),
            _mention("3", "HLA-B*07", "DSA"),
            _mention("4", "HLA-A*02", "CMV"),
            _mention("5", "HLA-A*02", "DSA"),
        ]
        rows = gen_synthetic.aggregate_strata(articles, mentions)
        cls.by = {(r["organ"], r["hla"], r["outcome"]): r for r in rows}

    def test_each_stratum_has_its_own_denominator(self):
        pair = ("HLA-A*02", "DSA")
        self.assertEqual(self.by[("all",) + pair]["n_universe"], 5)
        self.assertEqual(self.by[("kidney",) + pair]["n_universe"], 3)
        self.assertEqual(self.by[("heart",) + pair]["n_universe"], 3)

    def test_counts_per_stratum_for_a02_dsa(self):
        pair = ("HLA-A*02", "DSA")
        # all : A1, A2, A5 portent la paire ; A*02 est cite par A1, A2, A4, A5 ;
        #       DSA par A1, A2, A3, A5.
        r = self.by[("all",) + pair]
        self.assertEqual((r["n_cooccurrence"], r["n_hla_total"], r["n_outcome_total"]), (3, 4, 4))
        # rein : A1, A2, A5 -> tout le monde cite A*02 et DSA.
        r = self.by[("kidney",) + pair]
        self.assertEqual((r["n_cooccurrence"], r["n_hla_total"], r["n_outcome_total"]), (3, 3, 3))
        # coeur : A5 seul porte la paire ; A*02 (A4, A5) ; DSA (A3, A5).
        r = self.by[("heart",) + pair]
        self.assertEqual((r["n_cooccurrence"], r["n_hla_total"], r["n_outcome_total"]), (1, 2, 2))

    def test_odds_ratio_is_computed_in_the_stratum_table(self):
        # Table 2x2 puis OR de Haldane-Anscombe (+0.5 a chaque case).
        pair = ("HLA-A*02", "DSA")
        # all : a=3 b=1 c=1 d=0 -> (3.5 * 0.5) / (1.5 * 1.5)
        self.assertAlmostEqual(
            self.by[("all",) + pair]["odds_ratio"], (3.5 * 0.5) / (1.5 * 1.5), places=5
        )
        # coeur : a=1 b=1 c=1 d=0 -> (1.5 * 0.5) / (1.5 * 1.5)
        self.assertAlmostEqual(
            self.by[("heart",) + pair]["odds_ratio"], (1.5 * 0.5) / (1.5 * 1.5), places=5
        )
        # rein : a=3 b=0 c=0 d=0 -> (3.5 * 0.5) / (0.5 * 0.5)
        self.assertAlmostEqual(
            self.by[("kidney",) + pair]["odds_ratio"], (3.5 * 0.5) / (0.5 * 0.5), places=5
        )

    def test_fisher_p_value_of_the_all_stratum(self):
        # all : table [[3, 1], [1, 0]], marges 4 / 1 / 4 / 1, total 5.
        # P(X >= 3) = P(3) + P(4) = 4/5 + 1/5 = 1.
        r = self.by[("all", "HLA-A*02", "DSA")]
        self.assertAlmostEqual(r["pval_fisher"], 1.0, places=6)

    def test_npmi_of_the_heart_stratum(self):
        # coeur : p(ab) = 1/3, p(a) = p(b) = 2/3 -> pmi = ln((1/3)/(4/9)) ;
        # npmi = pmi / -ln(1/3).
        import math

        r = self.by[("heart", "HLA-A*02", "DSA")]
        pmi = math.log((1 / 3) / ((2 / 3) * (2 / 3)))
        self.assertAlmostEqual(r["pmi"], pmi, places=5)
        self.assertAlmostEqual(r["npmi"], pmi / -math.log(1 / 3), places=5)

    def test_pairs_absent_from_a_stratum_have_no_row_there(self):
        # B*07-DSA n'existe que dans A3 (coeur) : pas de ligne en rein.
        self.assertIn(("heart", "HLA-B*07", "DSA"), self.by)
        self.assertIn(("all", "HLA-B*07", "DSA"), self.by)
        self.assertNotIn(("kidney", "HLA-B*07", "DSA"), self.by)

    def test_multi_organ_article_counts_in_each_stratum_and_in_all(self):
        # A5 [rein;coeur] porte A*02-DSA : il compte une fois dans chaque strate.
        for stratum in ("all", "kidney", "heart"):
            self.assertGreaterEqual(
                self.by[(stratum, "HLA-A*02", "DSA")]["n_cooccurrence"], 1
            )
        total_by_organ = sum(
            self.by[(o, "HLA-A*02", "DSA")]["n_cooccurrence"] for o in ("kidney", "heart")
        )
        self.assertEqual(total_by_organ, 3 + 1)
        self.assertEqual(self.by[("all", "HLA-A*02", "DSA")]["n_cooccurrence"], 3)

    def test_fdr_family_is_the_stratum(self):
        # Une strate sans paire testable n'herite pas de la famille d'une autre.
        for r in self.by.values():
            self.assertGreaterEqual(r["fdr"], 0.0)
            self.assertLessEqual(r["fdr"], 1.0)


# ---------------------------------------------------------------------
# Generateur
# ---------------------------------------------------------------------

class TestGeneratedOrgans(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        gen_synthetic.main(out_dir=cls.out, n_articles=600, seed=11)
        cls.articles = read_csv(cls.out / "articles.csv")
        cls.mentions = read_csv(cls.out / "pair_mentions.csv")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_every_article_has_at_least_one_known_organ(self):
        for a in self.articles:
            organs = a["organs"].split(";")
            self.assertTrue(organs and all(organs), a["pmid"])
            for organ in organs:
                self.assertIn(organ, ORGAN_KEYS)
            self.assertEqual(len(organs), len(set(organs)))

    def test_every_organ_has_articles(self):
        seen = {o for a in self.articles for o in a["organs"].split(";")}
        self.assertEqual(seen, set(ORGAN_KEYS))

    def test_kidney_is_the_largest_stratum_and_intestine_the_smallest(self):
        counts = Counter(o for a in self.articles for o in a["organs"].split(";"))
        self.assertEqual(counts.most_common(1)[0][0], "kidney")
        self.assertEqual(min(counts, key=counts.get), "intestine")
        # GCSH : l'HLA y pese lourd, la strate n'est pas une niche.
        self.assertGreater(counts["hsct"], counts["pancreas"])

    def test_some_articles_are_multi_organ(self):
        multi = [a for a in self.articles if ";" in a["organs"]]
        self.assertGreater(len(multi), 0)
        self.assertLess(len(multi), len(self.articles) * 0.25)
        for a in multi:
            self.assertEqual(a["graft_assignment"], "Multi-organ")

    def test_every_mentioned_outcome_applies_to_an_organ_of_its_article(self):
        organs_of = {a["pmid"]: a["organs"].split(";") for a in self.articles}
        for m in self.mentions:
            self.assertTrue(
                any(o in OUTCOME_ORGANS[m["outcome"]] for o in organs_of[m["pmid"]]),
                f"{m['pmid']}: {m['outcome']} hors du champ de {organs_of[m['pmid']]}",
            )

    def test_organ_specific_outcomes_only_appear_in_their_organ(self):
        organs_of = {a["pmid"]: a["organs"].split(";") for a in self.articles}
        # Les GVH n'apparaissent que dans des articles GCSH ou intestin.
        for m in self.mentions:
            if m["outcome"] in ("chronic_gvhd", "acute_gvhd"):
                self.assertTrue(
                    {"hsct", "intestine"} & set(organs_of[m["pmid"]]), m["outcome"]
                )

    def test_titles_do_not_name_the_wrong_organ(self):
        for a in self.articles:
            if a["organs"] == "heart":
                self.assertNotIn("kidney", a["title"].lower())
                self.assertNotIn("renal", a["title"].lower())

    def test_organs_csv_lists_all_seven(self):
        rows = read_csv(self.out / "organs.csv")
        self.assertEqual([r["organ"] for r in rows], ORGAN_KEYS)
        self.assertNotIn(ALL_ORGANS, [r["organ"] for r in rows])

    def test_generation_is_deterministic_for_organs(self):
        with tempfile.TemporaryDirectory() as d2:
            gen_synthetic.main(out_dir=Path(d2), n_articles=600, seed=11)
            self.assertEqual(
                (self.out / "articles.csv").read_bytes(),
                (Path(d2) / "articles.csv").read_bytes(),
            )

    def test_strata_rows_exist_for_all_and_each_organ(self):
        rows = read_csv(self.out / "associations.csv")
        self.assertEqual({r["organ"] for r in rows}, {ALL_ORGANS} | set(ORGAN_KEYS))


# ---------------------------------------------------------------------
# Builder : validations V11-V16 et tables
# ---------------------------------------------------------------------

class OrganBuilderBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.src = self.root / "src"
        self.out = self.root / "corpus_test.sqlite"
        gen_synthetic.main(out_dir=self.src, n_articles=120, seed=5)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, **kwargs):
        return build_sqlite.build(
            source_dir=self.src, out_path=self.out, version="A-test",
            universe="A", is_synthetic=True, notes="test", **kwargs,
        )

    def corrupt(self, filename, mutate):
        path = self.src / filename
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            fields = reader.fieldnames
            rows = list(reader)
        rows = mutate(rows)
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)


class TestOrganValidations(OrganBuilderBase):
    def test_v11_rejects_an_article_without_organ(self):
        def mutate(rows):
            rows[3]["organs"] = ""
            return rows

        self.corrupt("articles.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V11", str(ctx.exception))
        self.assertFalse(self.out.exists())

    def test_v11_rejects_an_unknown_organ(self):
        def mutate(rows):
            rows[0]["organs"] = "kidney;brain"
            return rows

        self.corrupt("articles.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V11", str(ctx.exception))

    def test_v11_rejects_a_repeated_organ(self):
        def mutate(rows):
            rows[0]["organs"] = "kidney;kidney"
            return rows

        self.corrupt("articles.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V11", str(ctx.exception))

    def test_v12_rejects_a_declared_organ_without_articles(self):
        def mutate(rows):
            for r in rows:
                r["organs"] = ";".join(
                    o for o in r["organs"].split(";") if o != "intestine"
                ) or "kidney"
            return rows

        self.corrupt("articles.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V12", str(ctx.exception))

    def test_v13_rejects_an_unknown_stratum(self):
        def mutate(rows):
            rows[0]["organ"] = "brain"
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V13", str(ctx.exception))

    def test_v13_rejects_a_duplicated_stratum_row(self):
        def mutate(rows):
            rows.append(dict(rows[0]))
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V1", str(ctx.exception))

    def test_v3_is_checked_inside_each_stratum(self):
        # Une ligne de strate « coeur » dont l'effectif est celui de « all ».
        def mutate(rows):
            for r in rows:
                if r["organ"] == "heart" and int(r["n_cooccurrence"]) >= 1:
                    r["n_cooccurrence"] = str(int(r["n_cooccurrence"]) + 3)
                    r["n_positive"] = str(int(r["n_positive"]) + 3)
                    break
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V3", str(ctx.exception))
        self.assertIn("heart", str(ctx.exception))

    def test_v14_rejects_a_denominator_from_another_stratum(self):
        # Le piege que la stratification evite : calculer une ligne du rein avec
        # le denominateur de « tous les organes ».
        def mutate(rows):
            n_all = max(int(r["n_universe"]) for r in rows if r["organ"] == "all")
            for r in rows:
                if r["organ"] == "kidney":
                    r["n_universe"] = str(n_all)
                    break
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V14", str(ctx.exception))

    def test_v14_rejects_a_wrong_margin(self):
        def mutate(rows):
            for r in rows:
                if r["organ"] == "lung":
                    r["n_hla_total"] = str(int(r["n_hla_total"]) + 1)
                    break
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V14", str(ctx.exception))

    def test_v16_rejects_an_outcome_outside_the_article_organs(self):
        def mutate(rows):
            organs = {
                a["pmid"]: a["organs"]
                for a in read_csv(self.src / "articles.csv")
            }
            for r in rows:
                if organs[r["pmid"]] == "kidney":
                    r["outcome"] = "chronic_gvhd"
                    break
            return rows

        self.corrupt("pair_mentions.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V16", str(ctx.exception))
        self.assertFalse(self.out.exists())

    def test_missing_organs_column_is_refused(self):
        def mutate(rows):
            for r in rows:
                r.pop("organs", None)
            return rows

        path = self.src / "articles.csv"
        with open(path, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            fields = [c for c in reader.fieldnames if c != "organs"]
            rows = mutate(list(reader))
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V11", str(ctx.exception))

    def test_clean_data_builds_with_the_off_organ_flag_too(self):
        self.build(allow_off_organ_outcomes=True)
        self.assertTrue(self.out.exists())


class TestOrganTables(OrganBuilderBase):
    def setUp(self):
        super().setUp()
        self.build()
        self.con = sqlite3.connect(self.out)

    def tearDown(self):
        self.con.close()
        super().tearDown()

    def q(self, sql, *args):
        return self.con.execute(sql, args).fetchall()

    def test_organs_table_has_the_vocabulary_and_recounted_articles(self):
        rows = self.q("SELECT organ, label, short_label, slug, n_articles FROM organs ORDER BY sort_order")
        self.assertEqual([r[0] for r in rows], ORGAN_KEYS)
        for organ, label, short, slug, n in rows:
            actual = self.q("SELECT COUNT(*) FROM article_organs WHERE organ = ?", organ)[0][0]
            self.assertEqual(n, actual, organ)
            self.assertTrue(label and short and slug)

    def test_every_article_has_an_organ_and_one_primary(self):
        self.assertEqual(
            self.q("SELECT COUNT(*) FROM articles a WHERE NOT EXISTS "
                   "(SELECT 1 FROM article_organs o WHERE o.pmid = a.pmid)")[0][0],
            0,
        )
        self.assertEqual(
            self.q("SELECT COUNT(*) FROM (SELECT pmid FROM article_organs "
                   "GROUP BY pmid HAVING SUM(is_primary) <> 1)")[0][0],
            0,
        )

    def test_strata_denominators_match_the_organs_table(self):
        n_all = self.q("SELECT COUNT(*) FROM articles")[0][0]
        for organ, n in self.q("SELECT organ, n_articles FROM organs"):
            for (u,) in self.q(
                "SELECT DISTINCT n_universe FROM associations WHERE organ = ?", organ
            ):
                self.assertEqual(u, n, organ)
        for (u,) in self.q("SELECT DISTINCT n_universe FROM associations WHERE organ = 'all'"):
            self.assertEqual(u, n_all)

    def test_stratum_counts_never_exceed_the_stratum(self):
        bad = self.q(
            "SELECT COUNT(*) FROM associations "
            "WHERE n_hla_total > n_universe OR n_outcome_total > n_universe"
        )[0][0]
        self.assertEqual(bad, 0)

    def test_sum_of_organ_strata_covers_all(self):
        # Un article compte dans >= 1 strate d'organe : la somme des strates
        # d'organe est >= a « all », et chaque strate d'organe est <= « all ».
        n_all = self.q("SELECT COUNT(*) FROM articles")[0][0]
        n_sum = self.q("SELECT SUM(n_articles) FROM organs")[0][0]
        self.assertGreaterEqual(n_sum, n_all)
        for (n,) in self.q("SELECT n_articles FROM organs"):
            self.assertLessEqual(n, n_all)
        rows = self.q(
            "SELECT a.hla, a.outcome, a.n_cooccurrence, "
            "(SELECT SUM(b.n_cooccurrence) FROM associations b "
            "  WHERE b.organ <> 'all' AND b.hla = a.hla AND b.outcome = a.outcome) "
            "FROM associations a WHERE a.organ = 'all'"
        )
        self.assertGreater(len(rows), 0)
        for hla, outcome, n_all_pair, n_org_sum in rows:
            self.assertGreaterEqual(n_org_sum, n_all_pair, (hla, outcome))

    def test_association_primary_key_includes_the_stratum(self):
        # La meme paire existe dans plusieurs strates.
        n = self.q(
            "SELECT COUNT(*) FROM (SELECT hla, outcome FROM associations "
            "GROUP BY hla, outcome HAVING COUNT(*) > 1)"
        )[0][0]
        self.assertGreater(n, 0)

    def test_outcome_organs_follow_the_vocabulary(self):
        rows = self.q("SELECT outcome, organ FROM outcome_organs")
        self.assertGreater(len(rows), 0)
        for outcome, organ in rows:
            self.assertIn(organ, OUTCOME_ORGANS[outcome])
        present = {r[0] for r in self.q("SELECT outcome FROM outcomes")}
        self.assertEqual({o for o, _ in rows}, present)

    def test_hla_and_outcome_organ_counts_are_consistent(self):
        # all >= chaque organe ; les articles par allele recomptes a la main.
        row = self.q(
            "SELECT hla FROM hla_organ_counts WHERE organ = 'all' "
            "ORDER BY n_articles DESC LIMIT 1"
        )[0][0]
        n_all = self.q(
            "SELECT n_articles FROM hla_organ_counts WHERE organ='all' AND hla=?", row
        )[0][0]
        actual = self.q(
            "SELECT COUNT(DISTINCT pmid) FROM hla_mentions WHERE hla = ?", row
        )[0][0]
        self.assertEqual(n_all, actual)
        for organ, n in self.q(
            "SELECT organ, n_articles FROM hla_organ_counts WHERE hla = ? AND organ <> 'all'", row
        ):
            self.assertLessEqual(n, n_all)
            via_join = self.q(
                "SELECT COUNT(DISTINCT hm.pmid) FROM hla_mentions hm "
                "JOIN article_organs ao ON ao.pmid = hm.pmid "
                "WHERE hm.hla = ? AND ao.organ = ?", row, organ
            )[0][0]
            self.assertEqual(n, via_join, (row, organ))

    def test_annual_counts_per_stratum_sum_to_the_stratum(self):
        for organ, n in self.q("SELECT organ, n_articles FROM organs"):
            total = self.q("SELECT SUM(n) FROM annual_counts WHERE organ = ?", organ)[0][0]
            self.assertEqual(total, n, organ)
        total = self.q("SELECT SUM(n) FROM annual_counts WHERE organ = 'all'")[0][0]
        self.assertEqual(total, self.q("SELECT COUNT(*) FROM articles")[0][0])

    def test_timeline_matches_associations_per_stratum(self):
        for organ, hla, outcome, n in self.q(
            "SELECT organ, hla, outcome, n_cooccurrence FROM associations LIMIT 400"
        ):
            total = self.q(
                "SELECT SUM(n) FROM association_timeline "
                "WHERE organ = ? AND hla = ? AND outcome = ?", organ, hla, outcome
            )[0][0]
            self.assertEqual(total, n, (organ, hla, outcome))

    def test_build_is_reproducible_with_organs(self):
        sha1 = self.build()
        sha2 = self.build()
        self.assertEqual(sha1, sha2)


class TestDeclaredOrgansFallback(OrganBuilderBase):
    def test_without_organs_csv_organs_are_derived_from_articles(self):
        (self.src / "organs.csv").unlink()
        self.build()
        con = sqlite3.connect(self.out)
        n = con.execute("SELECT COUNT(*) FROM organs").fetchone()[0]
        con.close()
        self.assertEqual(n, len(ORGAN_KEYS))

    def test_organs_csv_may_restrict_the_corpus_to_one_organ(self):
        # Corpus reel « rein seul » : un organs.csv a une ligne, tous les
        # articles sont du rein.
        def keep_kidney(rows):
            for r in rows:
                r["organs"] = "kidney"
            return rows

        # On reconstruit une source coherente : tous les articles en rein, et
        # seules les mentions de complications du rein restent.
        self.corrupt("articles.csv", keep_kidney)
        allowed = {k for k, v in OUTCOME_ORGANS.items() if "kidney" in v}
        pmids = {a["pmid"] for a in read_csv(self.src / "articles.csv")}

        self.corrupt("pair_mentions.csv", lambda rows: [r for r in rows if r["outcome"] in allowed])
        mentions = read_csv(self.src / "pair_mentions.csv")
        organ_rows = [{"organ": "kidney", "label": "Rein", "short_label": "Rein", "slug": "rein"}]
        with open(self.src / "organs.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["organ", "label", "short_label", "slug"])
            w.writeheader()
            w.writerows(organ_rows)
        # Associations recalculees par le generateur lui-meme.
        articles = read_csv(self.src / "articles.csv")
        rows = gen_synthetic.aggregate_strata(articles, mentions)
        rows = [r for r in rows if r["organ"] in ("all", "kidney")]
        with open(self.src / "associations.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=gen_synthetic.ASSOCIATION_COLUMNS)
            w.writeheader()
            w.writerows(rows)
        self.assertTrue(pmids)
        self.build()
        con = sqlite3.connect(self.out)
        organs = [r[0] for r in con.execute("SELECT organ FROM organs")]
        con.close()
        self.assertEqual(organs, ["kidney"])


if __name__ == "__main__":
    unittest.main()
