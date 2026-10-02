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
import re
import shutil
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from labels import (
    ALL_ORGANS,
    CATEGORIES,
    OUTCOME_LABELS,
    OUTCOME_ORGANS,
    ORGANS,
    compute_signal_level,
)

MIN_YEAR = 1960
MAX_YEAR = datetime.now(timezone.utc).year

# Horodatage stable par defaut : cf. DETERMINISME ci-dessus.
DEFAULT_BUILT_AT = "2026-07-01T00:00:00Z"

PAGE_SIZE = 4096

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# Referentiels (tables de reference, hors extraction NLP). Un fichier absent
# donne des tables serologiques vides, jamais une erreur : la bascule vers les
# donnees reelles ne doit pas dependre de lui.
DEFAULT_REFERENCE_DIR = Path(__file__).resolve().parent.parent / "data" / "reference"
SEROTYPES_FILE = "hla_serotypes.csv"

# Organes : `{cle: (libelle, libelle court, slug)}`. Source : labels.py.
ORGAN_META = {key: (label, short, slug) for key, label, short, slug in ORGANS}

SEROTYPE_LOCI = ("A", "B", "C", "DR", "DQ", "DP")
SEROTYPE_KINDS = ("specific", "broad", "associated", "cellular")
# Jeton d'allele du referentiel : sans prefixe « HLA- », 2 champs max.
ALLELE_TOKEN_RE = re.compile(r"^[A-Z0-9]+\*\d{2,3}(:\d{2,3})?$")
SEROTYPE_ID_RE = re.compile(r"^[A-Za-z]{1,2}w?\d{1,3}$")


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
    """Charge les CSV sources en memoire (cinq obligatoires, `organs.csv`
    optionnel), sans aucune validation."""
    src = Path(source_dir)
    organs_path = src / "organs.csv"
    return {
        "articles": _read_csv(src / "articles.csv"),
        "authors": _read_csv(src / "authors.csv"),
        "hla_entities": _read_csv(src / "hla_entities.csv"),
        "pair_mentions": _read_csv(src / "pair_mentions.csv"),
        "associations": _read_csv(src / "associations.csv"),
        # Liste DECLAREE des organes du corpus (optionnelle) : si elle est
        # absente, les organes sont deduits des articles.
        "organs": _read_csv(organs_path) if organs_path.exists() else None,
    }


def article_organs(row):
    """Organes d'un article : colonne `organs`, cles separees par « ; »."""
    return [o.strip() for o in (row.get("organs") or "").split(";") if o.strip()]


def read_serotype_reference(reference_dir):
    """Lit le referentiel serologique ; liste vide si le fichier est absent."""
    path = Path(reference_dir) / SEROTYPES_FILE if reference_dir else None
    if path is None or not path.exists():
        return []
    return _read_csv(path)


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

def validate(data, n_articles_declared, allow_off_organ_outcomes=False):
    """Execute les validations V1-V8 et V11-V16. Leve ValidationError au
    premier echec.

    Appelee AVANT toute ecriture : un echec ne laisse aucun fichier.

    Validations ajoutees avec la stratification par organe (cf. docs/ORGANES.md) :

    * V11 : chaque article a au moins un organe, et tout organe est connu ;
    * V12 : chaque organe declare a au moins un article ;
    * V13 : chaque association porte une strate connue (`all` ou un organe),
      sans doublon (strate, allele, complication) ;
    * V3 (par strate) : n_cooccurrence == mentions de la paire dans la strate ;
    * V14 : denominateurs de strate coherents (`n_universe` == articles de la
      strate) et marges reconstructibles (n_hla_total, n_outcome_total) ;
    * V15 : sommes plausibles (une strate d'organe ne depasse jamais `all`,
      `all` ne depasse jamais la somme des strates d'organe) ;
    * V16 : chaque complication mentionnee s'applique a un organe de son
      article (desactivable par `allow_off_organ_outcomes`).
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
        if category not in CATEGORIES:
            raise ValidationError(
                f"V8: outcome '{outcome}' : categorie inconnue '{category}'"
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

    # --- V11 / V12 : organes ---------------------------------------------
    organs_of = {}
    for r in articles:
        organs = article_organs(r)
        if not organs:
            raise ValidationError(
                f"V11: l'article '{r['pmid']}' n'a aucun organe (colonne organs)"
            )
        for organ in organs:
            if organ not in ORGAN_META:
                raise ValidationError(
                    f"V11: l'article '{r['pmid']}' reference l'organe inconnu "
                    f"'{organ}'"
                )
        if len(set(organs)) != len(organs):
            raise ValidationError(
                f"V11: l'article '{r['pmid']}' repete un organe : {organs}"
            )
        organs_of[r["pmid"]] = organs

    declared = declared_organs(data)
    for organ in declared:
        if organ not in ORGAN_META:
            raise ValidationError(f"V11: organe declare inconnu '{organ}'")
    universe = Counter({ALL_ORGANS: len(articles)})
    for organs in organs_of.values():
        for organ in organs:
            universe[organ] += 1
    for organ in declared:
        if universe[organ] == 0:
            raise ValidationError(f"V12: l'organe '{organ}' n'a aucun article")
    for organ in universe:
        if organ != ALL_ORGANS and organ not in declared:
            raise ValidationError(
                f"V11: des articles portent l'organe '{organ}', absent de organs.csv"
            )

    # --- V16 : une complication s'applique a un organe de son article ------
    off_organ = []
    for r in mentions:
        if not any(o in OUTCOME_ORGANS.get(r["outcome"], ()) for o in organs_of[r["pmid"]]):
            off_organ.append((r["pmid"], r["outcome"]))
    if off_organ and not allow_off_organ_outcomes:
        raise ValidationError(
            f"V16: {len(off_organ)} mentions de complications hors du champ des "
            f"organes de leur article, ex. {off_organ[0]}"
        )

    # --- Strates : comptages reels depuis les pair_mentions ----------------
    strata = [ALL_ORGANS] + sorted(declared)
    pair_n = {st: Counter() for st in strata}
    hla_arts = {st: defaultdict(set) for st in strata}
    out_arts = {st: defaultdict(set) for st in strata}
    for r in mentions:
        key = (r["hla"], r["outcome"])
        for st in [ALL_ORGANS] + organs_of[r["pmid"]]:
            pair_n[st][key] += 1
            hla_arts[st][r["hla"]].add(r["pmid"])
            out_arts[st][r["outcome"]].add(r["pmid"])

    # --- V13 / V3 / V4 / V6 / V14 : coherence des agregats par strate -----
    seen = set()
    seen_by_stratum = {st: set() for st in strata}
    for r in assocs:
        stratum = (r.get("organ") or "").strip()
        if stratum not in seen_by_stratum:
            raise ValidationError(
                f"V13: association de strate inconnue '{stratum}' "
                f"(attendu : '{ALL_ORGANS}' ou un organe declare)"
            )
        key = (r["hla"], r["outcome"])
        if (stratum, key) in seen:
            raise ValidationError(
                f"V1: paire dupliquee dans associations.csv {(stratum,) + key}"
            )
        seen.add((stratum, key))
        seen_by_stratum[stratum].add(key)

        n_co = _int(r.get("n_cooccurrence"))
        n_pos = _int(r.get("n_positive"))
        n_neg = _int(r.get("n_negated"))

        # V3, dans la strate
        actual = pair_n[stratum].get(key, 0)
        if n_co != actual:
            raise ValidationError(
                f"V3: {stratum}/{key} declare n_cooccurrence={n_co} mais "
                f"{actual} pair_mentions existent dans la strate"
            )

        # V4
        if n_pos is None or n_neg is None or n_pos + n_neg != n_co:
            raise ValidationError(
                f"V4: {stratum}/{key} n_positive({n_pos}) + n_negated({n_neg}) "
                f"!= n_cooccurrence({n_co})"
            )

        # V14 : denominateur de strate et marges
        n_universe = _int(r.get("n_universe"))
        if n_universe != universe[stratum]:
            raise ValidationError(
                f"V14: {stratum}/{key} declare n_universe={n_universe} mais la "
                f"strate compte {universe[stratum]} articles"
            )
        n_hla = _int(r.get("n_hla_total"))
        n_out = _int(r.get("n_outcome_total"))
        if n_hla != len(hla_arts[stratum][r["hla"]]):
            raise ValidationError(
                f"V14: {stratum}/{key} declare n_hla_total={n_hla} mais "
                f"{len(hla_arts[stratum][r['hla']])} articles de la strate "
                f"citent cet allele"
            )
        if n_out != len(out_arts[stratum][r["outcome"]]):
            raise ValidationError(
                f"V14: {stratum}/{key} declare n_outcome_total={n_out} mais "
                f"{len(out_arts[stratum][r['outcome']])} articles de la strate "
                f"citent cette complication"
            )
        if n_hla > n_universe or n_out > n_universe:
            raise ValidationError(
                f"V14: {stratum}/{key} : une marge depasse le denominateur "
                f"de la strate ({n_hla}, {n_out} > {n_universe})"
            )

        # V6
        npmi = _float(r.get("npmi"))
        if npmi is not None and not (-1.0 <= npmi <= 1.0):
            raise ValidationError(
                f"V6: {stratum}/{key} npmi={npmi} hors de [-1, 1]"
            )
        for field in ("fdr", "fdr_two_sided"):
            value = _float(r.get(field))
            if value is not None and not (0.0 <= value <= 1.0):
                raise ValidationError(
                    f"V6: {stratum}/{key} {field}={value} hors de [0, 1]"
                )

    # Toute paire observee doit etre agregee, dans chaque strate : sinon un
    # chiffre affichable existerait sans ligne d'association pour le tracer.
    for st in strata:
        missing = sorted(set(pair_n[st]) - seen_by_stratum[st])
        if missing:
            raise ValidationError(
                f"V3: {len(missing)} paires mentionnees sans ligne d'association "
                f"dans la strate '{st}', ex. {missing[0]}"
            )

    # --- V15 : sommes plausibles ------------------------------------------
    if universe[ALL_ORGANS] != len(articles):
        raise ValidationError("V15: denominateur 'all' != nombre d'articles")
    organ_total = sum(universe[o] for o in declared)
    if organ_total < universe[ALL_ORGANS]:
        raise ValidationError(
            f"V15: la somme des articles par organe ({organ_total}) est "
            f"inferieure au nombre d'articles ({universe[ALL_ORGANS]}) : un "
            f"article au moins n'est dans aucune strate"
        )
    for organ in declared:
        if universe[organ] > universe[ALL_ORGANS]:
            raise ValidationError(f"V15: la strate '{organ}' depasse 'all'")
    for key, n_all in pair_n[ALL_ORGANS].items():
        parts = [pair_n[o].get(key, 0) for o in declared]
        if sum(parts) < n_all or max(parts) > n_all:
            raise ValidationError(
                f"V15: somme des strates incoherente pour {key} : all={n_all}, "
                f"organes={parts}"
            )


def declared_organs(data):
    """Organes du corpus : `organs.csv` s'il existe, sinon ceux des articles."""
    if data.get("organs") is not None:
        return [r["organ"].strip() for r in data["organs"]]
    seen = []
    for r in data["articles"]:
        for organ in article_organs(r):
            if organ not in seen:
                seen.append(organ)
    return [key for key, *_ in ORGANS if key in seen] + [
        o for o in seen if o not in ORGAN_META
    ]


# =====================================================================
# REFERENTIEL SEROLOGIQUE (V9, V10)
# =====================================================================

def validate_serotype_reference(ref_rows):
    """V9 : coherence STRUCTURELLE du referentiel, independante du corpus.

    * identifiants uniques et bien formes, locus et nature connus ;
    * `broad_serotype` designe une famille large (`kind = broad`) et ne
      s'imbrique pas (une famille large n'a pas elle-meme de parent) ;
    * chaque jeton d'allele est ecrit au format IPD-IMGT sans « HLA- »
      (`A*02`, `DRB1*03:01`).
    """
    ids = set()
    for r in ref_rows:
        sid = (r.get("serotype_id") or "").strip()
        if not sid or not SEROTYPE_ID_RE.match(sid):
            raise ValidationError(f"V9: serotype_id invalide '{sid}'")
        if sid in ids:
            raise ValidationError(f"V9: serotype_id duplique '{sid}'")
        ids.add(sid)
        if (r.get("locus") or "").strip() not in SEROTYPE_LOCI:
            raise ValidationError(
                f"V9: serotype '{sid}' : locus inconnu '{r.get('locus')}'"
            )
        if (r.get("kind") or "").strip() not in SEROTYPE_KINDS:
            raise ValidationError(
                f"V9: serotype '{sid}' : nature inconnue '{r.get('kind')}'"
            )
        for token in _tokens(r.get("alleles")):
            if not ALLELE_TOKEN_RE.match(token):
                raise ValidationError(
                    f"V9: serotype '{sid}' : allele mal forme '{token}'"
                )

    by_id = {(r["serotype_id"]).strip(): r for r in ref_rows}
    for sid, r in by_id.items():
        broad = (r.get("broad_serotype") or "").strip()
        if not broad:
            continue
        parent = by_id.get(broad)
        if parent is None:
            raise ValidationError(
                f"V9: serotype '{sid}' : famille large inconnue '{broad}'"
            )
        if parent["kind"].strip() != "broad":
            raise ValidationError(
                f"V9: serotype '{sid}' : '{broad}' n'est pas une famille large"
            )
        if (parent.get("broad_serotype") or "").strip():
            raise ValidationError(
                f"V9: serotype '{sid}' : familles larges imbriquees via '{broad}'"
            )
        if r["kind"].strip() == "broad":
            raise ValidationError(
                f"V9: la famille large '{sid}' ne peut pas avoir de parent"
            )


def _tokens(value):
    return [t.strip() for t in (value or "").split(";") if t.strip()]


def project_serotypes(ref_rows, hla_rows, strict=False):
    """Projette le referentiel serologique sur le vocabulaire HLA du corpus.

    Retourne `(serotypes, links, report)` :

    * `serotypes` : lignes (serotype_id, locus, label, broad, kind, note) des
      specificites retenues, familles larges d'abord ;
    * `links` : triplets (serotype_id, hla, via), `via` valant `direct`
      (liste dans le referentiel), `group` (4-digit d'un groupe 2-digit liste)
      ou `narrow` (herite d'une specificite plus fine d'une famille large) ;
    * `report` : `{"dropped_alleles": [...], "dropped_serotypes": [...]}`.

    Un allele du referentiel absent du corpus est ECARTE (le referentiel est
    plus large que n'importe quel corpus) ; une specificite sans aucun allele
    retenu est ecartee a son tour. `strict=True` fait echouer (V10) au
    premier allele absent. Aucun lien orphelin n'est jamais produit.
    """
    hla_ids = {r["hla"] for r in hla_rows}
    resolution = {r["hla"]: r["resolution"] for r in hla_rows}
    children = defaultdict(list)
    for r in hla_rows:
        parent = (r.get("parent_hla") or "").strip()
        if parent and r["resolution"] == "4-digit":
            children[parent].append(r["hla"])

    dropped_alleles = []
    links = {}  # (serotype_id, hla) -> via

    def link(sid, hla, via):
        links.setdefault((sid, hla), via)

    rows = {r["serotype_id"].strip(): r for r in ref_rows}
    for sid in sorted(rows):
        for token in _tokens(rows[sid].get("alleles")):
            hla = f"HLA-{token}"
            if hla not in hla_ids:
                if strict:
                    raise ValidationError(
                        f"V10: serotype '{sid}' : allele '{hla}' absent de "
                        "hla_entities"
                    )
                dropped_alleles.append((sid, hla))
                continue
            link(sid, hla, "direct")
            if resolution[hla] == "2-digit":
                for child in sorted(children.get(hla, ())):
                    link(sid, child, "group")

    # Familles larges : union des liens des specificites plus fines.
    for sid in sorted(rows):
        broad = (rows[sid].get("broad_serotype") or "").strip()
        if not broad:
            continue
        for (s2, hla), _ in sorted(links.items()):
            if s2 == sid:
                link(broad, hla, "narrow")

    kept = {sid for sid, _ in links}
    dropped_serotypes = sorted(set(rows) - kept)

    def order(sid):
        r = rows[sid]
        return (0 if r["kind"].strip() == "broad" else 1, sid)

    serotypes = [
        (
            sid, rows[sid]["locus"].strip(), (rows[sid].get("label") or sid).strip(),
            (rows[sid].get("broad_serotype") or "").strip() or None,
            rows[sid]["kind"].strip(), _text(rows[sid].get("note")),
        )
        for sid in sorted(kept, key=order)
    ]
    # Un parent ecarte ne peut pas rester reference : il l'est des qu'un
    # enfant est garde (union), donc cette garde est un filet de securite.
    kept_ids = {t[0] for t in serotypes}
    for t in serotypes:
        if t[3] is not None and t[3] not in kept_ids:
            raise ValidationError(
                f"V10: serotype '{t[0]}' : famille large ecartee '{t[3]}'"
            )
    link_rows = [(sid, hla, via) for (sid, hla), via in sorted(links.items())]
    for sid, hla, _ in link_rows:
        if hla not in hla_ids or sid not in kept_ids:
            raise ValidationError(f"V10: lien orphelin ({sid}, {hla})")
    report = {
        "dropped_alleles": dropped_alleles,
        "dropped_serotypes": dropped_serotypes,
    }
    return serotypes, link_rows, report


# =====================================================================
# CONSTRUCTION
# =====================================================================

def _populate(con, data, version, universe, is_synthetic, notes, built_at,
              serotypes=(), serotype_links=()):
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
    declared = declared_organs(data)
    # La strate `all` d'abord, puis les organes dans l'ordre du vocabulaire.
    stratum_rank = {ALL_ORGANS: 0}
    for i, organ in enumerate(
        [k for k, *_ in ORGANS if k in declared]
        + [o for o in declared if o not in ORGAN_META]
    ):
        stratum_rank[organ] = i + 1
    assocs = sorted(
        data["associations"],
        key=lambda r: (stratum_rank[r["organ"].strip()], r["hla"], r["outcome"]),
    )
    organs_of = {r["pmid"]: article_organs(r) for r in articles}

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

    # --- organs / article_organs ----------------------------------------
    n_by_organ = Counter(o for organs in organs_of.values() for o in organs)
    ordered_organs = [k for k, *_ in ORGANS if k in declared]
    ordered_organs += [o for o in declared if o not in ORGAN_META]
    con.executemany(
        "INSERT INTO organs (organ, label, short_label, slug, sort_order, "
        "n_articles) VALUES (?,?,?,?,?,?)",
        [
            (organ, *ORGAN_META[organ], i, n_by_organ[organ])
            for i, organ in enumerate(ordered_organs)
        ],
    )
    con.executemany(
        "INSERT INTO article_organs (pmid, organ, is_primary) VALUES (?,?,?)",
        [
            (pmid, organ, 1 if i == 0 else 0)
            for pmid in sorted(organs_of)
            for i, organ in enumerate(organs_of[pmid])
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

    con.executemany(
        "INSERT INTO outcome_organs (outcome, organ) VALUES (?,?)",
        [
            (outcome, organ)
            for outcome in present
            for organ in ordered_organs
            if organ in OUTCOME_ORGANS.get(outcome, ())
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

    # --- serotypes / serotype_alleles (referentiel projete, cf. V9/V10) --
    con.executemany(
        "INSERT INTO serotypes (serotype_id, locus, label, broad_serotype, "
        "kind, note) VALUES (?,?,?,?,?,?)",
        list(serotypes),
    )
    con.executemany(
        "INSERT INTO serotype_alleles (serotype_id, hla, via) VALUES (?,?,?)",
        list(serotype_links),
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
            r["organ"].strip(), r["hla"], r["outcome"], n_co, _int(r.get("n_positive")),
            _int(r.get("n_negated")), _int(r.get("n_hla_total")),
            _int(r.get("n_outcome_total")), _int(r.get("n_universe")),
            _float(r.get("pmi")), _float(r.get("npmi")), _float(r.get("log_odds")),
            odds_ratio, _float(r.get("or_ci_low")), _float(r.get("or_ci_high")),
            _float(r.get("pval_fisher")), fdr, _float(r.get("pval_two_sided")),
            fdr_two_sided, None, _int(r.get("first_year")),
            signal_level, is_significant,
        ))
    con.executemany(
        "INSERT INTO associations (organ, hla, outcome, n_cooccurrence, "
        "n_positive, n_negated, n_hla_total, n_outcome_total, n_universe, pmi, "
        "npmi, log_odds, odds_ratio, or_ci_low, or_ci_high, pval_fisher, fdr, "
        "pval_two_sided, fdr_two_sided, npmi_geo, first_year, signal_level, "
        "is_significant) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        assoc_rows,
    )

    # --- association_timeline / annual_counts / comptages par strate -----
    year_of = {r["pmid"]: _int(r.get("year")) for r in articles}
    timeline = Counter()
    hla_n = Counter()
    hla_pmids = defaultdict(set)
    out_n = Counter()
    out_pmids = defaultdict(set)
    for r in mentions:
        y = year_of[r["pmid"]]
        for st in [ALL_ORGANS] + organs_of[r["pmid"]]:
            timeline[(st, r["hla"], r["outcome"], y)] += 1
            hla_n[(st, r["hla"])] += 1
            hla_pmids[(st, r["hla"])].add(r["pmid"])
            out_n[(st, r["outcome"])] += 1
            out_pmids[(st, r["outcome"])].add(r["pmid"])

    def stratum_key(item):
        return (stratum_rank[item[0]],) + tuple(item[1:])

    con.executemany(
        "INSERT INTO association_timeline (organ, hla, outcome, year, n) "
        "VALUES (?,?,?,?,?)",
        [(*k, timeline[k]) for k in sorted(timeline, key=stratum_key)],
    )
    con.executemany(
        "INSERT INTO hla_organ_counts (organ, hla, n_articles, n_mentions) "
        "VALUES (?,?,?,?)",
        [(*k, len(hla_pmids[k]), hla_n[k]) for k in sorted(hla_n, key=stratum_key)],
    )
    con.executemany(
        "INSERT INTO outcome_organ_counts (organ, outcome, n_articles, n_mentions) "
        "VALUES (?,?,?,?)",
        [(*k, len(out_pmids[k]), out_n[k]) for k in sorted(out_n, key=stratum_key)],
    )

    annual = Counter()
    for r in articles:
        for st in [ALL_ORGANS] + organs_of[r["pmid"]]:
            annual[(st, year_of[r["pmid"]])] += 1
    con.executemany(
        "INSERT INTO annual_counts (organ, year, n) VALUES (?,?,?)",
        [(st, y, annual[(st, y)]) for st, y in sorted(annual, key=stratum_key)],
    )

    _populate_search_index(con, articles, ordered, by_id, present, display_of,
                           serotypes, serotype_links)


def _populate_search_index(con, articles, hla_ordered, hla_by_id, outcomes,
                           author_display, serotypes=(), serotype_links=()):
    """Index FTS5 unifie : alleles, complications, articles, auteurs.

    Insere dans un ordre stable (type puis identifiant) : le contenu des
    tables shadow FTS5 depend de l'ordre d'insertion.
    """
    # Specificites serologiques portees par chaque allele : elles entrent dans
    # son contenu indexe, pour que « DR15 » retrouve aussi DRB1*15 en
    # recherche plein texte.
    sero_of = defaultdict(set)
    for sid, hla, _ in serotype_links:
        sero_of[hla].add(sid)

    rows = []
    for h in sorted(hla_ordered):
        r = hla_by_id[h]
        rows.append((
            "allele", h, h,
            " ".join([h, r["locus"], r["hla_class"], r["resolution"]]
                     + sorted(sero_of.get(h, ()))),
        ))
    members = defaultdict(list)
    for sid, hla, _ in serotype_links:
        members[sid].append(hla)
    for sid, locus, label, broad, kind, _ in sorted(serotypes):
        rows.append((
            "serotype", sid, label,
            " ".join([sid, label, f"serotype {locus}", broad or ""]
                     + [m.replace("HLA-", "") for m in sorted(members[sid])]),
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
          notes=None, built_at=DEFAULT_BUILT_AT,
          reference_dir=DEFAULT_REFERENCE_DIR, strict_serotypes=False,
          allow_off_organ_outcomes=False):
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
    validate(data, n_articles_declared=len(data["articles"]),
             allow_off_organ_outcomes=allow_off_organ_outcomes)
    reference = read_serotype_reference(reference_dir)
    validate_serotype_reference(reference)
    serotypes, serotype_links, _ = project_serotypes(
        reference, data["hla_entities"], strict=strict_serotypes
    )

    tmp_dir = tempfile.mkdtemp(prefix="build_sqlite_")
    tmp_db = Path(tmp_dir) / "corpus.sqlite"
    try:
        con = sqlite3.connect(tmp_db)
        try:
            con.execute(f"PRAGMA page_size = {PAGE_SIZE}")
            con.execute("PRAGMA journal_mode = DELETE")
            con.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
            con.execute("PRAGMA foreign_keys = ON")

            _populate(con, data, version, universe, is_synthetic, notes, built_at,
                      serotypes, serotype_links)
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
    parser.add_argument("--reference", default=str(DEFAULT_REFERENCE_DIR),
                        help="Repertoire des referentiels (hla_serotypes.csv).")
    parser.add_argument("--strict-serotypes", action="store_true",
                        help="Echoue si un allele du referentiel serologique "
                             "est absent du corpus (V10) au lieu de l'ecarter.")
    parser.add_argument("--allow-off-organ-outcomes", action="store_true",
                        help="V16 : tolere des complications hors du champ des "
                             "organes de leur article (donnees reelles bruitees).")
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
            reference_dir=args.reference,
            strict_serotypes=args.strict_serotypes,
            allow_off_organ_outcomes=args.allow_off_organ_outcomes,
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
