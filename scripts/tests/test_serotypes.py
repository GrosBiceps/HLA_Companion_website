"""Referentiel serologique : fichier de reference, projection et tables SQLite."""

import csv
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_sqlite
import gen_synthetic
from build_sqlite import ValidationError

REFERENCE_FILE = build_sqlite.DEFAULT_REFERENCE_DIR / build_sqlite.SEROTYPES_FILE

# Etiquettes serologiques de la carte v1 reelle (data/legacy/carte_v1_renal.json).
LEGACY_SEROTYPES = [
    "A23", "A24", "A25", "A28", "A30", "A66", "A68", "B13", "B18", "B27",
    "B35", "B44", "B46", "B51", "B59", "B65", "Cw14", "Cw17", "DQ2", "DQ5",
    "DQ6", "DQ7", "DQ8", "DR1", "DR11", "DR12", "DR15", "DR17", "DR51", "DR7",
]


def read_reference():
    with open(REFERENCE_FILE, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def hla_row(hla, resolution, parent="", locus="DRB1"):
    return {
        "hla": hla, "locus": locus, "hla_class": "II",
        "resolution": resolution, "parent_hla": parent,
    }


def mini_vocabulary():
    return [
        hla_row("HLA-class-II", "class", locus="HLA-class-II"),
        hla_row("DRB1", "class", "HLA-class-II"),
        hla_row("HLA-DRB1*03", "2-digit", "DRB1"),
        hla_row("HLA-DRB1*03:01", "4-digit", "HLA-DRB1*03"),
        hla_row("HLA-DRB1*03:02", "4-digit", "HLA-DRB1*03"),
        hla_row("HLA-DRB1*15", "2-digit", "DRB1"),
        hla_row("HLA-DRB1*15:01", "4-digit", "HLA-DRB1*15"),
    ]


def ref(sid, locus="DR", broad="", kind="specific", alleles=""):
    return {
        "serotype_id": sid, "locus": locus, "label": sid,
        "broad_serotype": broad, "kind": kind, "alleles": alleles, "note": "",
    }


class TestReferenceFile(unittest.TestCase):
    def test_reference_file_exists_and_is_valid(self):
        rows = read_reference()
        self.assertGreaterEqual(len(rows), 100)
        build_sqlite.validate_serotype_reference(rows)  # ne leve pas

    def test_every_legacy_serotype_label_resolves(self):
        ids = {r["serotype_id"] for r in read_reference()}
        for label in LEGACY_SEROTYPES:
            self.assertIn(label, ids, f"serotype de la carte v1 absent : {label}")

    def test_all_loci_are_covered(self):
        loci = {r["locus"] for r in read_reference()}
        self.assertEqual(loci, set(build_sqlite.SEROTYPE_LOCI))

    def test_standard_correspondences(self):
        by_id = {r["serotype_id"]: r for r in read_reference()}
        self.assertEqual(by_id["DQ8"]["alleles"], "DQB1*03:02")
        self.assertEqual(by_id["DQ2"]["alleles"], "DQB1*02")
        self.assertEqual(by_id["B27"]["alleles"], "B*27")
        self.assertEqual(by_id["Cw7"]["alleles"], "C*07")
        self.assertEqual(by_id["DR15"]["broad_serotype"], "DR2")
        self.assertEqual(by_id["DR17"]["broad_serotype"], "DR3")
        self.assertEqual(by_id["B51"]["broad_serotype"], "B5")
        self.assertEqual(by_id["A24"]["broad_serotype"], "A9")
        self.assertIn("DRB1*03:01", by_id["DR17"]["alleles"])
        self.assertIn("DRB1*03:02", by_id["DR18"]["alleles"])


class TestReferenceValidation(unittest.TestCase):
    def assertV9(self, rows):
        with self.assertRaises(ValidationError) as ctx:
            build_sqlite.validate_serotype_reference(rows)
        self.assertIn("V9", str(ctx.exception))

    def test_rejects_duplicate_id(self):
        self.assertV9([ref("DR1"), ref("DR1")])

    def test_rejects_unknown_locus_or_kind(self):
        self.assertV9([ref("DR1", locus="XX")])
        self.assertV9([ref("DR1", kind="inconnu")])

    def test_rejects_malformed_allele(self):
        self.assertV9([ref("DR1", alleles="HLA-DRB1*01")])
        self.assertV9([ref("DR1", alleles="DRB1-01")])

    def test_rejects_unknown_or_non_broad_parent(self):
        self.assertV9([ref("DR15", broad="DR2")])
        self.assertV9([ref("DR15", broad="DR4"), ref("DR4")])

    def test_rejects_nested_broad(self):
        self.assertV9([
            ref("DR2", kind="broad", broad="DR9"),
            ref("DR9", kind="broad"),
            ref("DR15", broad="DR2"),
        ])


class TestProjection(unittest.TestCase):
    def test_group_level_entry_links_group_and_children(self):
        s, links, _ = build_sqlite.project_serotypes(
            [ref("DR15", alleles="DRB1*15")], mini_vocabulary()
        )
        self.assertEqual(
            links,
            [("DR15", "HLA-DRB1*15", "direct"),
             ("DR15", "HLA-DRB1*15:01", "group")],
        )

    def test_allele_level_entry_links_only_that_allele(self):
        _, links, _ = build_sqlite.project_serotypes(
            [ref("DR17", alleles="DRB1*03:01")], mini_vocabulary()
        )
        self.assertEqual(links, [("DR17", "HLA-DRB1*03:01", "direct")])

    def test_broad_inherits_union_of_narrow_serotypes(self):
        rows = [
            ref("DR2", kind="broad"),
            ref("DR15", broad="DR2", alleles="DRB1*15"),
            ref("DR3", kind="broad"),
            ref("DR17", broad="DR3", alleles="DRB1*03:01"),
            ref("DR18", broad="DR3", alleles="DRB1*03:02"),
        ]
        s, links, _ = build_sqlite.project_serotypes(rows, mini_vocabulary())
        broad3 = {h for sid, h, via in links if sid == "DR3"}
        self.assertEqual(broad3, {"HLA-DRB1*03:01", "HLA-DRB1*03:02"})
        self.assertTrue(all(via == "narrow" for sid, _, via in links if sid == "DR3"))
        # familles larges d'abord, pour satisfaire la cle etrangere
        self.assertEqual({t[0] for t in s[:2]}, {"DR2", "DR3"})

    def test_absent_allele_is_dropped_not_orphaned(self):
        s, links, report = build_sqlite.project_serotypes(
            [ref("DR1", alleles="DRB1*01"), ref("DR4", alleles="DRB1*04;DRB1*15")],
            mini_vocabulary(),
        )
        self.assertEqual([t[0] for t in s], ["DR4"])  # DR1 : aucun allele retenu
        self.assertEqual(report["dropped_serotypes"], ["DR1"])
        self.assertIn(("DR4", "HLA-DRB1*04"), report["dropped_alleles"])
        self.assertEqual({h for _, h, _ in links}, {"HLA-DRB1*15", "HLA-DRB1*15:01"})

    def test_strict_mode_fails_on_absent_allele(self):
        with self.assertRaises(ValidationError) as ctx:
            build_sqlite.project_serotypes(
                [ref("DR4", alleles="DRB1*04")], mini_vocabulary(), strict=True
            )
        self.assertIn("V10", str(ctx.exception))


class TestBuiltSerotypeTables(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        gen_synthetic.main(out_dir=root / "src", seed=42)  # jeu par defaut
        cls.out = root / "corpus.sqlite"
        build_sqlite.build(
            source_dir=root / "src", out_path=cls.out, version="A-test",
            is_synthetic=True,
        )
        cls.con = sqlite3.connect(cls.out)
        cls.con.execute("PRAGMA foreign_keys = ON")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        cls.tmp.cleanup()

    def q(self, sql, *args):
        return self.con.execute(sql, args).fetchall()

    def test_tables_are_populated(self):
        self.assertGreaterEqual(self.q("SELECT COUNT(*) FROM serotypes")[0][0], 100)
        self.assertGreater(self.q("SELECT COUNT(*) FROM serotype_alleles")[0][0], 500)

    def test_no_orphan_links(self):
        self.assertEqual(self.q("PRAGMA foreign_key_check"), [])
        self.assertEqual(
            self.q(
                "SELECT 1 FROM serotype_alleles sa LEFT JOIN hla_entities h "
                "ON h.hla = sa.hla WHERE h.hla IS NULL"
            ),
            [],
        )

    def test_every_serotype_has_at_least_one_allele(self):
        self.assertEqual(
            self.q(
                "SELECT serotype_id FROM serotypes WHERE serotype_id NOT IN "
                "(SELECT serotype_id FROM serotype_alleles)"
            ),
            [],
        )

    def test_legacy_labels_resolve_in_the_database(self):
        have = {r[0] for r in self.q("SELECT serotype_id FROM serotypes")}
        for label in LEGACY_SEROTYPES:
            self.assertIn(label, have, label)

    def test_dq8_is_dqb1_03_02_and_dr15_is_the_whole_group(self):
        dq8 = {r[0] for r in self.q(
            "SELECT hla FROM serotype_alleles WHERE serotype_id = 'DQ8'")}
        self.assertEqual(dq8, {"HLA-DQB1*03:02"})
        dr15 = {r[0] for r in self.q(
            "SELECT hla FROM serotype_alleles WHERE serotype_id = 'DR15'")}
        self.assertIn("HLA-DRB1*15", dr15)
        self.assertIn("HLA-DRB1*15:01", dr15)

    def test_broad_serotype_is_union_of_its_splits(self):
        a9 = {r[0] for r in self.q(
            "SELECT hla FROM serotype_alleles WHERE serotype_id = 'A9'")}
        split = {r[0] for r in self.q(
            "SELECT hla FROM serotype_alleles WHERE serotype_id IN ('A23','A24')")}
        self.assertEqual(a9, split)
        self.assertIn("HLA-A*24:02", a9)

    def test_group_children_are_linked_to_group_serotypes(self):
        # tout 4-digit de B*44 est B44
        children = {r[0] for r in self.q(
            "SELECT hla FROM hla_entities WHERE parent_hla = 'HLA-B*44'")}
        linked = {r[0] for r in self.q(
            "SELECT hla FROM serotype_alleles WHERE serotype_id = 'B44'")}
        self.assertTrue(children)
        self.assertTrue(children <= linked)

    def test_serotypes_are_searchable_in_fts(self):
        hits = self.q(
            "SELECT entity_id FROM search_index WHERE entity_type = 'serotype' "
            "AND search_index MATCH 'DR15'"
        )
        self.assertIn(("DR15",), hits)


class TestSerotypeBuildFailures(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        gen_synthetic.main(out_dir=self.root / "src", n_articles=80, seed=7)
        self.ref_dir = self.root / "ref"
        self.ref_dir.mkdir()
        self.out = self.root / "corpus.sqlite"

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, **kw):
        return build_sqlite.build(
            source_dir=self.root / "src", out_path=self.out,
            version="A-test", is_synthetic=True,
            reference_dir=self.ref_dir, **kw,
        )

    def write_ref(self, rows):
        with open(self.ref_dir / build_sqlite.SEROTYPES_FILE, "w",
                  encoding="utf-8", newline="") as f:
            w = csv.DictWriter(
                f, fieldnames=["serotype_id", "locus", "label", "broad_serotype",
                               "kind", "alleles", "note"])
            w.writeheader()
            w.writerows(rows)

    def test_invalid_reference_blocks_the_build(self):
        self.write_ref([ref("DR1", alleles="HLA-DRB1*01")])
        with self.assertRaises(ValidationError) as ctx:
            self.build()
        self.assertIn("V9", str(ctx.exception))
        self.assertFalse(self.out.exists(), "fichier produit malgre l'echec")

    def test_strict_mode_blocks_on_allele_missing_from_corpus(self):
        self.write_ref([ref("DR1", alleles="DRB1*99:99")])
        with self.assertRaises(ValidationError) as ctx:
            self.build(strict_serotypes=True)
        self.assertIn("V10", str(ctx.exception))
        self.assertFalse(self.out.exists())

    def test_missing_reference_file_gives_empty_tables(self):
        self.build()
        con = sqlite3.connect(self.out)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM serotypes").fetchone()[0], 0)
        con.close()


if __name__ == "__main__":
    unittest.main()
