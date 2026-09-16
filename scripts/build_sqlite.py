"""Builder : CSV du pipeline -> SQLite valide et scelle.

La base est un ARTEFACT DE BUILD. Si une seule validation echoue, aucun
fichier n'est produit : on construit dans un temporaire et on ne deplace
qu'apres succes complet.

DETERMINISME
------------
`test_build_is_reproducible` compare les SHA-256 de deux builds successifs.
Rien de variable dans le temps ne doit donc entrer dans le fichier :

* `built_at` est un PARAMETRE, de valeur par defaut stable
  (`DEFAULT_BUILT_AT`). Il n'est JAMAIS derive de l'heure courante.
* Toutes les insertions se font dans un ordre trie par cle primaire. Les
  rowid AUTOINCREMENT (hla_mentions, outcome_mentions, pair_mentions,
  search_index) dependent de l'ordre d'insertion : cet ordre doit etre
  stable d'un build a l'autre.
* `PRAGMA page_size` est fixe explicitement, et un `VACUUM` final compacte
  le fichier de facon reproductible.

`MAX_YEAR` depend de l'annee courante (V7), mais n'entre pas dans le
fichier : il ne sert qu'a la validation.
"""

import argparse
import csv
import hashlib
import os
import shutil
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from labels import OUTCOME_LABELS, compute_signal_level

MIN_YEAR = 1960
MAX_YEAR = datetime.now(timezone.utc).year

# Horodatage stable par defaut : cf. DETERMINISME ci-dessus.
DEFAULT_BUILT_AT = "2026-07-01T00:00:00Z"

PAGE_SIZE = 4096

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


class ValidationError(Exception):
    """Une validation bloquante a echoue : aucun fichier n'est produit."""


# =====================================================================
# LECTURE DES CSV
# =====================================================================

def _read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _int(value, default=None):
    value = (value or "").strip()
    if value == "":
        return default
    return int(float(value))


def _float(value, default=None):
    value = (value or "").strip()
    if value == "":
        return default
    return float(value)


def _text(value):
    value = (value or "").strip()
    return value or None


def read_sources(source_dir):
    """Charge les cinq CSV sources en memoire, sans aucune validation."""
    src = Path(source_dir)
    return {
        "articles": _read_csv(src / "articles.csv"),
        "authors": _read_csv(src / "authors.csv"),
        "hla_entities": _read_csv(src / "hla_entities.csv"),
        "pair_mentions": _read_csv(src / "pair_mentions.csv"),
        "associations": _read_csv(src / "associations.csv"),
    }


def author_slug(name):
    """Slug normalise et STABLE pour un nom d'auteur.

    Cle naturelle : le meme nom doit toujours donner le meme slug, sinon
    deux builds produisent des cles differentes. Pure fonction du texte,
    sans compteur ni hasard.

        "Wiebe, C"  -> "wiebe-c"
        "Meier-Kriesche H" -> "meier-kriesche-h"
    """
    out = []
    prev_dash = True  # evite un tiret de tete
    for ch in (name or "").strip().lower():
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        else:
            if not prev_dash:
                out.append("-")
            prev_dash = True
    slug = "".join(out).strip("-")
    return slug or "anonymous"


# =====================================================================
# VALIDATIONS (§8) — toutes bloquantes, message prefixe par le code
# =====================================================================

def validate(data, n_articles_declared):
    """Execute les 8 validations. Leve ValidationError au premier echec.

    Appelee AVANT toute ecriture : un echec ne laisse aucun fichier.
    """
    articles = data["articles"]
    authors = data["authors"]
    hla_rows = data["hla_entities"]
    mentions = data["pair_mentions"]
    assocs = data["associations"]

    # --- V1 : nombre d'articles lus == nombre declare -----------------
    if len(articles) != n_articles_declared:
        raise ValidationError(
            f"V1: {len(articles)} articles lus mais {n_articles_declared} "
            "declares dans corpus_version"
        )

    pmids = {r["pmid"] for r in articles}
    if len(pmids) != len(articles):
        raise ValidationError("V1: pmid duplique dans articles.csv")

    hla_ids = {r["hla"] for r in hla_rows}
    if len(hla_ids) != len(hla_rows):
        raise ValidationError("V1: hla duplique dans hla_entities.csv")

    # --- V8 : tout outcome present a un libelle et une categorie ------
    # (execute avant V2 : l'ensemble des outcomes valides sert de reference)
    seen_outcomes = {r["outcome"] for r in mentions} | {r["outcome"] for r in assocs}
    for outcome in sorted(seen_outcomes):
        entry = OUTCOME_LABELS.get(outcome)
        if entry is None:
            raise ValidationError(
                f"V8: outcome '{outcome}' absent de OUTCOME_LABELS"
            )
        label, category = entry
        if not label or not category:
            raise ValidationError(
                f"V8: outcome '{outcome}' sans libelle ou sans categorie"
            )

    # --- V2 : toute FK referencee existe -------------------------------
    for r in authors:
        if r["pmid"] not in pmids:
            raise ValidationError(
                f"V2: authors.csv reference le pmid inconnu '{r['pmid']}'"
            )
    for r in mentions:
        if r["pmid"] not in pmids:
            raise ValidationError(
                f"V2: pair_mentions.csv reference le pmid inconnu '{r['pmid']}'"
            )
        if r["hla"] not in hla_ids:
            raise ValidationError(
                f"V2: pair_mentions.csv reference le hla inconnu '{r['hla']}'"
            )
    for r in assocs:
        if r["hla"] not in hla_ids:
            raise ValidationError(
                f"V2: associations.csv reference le hla inconnu '{r['hla']}'"
            )

    # --- V5 : tout parent_hla resout, et la hierarchie est acyclique ---
    parent_of = {}
    for r in hla_rows:
        parent = (r.get("parent_hla") or "").strip()
        if parent:
            if parent not in hla_ids:
                raise ValidationError(
                    f"V5: '{r['hla']}' declare le parent inconnu '{parent}'"
                )
            parent_of[r["hla"]] = parent

    state = {}  # 0 = en cours, 1 = termine
    for start in sorted(hla_ids):
        path = []
        node = start
        while node is not None and state.get(node) is None:
            state[node] = 0
            path.append(node)
            node = parent_of.get(node)
        if node is not None and state.get(node) == 0:
            raise ValidationError(
                f"V5: cycle dans la hierarchie HLA via '{node}'"
            )
        for seen in path:
            state[seen] = 1

    # --- V7 : annee plausible ------------------------------------------
    for r in articles:
        year = _int(r.get("year"))
        if year is None:
            raise ValidationError(f"V7: article '{r['pmid']}' sans annee")
        if year < MIN_YEAR or year > MAX_YEAR:
            raise ValidationError(
                f"V7: article '{r['pmid']}' a une annee implausible {year} "
                f"(attendu dans [{MIN_YEAR}, {MAX_YEAR}])"
            )

    # --- V3 / V4 / V6 : coherence des agregats --------------------------
    observed = Counter((r["hla"], r["outcome"]) for r in mentions)
    seen_pairs = set()
    for r in assocs:
        key = (r["hla"], r["outcome"])
        if key in seen_pairs:
            raise ValidationError(
                f"V1: paire dupliquee dans associations.csv {key}"
            )
        seen_pairs.add(key)

        n_co = _int(r.get("n_cooccurrence"))
        n_pos = _int(r.get("n_positive"))
        n_neg = _int(r.get("n_negated"))

        # V3
        actual = observed.get(key, 0)
        if n_co != actual:
            raise ValidationError(
                f"V3: {key} declare n_cooccurrence={n_co} mais "
                f"{actual} pair_mentions existent"
            )

        # V4
        if n_pos is None or n_neg is None or n_pos + n_neg != n_co:
            raise ValidationError(
                f"V4: {key} n_positive({n_pos}) + n_negated({n_neg}) "
                f"!= n_cooccurrence({n_co})"
            )

        # V6
        npmi = _float(r.get("npmi"))
        if npmi is not None and not (-1.0 <= npmi <= 1.0):
            raise ValidationError(
                f"V6: {key} npmi={npmi} hors de [-1, 1]"
            )
        for field in ("fdr", "fdr_two_sided"):
            value = _float(r.get(field))
            if value is not None and not (0.0 <= value <= 1.0):
                raise ValidationError(
                    f"V6: {key} {field}={value} hors de [0, 1]"
                )

    # Toute paire observee doit etre agregee : sinon un chiffre affichable
    # existerait sans ligne d'association pour le tracer.
    missing = sorted(set(observed) - seen_pairs)
    if missing:
        raise ValidationError(
            f"V3: {len(missing)} paires mentionnees sans ligne d'association, "
            f"ex. {missing[0]}"
        )


# =====================================================================
# CONSTRUCTION
# =====================================================================

def _populate(con, data, version, universe, is_synthetic, notes, built_at):
    """Remplit la base dans l'ordre des dependances FK.

    Toutes les collections sont triees par cle primaire avant insertion :
    les rowid AUTOINCREMENT en dependent, donc le determinisme aussi.
    """
    articles = sorted(data["articles"], key=lambda r: r["pmid"])
    hla_rows = data["hla_entities"]
    mentions = sorted(
        data["pair_mentions"],
        key=lambda r: (r["pmid"], r["hla"], r["outcome"], _int(r["sentence_idx"], 0)),
    )
    assocs = sorted(data["associations"], key=lambda r: (r["hla"], r["outcome"]))

    # --- corpus_version -------------------------------------------------
    con.execute(
        "INSERT INTO corpus_version (version, universe, built_at, n_articles, "
        "pubmed_query, pipeline_commit, filter_script, is_synthetic, notes) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (
            version, universe, built_at, len(articles),
            None, None, None, 1 if is_synthetic else 0, notes,
        ),
    )

    # --- articles -------------------------------------------------------
    con.executemany(
        "INSERT INTO articles (pmid, doi, title, abstract, year, journal, "
        "journal_abbrev, country, language, cited_by, source, graft_assignment) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                r["pmid"], _text(r.get("doi")), r.get("title") or "",
                _text(r.get("abstract")), _int(r.get("year")),
                _text(r.get("journal")), _text(r.get("journal_abbrev")),
                _text(r.get("country")), _text(r.get("language")),
                _int(r.get("cited_by")), _text(r.get("source")),
                _text(r.get("graft_assignment")),
            )
            for r in articles
        ],
    )

    # --- authors / article_authors --------------------------------------
    # Le CSV ne porte que (pmid, author, position) : author_id est derive.
    display_of = {}
    links = {}  # (pmid, author_id) -> position
    by_pmid = defaultdict(list)
    for r in data["authors"]:
        slug = author_slug(r["author"])
        display_of.setdefault(slug, r["author"].strip())
        position = _int(r.get("position"), 0)
        key = (r["pmid"], slug)
        # Un meme auteur cite deux fois dans un article : on garde la premiere
        # position (la PK (pmid, author_id) interdit le doublon).
        if key not in links or position < links[key]:
            links[key] = position
        by_pmid[r["pmid"]].append(position)

    last_position = {pmid: max(ps) for pmid, ps in by_pmid.items()}
    n_publications = Counter(slug for _, slug in links)

    con.executemany(
        "INSERT INTO authors (author_id, display_name, n_publications) VALUES (?,?,?)",
        [
            (slug, display_of[slug], n_publications[slug])
            for slug in sorted(display_of)
        ],
    )
    con.executemany(
        "INSERT INTO article_authors (pmid, author_id, position, is_last) "
        "VALUES (?,?,?,?)",
        [
            (
                pmid, slug, links[(pmid, slug)],
                1 if links[(pmid, slug)] == last_position.get(pmid) else 0,
            )
            for pmid, slug in sorted(links)
        ],
    )

    # --- outcomes -------------------------------------------------------
    outcome_mention_counts = Counter(r["outcome"] for r in mentions)
    present = sorted(
        {r["outcome"] for r in mentions} | {r["outcome"] for r in assocs}
    )
    con.executemany(
        "INSERT INTO outcomes (outcome, label, category, n_mentions) VALUES (?,?,?,?)",
        [
            (
                outcome, OUTCOME_LABELS[outcome][0], OUTCOME_LABELS[outcome][1],
                outcome_mention_counts.get(outcome, 0),
            )
            for outcome in present
        ],
    )

    # --- hla_entities : parents AVANT enfants ---------------------------
    hla_mention_counts = Counter(r["hla"] for r in mentions)
    parent_of = {
        r["hla"]: ((r.get("parent_hla") or "").strip() or None) for r in hla_rows
    }
    by_id = {r["hla"]: r for r in hla_rows}

    # Tri topologique deterministe : profondeur dans la hierarchie, puis
    # ordre lexicographique. L'insertion en une passe satisfait la FK
    # auto-referencante, quel que soit l'ordre du CSV.
    def depth(hla):
        d, node = 0, parent_of.get(hla)
        while node is not None:
            d += 1
            node = parent_of.get(node)
        return d

    ordered = sorted(by_id, key=lambda h: (depth(h), h))
    con.executemany(
        "INSERT INTO hla_entities (hla, locus, hla_class, resolution, "
        "parent_hla, n_mentions) VALUES (?,?,?,?,?,?)",
        [
            (
                h, by_id[h]["locus"], by_id[h]["hla_class"],
                by_id[h]["resolution"], parent_of.get(h),
                hla_mention_counts.get(h, 0),
            )
            for h in ordered
        ],
    )

    # --- hla_mentions / outcome_mentions --------------------------------
    # Derivees des pair_mentions : une mention d'entite par mention de paire.
    con.executemany(
        "INSERT INTO hla_mentions (pmid, hla, span, sentence_idx) VALUES (?,?,?,?)",
        [
            (r["pmid"], r["hla"], _text(r.get("hla_span")), _int(r.get("sentence_idx")))
            for r in mentions
        ],
    )
    con.executemany(
        "INSERT INTO outcome_mentions (pmid, outcome, span, negated, sentence_idx) "
        "VALUES (?,?,?,?,?)",
        [
            (
                r["pmid"], r["outcome"], _text(r.get("outcome_span")),
                1 if r.get("polarity") == "negated" else 0,
                _int(r.get("sentence_idx")),
            )
            for r in mentions
        ],
    )

    # --- pair_mentions --------------------------------------------------
    con.executemany(
        "INSERT INTO pair_mentions (pmid, hla, outcome, sentence, hla_span, "
        "outcome_span, polarity, negation_trigger, sentence_idx) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        [
            (
                r["pmid"], r["hla"], r["outcome"], r["sentence"],
                _text(r.get("hla_span")), _text(r.get("outcome_span")),
                r["polarity"], _text(r.get("negation_trigger")),
                _int(r.get("sentence_idx")),
            )
            for r in mentions
        ],
    )

    # --- associations : signal_level et is_significant derives ----------
    assoc_rows = []
    for r in assocs:
        n_co = _int(r.get("n_cooccurrence"))
        fdr = _float(r.get("fdr"))
        odds_ratio = _float(r.get("odds_ratio"))
        fdr_two_sided = _float(r.get("fdr_two_sided"))
        signal_level = compute_signal_level(n_co, fdr, odds_ratio, fdr_two_sided)
        is_significant = 1 if signal_level != "weak" else 0
        assoc_rows.append((
            r["hla"], r["outcome"], n_co, _int(r.get("n_positive")),
            _int(r.get("n_negated")), _int(r.get("n_hla_total")),
            _int(r.get("n_outcome_total")), _int(r.get("n_universe")),
            _float(r.get("pmi")), _float(r.get("npmi")), _float(r.get("log_odds")),
            odds_ratio, _float(r.get("or_ci_low")), _float(r.get("or_ci_high")),
            _float(r.get("pval_fisher")), fdr, _float(r.get("pval_two_sided")),
            fdr_two_sided, None, _int(r.get("first_year")),
            signal_level, is_significant,
        ))
    con.executemany(
        "INSERT INTO associations (hla, outcome, n_cooccurrence, n_positive, "
        "n_negated, n_hla_total, n_outcome_total, n_universe, pmi, npmi, "
        "log_odds, odds_ratio, or_ci_low, or_ci_high, pval_fisher, fdr, "
        "pval_two_sided, fdr_two_sided, npmi_geo, first_year, signal_level, "
        "is_significant) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        assoc_rows,
    )

    # --- association_timeline -------------------------------------------
    year_of = {r["pmid"]: _int(r.get("year")) for r in articles}
    timeline = Counter(
        (r["hla"], r["outcome"], year_of[r["pmid"]]) for r in mentions
    )
    con.executemany(
        "INSERT INTO association_timeline (hla, outcome, year, n) VALUES (?,?,?,?)",
        [(h, o, y, timeline[(h, o, y)]) for h, o, y in sorted(timeline)],
    )

    # --- annual_counts ---------------------------------------------------
    annual = Counter(year_of[r["pmid"]] for r in articles)
    con.executemany(
        "INSERT INTO annual_counts (year, n) VALUES (?,?)",
        [(y, annual[y]) for y in sorted(annual)],
    )

    _populate_search_index(con, articles, ordered, by_id, present, display_of)


def _populate_search_index(con, articles, hla_ordered, hla_by_id, outcomes,
                           author_display):
    """Index FTS5 unifie : alleles, complications, articles, auteurs.

    Insere dans un ordre stable (type puis identifiant) : le contenu des
    tables shadow FTS5 depend de l'ordre d'insertion.
    """
    rows = []
    for h in sorted(hla_ordered):
        r = hla_by_id[h]
        rows.append((
            "allele", h, h,
            " ".join([h, r["locus"], r["hla_class"], r["resolution"]]),
        ))
    for outcome in outcomes:
        label, category = OUTCOME_LABELS[outcome]
        rows.append(("outcome", outcome, label, " ".join([outcome, label, category])))
    for a in articles:
        rows.append((
            "article", a["pmid"], a.get("title") or "",
            " ".join(filter(None, [
                a.get("title"), a.get("abstract"), a.get("journal"),
                str(a.get("year") or ""),
            ])),
        ))
    for slug in sorted(author_display):
        rows.append(("author", slug, author_display[slug],
                     f"{author_display[slug]} {slug}"))

    con.executemany(
        "INSERT INTO search_index (entity_type, entity_id, label, content) "
        "VALUES (?,?,?,?)",
        rows,
    )


def build(source_dir, out_path, version, universe="A", is_synthetic=False,
          notes=None, built_at=DEFAULT_BUILT_AT):
    """Construit la base scellee et retourne son SHA-256 hexadecimal.

    `built_at` est un parametre a valeur par defaut STABLE : deux builds des
    memes CSV produisent le meme fichier, donc le meme SHA-256. Ne jamais y
    injecter l'heure courante.

    Leve ValidationError si une des 8 validations echoue ; dans ce cas aucun
    fichier n'est ecrit (ni la base, ni le .sha256).
    """
    out_path = Path(out_path)
    data = read_sources(source_dir)

    # 1-2. Valider AVANT toute ecriture.
    validate(data, n_articles_declared=len(data["articles"]))

    tmp_dir = tempfile.mkdtemp(prefix="build_sqlite_")
    tmp_db = Path(tmp_dir) / "corpus.sqlite"
    try:
        con = sqlite3.connect(tmp_db)
        try:
            con.execute(f"PRAGMA page_size = {PAGE_SIZE}")
            con.execute("PRAGMA journal_mode = DELETE")
            con.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
            con.execute("PRAGMA foreign_keys = ON")

            _populate(con, data, version, universe, is_synthetic, notes, built_at)
            con.commit()

            violations = con.execute("PRAGMA foreign_key_check").fetchall()
            if violations:
                raise ValidationError(
                    f"V2: {len(violations)} violations de cle etrangere apres "
                    f"insertion, ex. {violations[0]}"
                )

            con.execute("VACUUM")
            con.commit()
        finally:
            con.close()

        # 9. Ne deplacer qu'apres succes complet.
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_db), str(out_path))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    digest = hashlib.sha256(out_path.read_bytes()).hexdigest()
    sha_path = Path(str(out_path) + ".sha256")
    sha_path.write_text(f"{digest}  {out_path.name}\n", encoding="utf-8")
    return digest


# =====================================================================
# CLI
# =====================================================================

def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Construit la base SQLite scellee depuis les CSV du pipeline."
    )
    parser.add_argument("--source", default="data/synthetic",
                        help="Repertoire contenant les cinq CSV sources.")
    parser.add_argument("--out", default="dist/corpus_A_synthetic.sqlite",
                        help="Chemin du fichier .sqlite a produire.")
    parser.add_argument("--version", required=True,
                        help="Identifiant de version du corpus (ex. A-synthetic).")
    parser.add_argument("--universe", default="A", choices=["A", "B"],
                        help="Univers du corpus.")
    parser.add_argument("--synthetic", action="store_true",
                        help="Marque le corpus comme fictif (bandeau dans l'UI).")
    parser.add_argument("--notes", default=None,
                        help="Note libre stockee dans corpus_version.")
    parser.add_argument("--built-at", default=DEFAULT_BUILT_AT,
                        help="Horodatage ISO8601 stable ecrit dans la base.")
    args = parser.parse_args(argv)

    try:
        digest = build(
            source_dir=args.source,
            out_path=args.out,
            version=args.version,
            universe=args.universe,
            is_synthetic=args.synthetic,
            notes=args.notes,
            built_at=args.built_at,
        )
    except ValidationError as exc:
        print(f"ECHEC DE VALIDATION : {exc}", file=sys.stderr)
        print("Aucun fichier produit.", file=sys.stderr)
        return 1

    print(f"Base   : {os.path.abspath(args.out)}")
    print(f"SHA256 : {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
