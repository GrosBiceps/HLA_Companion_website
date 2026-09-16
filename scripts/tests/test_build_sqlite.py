import csv
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_sqlite
import gen_synthetic
from build_sqlite import ValidationError


class BuilderTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.src = self.root / "src"
        self.out = self.root / "corpus_test.sqlite"
        gen_synthetic.main(out_dir=self.src, n_articles=80, seed=7)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self):
        return build_sqlite.build(
            source_dir=self.src,
            out_path=self.out,
            version="A-test",
            universe="A",
            is_synthetic=True,
            notes="test",
        )


class TestBuildSuccess(BuilderTestBase):
    def test_build_produces_file_and_sha(self):
        sha = self.build()
        self.assertTrue(self.out.exists())
        self.assertEqual(len(sha), 64)
        sha_file = Path(str(self.out) + ".sha256")
        self.assertTrue(sha_file.exists())
        self.assertIn(sha, sha_file.read_text(encoding="utf-8"))

    def test_sha_matches_actual_file_content(self):
        sha = self.build()
        actual = hashlib.sha256(self.out.read_bytes()).hexdigest()
        self.assertEqual(sha, actual)

    def test_corpus_version_row_is_written(self):
        self.build()
        con = sqlite3.connect(self.out)
        row = con.execute(
            "SELECT version, universe, is_synthetic, n_articles FROM corpus_version"
        ).fetchone()
        self.assertEqual(row[0], "A-test")
        self.assertEqual(row[1], "A")
        self.assertEqual(row[2], 1)
        n_articles = con.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        self.assertEqual(row[3], n_articles)
        con.close()

    def test_outcomes_all_have_labels(self):
        self.build()
        con = sqlite3.connect(self.out)
        bad = con.execute(
            "SELECT outcome FROM outcomes WHERE label IS NULL OR label = '' "
            "OR label = outcome"
        ).fetchall()
        self.assertEqual(bad, [])
        con.close()

    def test_signal_level_is_computed_for_every_association(self):
        self.build()
        con = sqlite3.connect(self.out)
        bad = con.execute(
            "SELECT COUNT(*) FROM associations WHERE signal_level IS NULL"
        ).fetchone()[0]
        self.assertEqual(bad, 0)
        con.close()

    def test_denormalized_counters_are_filled(self):
        self.build()
        con = sqlite3.connect(self.out)
        # n_mentions d'une entite HLA == nombre de pair_mentions la citant
        for hla, n in con.execute(
            "SELECT hla, n_mentions FROM hla_entities WHERE n_mentions > 0"
        ).fetchall():
            actual = con.execute(
                "SELECT COUNT(*) FROM pair_mentions WHERE hla = ?", (hla,)
            ).fetchone()[0]
            self.assertEqual(n, actual, f"{hla}")
        con.close()

    def test_fts_index_is_populated_and_searchable(self):
        self.build()
        con = sqlite3.connect(self.out)
        n = con.execute("SELECT COUNT(*) FROM search_index").fetchone()[0]
        self.assertGreater(n, 0)
        hits = con.execute(
            "SELECT entity_id FROM search_index WHERE search_index MATCH 'DQB1'"
        ).fetchall()
        self.assertGreater(len(hits), 0)
        con.close()

    def test_foreign_keys_enforced_and_no_orphans(self):
        self.build()
        con = sqlite3.connect(self.out)
        con.execute("PRAGMA foreign_keys = ON")
        violations = con.execute("PRAGMA foreign_key_check").fetchall()
        self.assertEqual(violations, [])
        con.close()

    def test_build_is_reproducible(self):
        sha1 = self.build()
        self.out.unlink()
        Path(str(self.out) + ".sha256").unlink()
        sha2 = self.build()
        self.assertEqual(sha1, sha2, "build non reproductible")


class TestValidationsBlock(BuilderTestBase):
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

    def test_v3_rejects_association_count_mismatch(self):
        def mutate(rows):
            rows[0]["n_cooccurrence"] = str(int(rows[0]["n_cooccurrence"]) + 99)
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V3", str(ctx.exception))
        self.assertFalse(self.out.exists(), "fichier produit malgre l'echec")

    def test_v4_rejects_incoherent_polarity_counts(self):
        def mutate(rows):
            rows[0]["n_positive"] = str(int(rows[0]["n_positive"]) + 5)
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V4", str(ctx.exception))

    def test_v5_rejects_unresolvable_parent(self):
        def mutate(rows):
            for r in rows:
                if r["parent_hla"]:
                    r["parent_hla"] = "HLA-INEXISTANT*99"
                    break
            return rows

        self.corrupt("hla_entities.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V5", str(ctx.exception))

    def test_v6_rejects_npmi_out_of_bounds(self):
        def mutate(rows):
            rows[0]["npmi"] = "42.0"
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V6", str(ctx.exception))

    def test_v7_rejects_implausible_year(self):
        def mutate(rows):
            rows[0]["year"] = "1789"
            return rows

        self.corrupt("articles.csv", mutate)
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V7", str(ctx.exception))

    def test_no_partial_file_left_behind_on_failure(self):
        def mutate(rows):
            rows[0]["npmi"] = "99.0"
            return rows

        self.corrupt("associations.csv", mutate)
        with self.assertRaises(ValidationError):
            self.build()
        self.assertFalse(self.out.exists())
        self.assertFalse(Path(str(self.out) + ".sha256").exists())


if __name__ == "__main__":
    unittest.main()
