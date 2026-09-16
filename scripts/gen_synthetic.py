"""Generateur de donnees synthetiques pour le compagnon bibliometrique HLA.

Les donnees produites sont FICTIVES. Elles respectent le contrat de schema du
vrai pipeline (cf. scripts/schema.sql) pour que toute l'interface puisse etre
developpee et testee sans acces aux donnees reelles, mais elles ne doivent
JAMAIS etre presentees comme des resultats : un bandeau les signale partout.

Proprietes garanties par construction (les tests en dependent) :

* Determinisme : a seed fixee, les CSV sont identiques octet pour octet.
  Toute l'alea passe par une instance locale `random.Random(seed)` ; le module
  `random` global n'est jamais utilise.
* Les spans sont des sous-chaines litterales de leur phrase : l'UI surligne par
  recherche de sous-chaine, une violation casserait la vue la plus importante.
* Les `associations` sont AGREGEES a partir des `pair_mentions` reellement
  emis, jamais tirees independamment : la validation V3 du builder verifie
  `associations.n_cooccurrence == COUNT(pair_mentions)` pour chaque paire.

Usage :
    python scripts/gen_synthetic.py --out data/synthetic --n-articles 400 --seed 42
"""

import argparse
import csv
import math
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from random import Random

sys.path.insert(0, str(Path(__file__).resolve().parent))

from labels import OUTCOME_LABELS

# =====================================================================
# CONSTANTES DE DOMAINE
# =====================================================================

YEAR_MIN = 1990
YEAR_MAX = 2026

JOURNALS = [
    ("American Journal of Transplantation", "Am J Transplant"),
    ("Transplantation", "Transplantation"),
    ("Nephrology Dialysis Transplantation", "Nephrol Dial Transplant"),
    ("HLA", "HLA"),
    ("Human Immunology", "Hum Immunol"),
]

COUNTRIES = [
    "France",
    "United States",
    "United Kingdom",
    "Germany",
    "Netherlands",
    "Canada",
    "Spain",
    "Italy",
    "Japan",
    "Australia",
]

SURNAMES = [
    "Wiebe", "Nickerson", "Loupy", "Lefaucheur", "Jordan", "Tambur",
    "Duquesnoy", "Claas", "Heidt", "Gebel", "Bray", "Reed", "Zachary",
    "Montgomery", "Stegall", "Gaston", "Kaplan", "Meier-Kriesche",
    "Halloran", "Sellares", "Einecke", "Mengel", "Randhawa", "Colvin",
    "Sis", "Racusen", "Solez", "Haas", "Bagnasco", "Rabant", "Anglicheau",
    "Legendre", "Thaunat", "Morelon", "Dubois", "Caillard", "Moulin",
    "Bertrand", "Garrigue", "Taupin", "Suberbielle", "Charron", "Mooney",
]

GIVEN_INITIALS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M",
                  "N", "P", "R", "S", "T", "V"]

TITLE_OPENERS = [
    "Impact of {hla} on {outcome} after kidney transplantation",
    "{hla} and the risk of {outcome} in renal transplant recipients",
    "Association between {hla} mismatch and {outcome}: a cohort study",
    "{outcome} in kidney transplantation: the role of {hla}",
    "Long-term outcomes of {hla}-mismatched kidney transplantation: focus on {outcome}",
    "Revisiting {hla} as a predictor of {outcome} in renal allograft recipients",
    "Eplet-level {hla} matching and {outcome} after renal transplantation",
    "A single-center analysis of {hla} and {outcome} in kidney transplant recipients",
]

ABSTRACT_BACKGROUND = [
    "The contribution of HLA compatibility to long-term renal allograft outcome remains debated.",
    "Donor-specific alloimmunity is a leading cause of late kidney allograft failure.",
    "Molecular-level HLA matching has been proposed to refine immunological risk stratification.",
    "Risk stratification at transplantation still relies largely on antigen-level HLA matching.",
]

ABSTRACT_METHODS = [
    "We retrospectively analyzed a single-center cohort of consecutive kidney transplant recipients.",
    "Recipients transplanted over a ten-year period were included and followed prospectively.",
    "High-resolution HLA typing was imputed from antigen-level data for donor-recipient pairs.",
    "Multivariable Cox regression was used to adjust for recipient age, sex and induction therapy.",
]

ABSTRACT_RESULTS = [
    "Baseline characteristics were comparable between the exposed and unexposed groups.",
    "Median follow-up was 7.4 years after transplantation.",
    "Protocol biopsies were available for a subset of the cohort.",
    "Sensitivity analyses excluding retransplant recipients gave consistent estimates.",
]

ABSTRACT_CONCLUSION = [
    "These findings support incorporating molecular HLA compatibility into allocation algorithms.",
    "Prospective validation in an independent cohort is required before clinical implementation.",
    "Our results should be interpreted with caution given the observational design.",
    "Antigen-level matching alone may be insufficient to capture immunological risk.",
]

# Formes de surface plausibles pour chaque outcome. La forme retenue est
# INSEREE TELLE QUELLE dans la phrase, et ressortie comme outcome_span :
# la propriete "span est une sous-chaine de la phrase" est donc structurelle.
OUTCOME_SPANS = {
    "ABMR": ["ABMR", "antibody-mediated rejection", "acute ABMR"],
    "TCMR": ["TCMR", "T cell-mediated rejection", "borderline TCMR"],
    "acute_rejection": ["acute rejection", "biopsy-proven acute rejection"],
    "chronic_rejection": ["chronic rejection", "IFTA", "interstitial fibrosis and tubular atrophy"],
    "mixed_rejection": ["mixed rejection", "mixed ABMR and TCMR"],
    "DSA": ["DSA", "de novo DSA", "donor-specific antibodies"],
    "sensitization": ["sensitization", "HLA sensitization", "broad sensitization"],
    "complement_activation": ["complement activation", "C1q-binding DSA", "C4d deposition"],
    "HLA_mismatch_outcome": ["HLA mismatch", "eplet mismatch load", "antigen mismatch"],
    "DGF": ["DGF", "delayed graft function"],
    "graft_loss": ["graft loss", "death-censored graft loss", "allograft failure"],
    "graft_survival": ["graft survival", "death-censored graft survival"],
    "eGFR": ["eGFR decline", "impaired eGFR", "reduced estimated GFR"],
    "BK_nephropathy": ["BK nephropathy", "BK virus nephropathy", "BK viremia"],
    "CMV": ["CMV infection", "CMV disease", "CMV viremia"],
    "PTLD": ["PTLD", "post-transplant lymphoproliferative disorder"],
    "skin_cancer": ["skin cancer", "cutaneous squamous cell carcinoma"],
    "NODAT": ["NODAT", "new-onset diabetes after transplantation"],
    "recurrent_GN": ["recurrent glomerulonephritis", "GN recurrence"],
    "FSGS": ["recurrent FSGS", "FSGS recurrence", "focal segmental glomerulosclerosis"],
    "IgA_nephropathy": ["IgA nephropathy", "recurrent IgA nephropathy"],
}

POSITIVE_TEMPLATE = (
    "Recipients carrying {hla} showed a higher incidence of {outcome} in this cohort."
)
NEGATED_TEMPLATE = (
    "We found no significant association between {hla} and {outcome} in this cohort."
)
NEGATION_TRIGGER = "no significant"
NEGATED_RATE = 0.15

# =====================================================================
# HIERARCHIE HLA
# =====================================================================

CLASS_ROOTS = [("HLA-class-I", "I"), ("HLA-class-II", "II")]
LOCI = [
    ("A", "I"), ("B", "I"), ("C", "I"),
    ("DRB1", "II"), ("DQB1", "II"), ("DPB1", "II"),
]
TWO_DIGIT = [
    ("HLA-A*01", "A"), ("HLA-A*02", "A"),
    ("HLA-B*07", "B"), ("HLA-B*08", "B"),
    ("HLA-DRB1*03", "DRB1"), ("HLA-DRB1*04", "DRB1"), ("HLA-DRB1*15", "DRB1"),
    ("HLA-DQB1*02", "DQB1"), ("HLA-DQB1*03", "DQB1"), ("HLA-DQB1*06", "DQB1"),
    ("HLA-DPB1*01", "DPB1"), ("HLA-DPB1*04", "DPB1"),
]
# Deux allèles 4-digit par 2-digit.
FOUR_DIGIT_SUFFIXES = ["01", "02"]

CLASS_OF_LOCUS = dict(LOCI)
CLASS_ROOT_OF_CLASS = {"I": "HLA-class-I", "II": "HLA-class-II"}

# L'allele vitrine du prototype : les taches ulterieures l'interrogent
# nommement et attendent une couverture genereuse (dont un signal faible).
SHOWCASE_HLA = "HLA-DQB1*02:01"


def build_hla_entities():
    """Construit la hierarchie HLA sur 4 niveaux, acyclique par construction.

    Retourne une liste de dicts prets a ecrire, dans un ordre stable
    (racines, loci, 2-digit, 4-digit, entites speciales).
    """
    rows = []

    for root, hla_class in CLASS_ROOTS:
        rows.append({
            "hla": root, "locus": root, "hla_class": hla_class,
            "resolution": "class", "parent_hla": "",
        })

    for locus, hla_class in LOCI:
        rows.append({
            "hla": locus, "locus": locus, "hla_class": hla_class,
            "resolution": "class", "parent_hla": CLASS_ROOT_OF_CLASS[hla_class],
        })

    for two, locus in TWO_DIGIT:
        rows.append({
            "hla": two, "locus": locus, "hla_class": CLASS_OF_LOCUS[locus],
            "resolution": "2-digit", "parent_hla": locus,
        })

    for two, locus in TWO_DIGIT:
        for suffix in FOUR_DIGIT_SUFFIXES:
            rows.append({
                "hla": f"{two}:{suffix}", "locus": locus,
                "hla_class": CLASS_OF_LOCUS[locus],
                "resolution": "4-digit", "parent_hla": two,
            })

    rows.append({
        "hla": "HLA-mismatch", "locus": "mismatch", "hla_class": "unknown",
        "resolution": "mismatch_count", "parent_hla": "",
    })
    rows.append({
        "hla": "HLA-eplet", "locus": "eplet", "hla_class": "unknown",
        "resolution": "eplet", "parent_hla": "",
    })

    return rows


# =====================================================================
# STATISTIQUES (stdlib uniquement)
# =====================================================================

def _log_comb(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def _hypergeom_pmf(a, row1, row2, col1):
    """P(X = a) pour la loi hypergeometrique de la table 2x2.

    row1 = a+b, row2 = c+d, col1 = a+c, total = row1+row2.
    """
    total = row1 + row2
    b = row1 - a
    c = col1 - a
    d = row2 - c
    if min(a, b, c, d) < 0:
        return 0.0
    return math.exp(
        _log_comb(row1, a) + _log_comb(row2, c) - _log_comb(total, col1)
    )


def fisher_exact(a, b, c, d):
    """Test exact de Fisher sur la table [[a, b], [c, d]].

    Retourne (p_greater, p_two_sided). Le pipeline reel utilise le test
    unilateral 'greater' ; on fournit aussi le bilateral, seul capable de
    rendre visible une depletion (OR < 1) — cf. labels.compute_signal_level.
    """
    row1, row2, col1 = a + b, c + d, a + c
    lo = max(0, col1 - row2)
    hi = min(row1, col1)

    probs = {k: _hypergeom_pmf(k, row1, row2, col1) for k in range(lo, hi + 1)}
    total = sum(probs.values())
    if total <= 0:
        return 1.0, 1.0

    p_greater = sum(p for k, p in probs.items() if k >= a) / total

    # Bilateral par la methode des densites (comme scipy.stats.fisher_exact).
    p_obs = probs[a] * (1 + 1e-9)
    p_two = sum(p for p in probs.values() if p <= p_obs) / total

    return min(1.0, max(0.0, p_greater)), min(1.0, max(0.0, p_two))


def benjamini_hochberg(pvals):
    """Correction FDR de Benjamini-Hochberg, monotone, valeurs dans [0,1]."""
    n = len(pvals)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: (pvals[i], i))
    adjusted = [0.0] * n
    running = 1.0
    for rank, idx in enumerate(reversed(order), start=1):
        i = n - rank + 1  # rang 1-based dans l'ordre croissant
        value = pvals[idx] * n / i
        running = min(running, value)
        adjusted[idx] = min(1.0, max(0.0, running))
    return adjusted


def pmi_npmi(n_ab, n_a, n_b, n_universe):
    """PMI et PMI normalisee (Bouma). npmi est borne dans [-1, 1]."""
    if n_ab <= 0 or n_a <= 0 or n_b <= 0 or n_universe <= 0:
        return 0.0, 0.0
    p_ab = n_ab / n_universe
    p_a = n_a / n_universe
    p_b = n_b / n_universe
    pmi = math.log(p_ab / (p_a * p_b))
    denom = -math.log(p_ab)
    if denom == 0:
        npmi = 0.0
    else:
        npmi = pmi / denom
    return pmi, min(1.0, max(-1.0, npmi))


def odds_ratio_with_ci(a, b, c, d):
    """OR de Haldane-Anscombe (correction +0.5) et IC 95 % de Woolf."""
    a_, b_, c_, d_ = a + 0.5, b + 0.5, c + 0.5, d + 0.5
    orr = (a_ * d_) / (b_ * c_)
    log_or = math.log(orr)
    se = math.sqrt(1 / a_ + 1 / b_ + 1 / c_ + 1 / d_)
    return orr, log_or, math.exp(log_or - 1.96 * se), math.exp(log_or + 1.96 * se)


# =====================================================================
# GENERATION
# =====================================================================

def _draw_year(rng):
    """Annee dans [YEAR_MIN, YEAR_MAX], densite croissante vers le recent.

    Les sparklines doivent avoir une forme plausible : la litterature HLA en
    transplantation a explose dans les annees 2010.
    """
    span = YEAR_MAX - YEAR_MIN
    # u**0.45 concentre la masse vers le haut de l'intervalle.
    u = rng.random() ** 0.45
    return YEAR_MIN + int(round(u * span))


def _make_authors(rng):
    """Liste d'auteurs suivant approximativement une loi de Lotka.

    Quelques auteurs tres prolifiques, une longue traine d'auteurs uniques :
    la fiche auteur doit etre demontrable sur les donnees synthetiques.
    """
    pool = []
    for i, surname in enumerate(SURNAMES):
        initial = GIVEN_INITIALS[i % len(GIVEN_INITIALS)]
        name = f"{surname} {initial}"
        # Poids ~ 1/rank^1.6 : loi de puissance facon Lotka.
        weight = 1.0 / ((i + 1) ** 1.6)
        pool.append((name, weight))
    names = [n for n, _ in pool]
    weights = [w for _, w in pool]
    return names, weights


def _weighted_sample(rng, population, weights, k):
    """Tirage sans remise pondere, deterministe pour un rng donne."""
    pop = list(population)
    wts = list(weights)
    picked = []
    k = min(k, len(pop))
    for _ in range(k):
        total = sum(wts)
        if total <= 0:
            break
        r = rng.random() * total
        acc = 0.0
        for i, w in enumerate(wts):
            acc += w
            if r <= acc:
                picked.append(pop.pop(i))
                wts.pop(i)
                break
        else:
            picked.append(pop.pop(-1))
            wts.pop(-1)
    return picked


def _build_pair_plan(rng, hla_rows):
    """Choisit les paires (hla, outcome) qui porteront du signal.

    Les paires "protectrices" sont marquees ici mais leurs comptages restent
    derives des pair_mentions : seule la table de contingence de fond (les
    cellules b, c, d) est orientee pour produire OR < 1.
    """
    mentionable = [
        r["hla"] for r in hla_rows
        if r["resolution"] in ("4-digit", "2-digit", "mismatch_count", "eplet")
    ]
    outcomes = list(OUTCOME_LABELS)

    # Paires "fortes" : bien couvertes, signal net.
    strong_pairs = [
        (SHOWCASE_HLA, "DSA"),
        (SHOWCASE_HLA, "ABMR"),
        (SHOWCASE_HLA, "graft_loss"),
        ("HLA-DQB1*02", "DSA"),
        ("HLA-DRB1*03", "ABMR"),
        ("HLA-mismatch", "acute_rejection"),
        ("HLA-eplet", "DSA"),
        ("HLA-DRB1*15", "IgA_nephropathy"),
        ("HLA-B*08", "sensitization"),
        ("HLA-A*02", "CMV"),
    ]
    # Paires vitrine a signal faible : l'UI doit pouvoir montrer un "weak"
    # sur la fiche de l'allele vedette.
    weak_pairs = [
        (SHOWCASE_HLA, "NODAT"),
        (SHOWCASE_HLA, "skin_cancer"),
        (SHOWCASE_HLA, "BK_nephropathy"),
    ]
    # Paires protectrices : demonstration du badge "signal inverse".
    inverse_pairs = [
        ("HLA-DRB1*04", "acute_rejection"),
        ("HLA-DPB1*04", "DGF"),
        ("HLA-A*01", "graft_loss"),
    ]

    plan = {}
    for pair in strong_pairs:
        plan[pair] = {"kind": "strong", "weight": rng.uniform(8.0, 14.0)}
    for pair in weak_pairs:
        plan[pair] = {"kind": "weak", "weight": rng.uniform(1.0, 2.0)}
    for pair in inverse_pairs:
        plan[pair] = {"kind": "inverse", "weight": rng.uniform(2.5, 4.0)}

    # Bruit de fond : beaucoup de paires faiblement couvertes.
    for hla in mentionable:
        for outcome in outcomes:
            if (hla, outcome) in plan:
                continue
            if rng.random() < 0.22:
                plan[(hla, outcome)] = {
                    "kind": "background",
                    "weight": rng.uniform(0.15, 1.0),
                }

    return plan


def _sentence_for(rng, hla, outcome, negated):
    """Construit une phrase et ses spans.

    Les spans sont extraits des valeurs effectivement interpolees, donc
    litteralement presents dans la phrase — propriete verifiee par les tests
    et dont depend le surlignage de l'UI.
    """
    outcome_span = rng.choice(OUTCOME_SPANS[outcome])
    hla_span = hla
    template = NEGATED_TEMPLATE if negated else POSITIVE_TEMPLATE
    sentence = template.format(hla=hla_span, outcome=outcome_span)
    return sentence, hla_span, outcome_span


def _generate(rng, n_articles):
    """Coeur de la generation. Retourne (articles, authors, hla_rows,
    pair_mentions, associations), tous deja ordonnes pour l'ecriture."""

    hla_rows = build_hla_entities()

    # --- Articles ------------------------------------------------------
    pmids = set()
    articles = []
    author_names, author_weights = _make_authors(rng)
    authors = []

    plan = _build_pair_plan(rng, hla_rows)
    plan_keys = sorted(plan)
    plan_weights = [plan[k]["weight"] for k in plan_keys]

    pair_mentions = []

    for _ in range(n_articles):
        while True:
            pmid = str(rng.randint(10_000_000, 99_999_999))
            if pmid not in pmids:
                pmids.add(pmid)
                break

        year = _draw_year(rng)
        journal, abbrev = rng.choice(JOURNALS)

        # Les paires citees par cet article : tirage pondere par le plan.
        n_pairs = rng.choices([1, 2, 3, 4], weights=[35, 35, 20, 10])[0]
        pairs = _weighted_sample(rng, plan_keys, plan_weights, n_pairs)

        lead_hla, lead_outcome = pairs[0]
        lead_label = OUTCOME_SPANS[lead_outcome][0]
        title = rng.choice(TITLE_OPENERS).format(hla=lead_hla, outcome=lead_label)

        abstract = " ".join([
            rng.choice(ABSTRACT_BACKGROUND),
            rng.choice(ABSTRACT_METHODS),
            rng.choice(ABSTRACT_RESULTS),
            rng.choice(ABSTRACT_CONCLUSION),
        ])

        articles.append({
            "pmid": pmid,
            "doi": f"10.1111/synth.{pmid}",
            "title": title,
            "abstract": abstract,
            "year": year,
            "journal": journal,
            "journal_abbrev": abbrev,
            "country": rng.choice(COUNTRIES),
            "language": "eng",
            # Les articles anciens ont eu plus de temps pour etre cites.
            "cited_by": max(0, int(rng.expovariate(1 / 18.0) * (1 + (YEAR_MAX - year) / 12))),
            "source": "synthetic",
            "graft_assignment": "Kidney" if rng.random() < 0.88 else rng.choice(
                ["Multi-organ", "Unspecified"]
            ),
        })

        # --- Auteurs ---
        n_authors = rng.choices([2, 3, 4, 5, 6, 8], weights=[10, 20, 25, 20, 15, 10])[0]
        for position, name in enumerate(
            _weighted_sample(rng, author_names, author_weights, n_authors), start=1
        ):
            authors.append({"pmid": pmid, "author": name, "position": position})

        # --- pair_mentions ---
        # Emis AVANT toute agregation : les associations en decoulent.
        seen_idx = set()
        for hla, outcome in pairs:
            sentence_idx = rng.randint(0, 9)
            while sentence_idx in seen_idx:
                sentence_idx = (sentence_idx + 1) % 10
            seen_idx.add(sentence_idx)

            negated = rng.random() < NEGATED_RATE
            sentence, hla_span, outcome_span = _sentence_for(rng, hla, outcome, negated)
            pair_mentions.append({
                "pmid": pmid,
                "hla": hla,
                "outcome": outcome,
                "sentence": sentence,
                "hla_span": hla_span,
                "outcome_span": outcome_span,
                "polarity": "negated" if negated else "positive",
                "negation_trigger": NEGATION_TRIGGER if negated else "",
                "sentence_idx": sentence_idx,
            })

    # --- Associations : AGREGEES depuis pair_mentions -------------------
    year_of = {a["pmid"]: a["year"] for a in articles}

    pair_counts = Counter()
    pair_positive = Counter()
    pair_negated = Counter()
    pair_first_year = {}
    hla_articles = defaultdict(set)
    outcome_articles = defaultdict(set)

    for m in pair_mentions:
        key = (m["hla"], m["outcome"])
        pair_counts[key] += 1
        if m["polarity"] == "negated":
            pair_negated[key] += 1
        else:
            pair_positive[key] += 1
        y = year_of[m["pmid"]]
        pair_first_year[key] = min(pair_first_year.get(key, y), y)
        hla_articles[m["hla"]].add(m["pmid"])
        outcome_articles[m["outcome"]].add(m["pmid"])

    n_universe = len(articles)

    rows = []
    for key in sorted(pair_counts):
        hla, outcome = key
        n_ab = pair_counts[key]
        n_a = len(hla_articles[hla])
        n_b = len(outcome_articles[outcome])

        # Table 2x2 au niveau article. a est le nombre d'articles portant la
        # paire ; n_ab (comptage de mentions) le majore parfois, donc on borne.
        a = min(n_ab, n_a, n_b)
        kind = plan.get(key, {}).get("kind", "background")

        # Chaque article porte 1 a 4 paires : les marges brutes (n_a, n_b) sont
        # donc tres larges devant n_universe, et l'independance y attendrait
        # deja a ~ n_a*n_b/N. Une paire fortement co-citee ressortirait alors
        # non significative, et une paire rare ressortirait faussement
        # "protectrice". On rapporte la table a l'univers des articles citant
        # l'outcome, ou l'enrichissement se lit correctement.
        b = max(1, n_a - a)          # articles avec l'HLA, sans cet outcome
        c = max(1, n_b - a)          # articles avec l'outcome, sans cet HLA
        # Complement : articles ne citant ni l'un ni l'autre. Reste positif et
        # assez grand pour que le test ait de la puissance.
        d = max(a + b + c, n_universe)

        if kind == "inverse":
            # Depletion authentique : l'HLA est sous-represente parmi les
            # articles citant l'outcome. On deplace la masse vers b et c sans
            # toucher a la cellule a, qui reste derivee des pair_mentions.
            b = b + 8 * max(a, 1) + 15
            c = c + 8 * max(a, 1) + 15

        pmi, npmi = pmi_npmi(n_ab, n_a, n_b, n_universe)
        orr, log_or, ci_low, ci_high = odds_ratio_with_ci(a, b, c, d)
        p_greater, p_two = fisher_exact(a, b, c, d)

        rows.append({
            "hla": hla,
            "outcome": outcome,
            "n_cooccurrence": n_ab,
            "n_positive": pair_positive[key],
            "n_negated": pair_negated[key],
            "n_hla_total": n_a,
            "n_outcome_total": n_b,
            "n_universe": n_universe,
            "pmi": round(pmi, 6),
            "npmi": round(npmi, 6),
            "log_odds": round(log_or, 6),
            "odds_ratio": round(orr, 6),
            "or_ci_low": round(ci_low, 6),
            "or_ci_high": round(ci_high, 6),
            "pval_fisher": p_greater,
            "fdr": None,
            "pval_two_sided": p_two,
            "fdr_two_sided": None,
            "first_year": pair_first_year[key],
        })

    fdr = benjamini_hochberg([r["pval_fisher"] for r in rows])
    fdr_two = benjamini_hochberg([r["pval_two_sided"] for r in rows])
    for r, f1, f2 in zip(rows, fdr, fdr_two):
        r["pval_fisher"] = round(r["pval_fisher"], 8)
        r["pval_two_sided"] = round(r["pval_two_sided"], 8)
        r["fdr"] = round(f1, 8)
        r["fdr_two_sided"] = round(f2, 8)

    pair_mentions.sort(key=lambda m: (m["pmid"], m["hla"], m["outcome"], m["sentence_idx"]))

    return articles, authors, hla_rows, pair_mentions, rows


# =====================================================================
# ECRITURE
# =====================================================================

ARTICLE_COLUMNS = ["pmid", "doi", "title", "abstract", "year", "journal",
                   "journal_abbrev", "country", "language", "cited_by",
                   "source", "graft_assignment"]
AUTHOR_COLUMNS = ["pmid", "author", "position"]
HLA_COLUMNS = ["hla", "locus", "hla_class", "resolution", "parent_hla"]
PAIR_MENTION_COLUMNS = ["pmid", "hla", "outcome", "sentence", "hla_span",
                        "outcome_span", "polarity", "negation_trigger",
                        "sentence_idx"]
ASSOCIATION_COLUMNS = ["hla", "outcome", "n_cooccurrence", "n_positive",
                       "n_negated", "n_hla_total", "n_outcome_total",
                       "n_universe", "pmi", "npmi", "log_odds", "odds_ratio",
                       "or_ci_low", "or_ci_high", "pval_fisher", "fdr",
                       "pval_two_sided", "fdr_two_sided", "first_year"]


def _write_csv(path, columns, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main(out_dir, n_articles=400, seed=42):
    """Genere les cinq CSV synthetiques dans out_dir (cree si absent).

    Deterministe : a seed fixee, les fichiers sont identiques octet pour octet.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    rng = Random(seed)
    articles, authors, hla_rows, pair_mentions, associations = _generate(rng, n_articles)

    _write_csv(out / "articles.csv", ARTICLE_COLUMNS, articles)
    _write_csv(out / "authors.csv", AUTHOR_COLUMNS, authors)
    _write_csv(out / "hla_entities.csv", HLA_COLUMNS, hla_rows)
    _write_csv(out / "pair_mentions.csv", PAIR_MENTION_COLUMNS, pair_mentions)
    _write_csv(out / "associations.csv", ASSOCIATION_COLUMNS, associations)

    return {
        "articles": len(articles),
        "authors": len(authors),
        "hla_entities": len(hla_rows),
        "pair_mentions": len(pair_mentions),
        "associations": len(associations),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Genere un jeu de donnees synthetique deterministe."
    )
    parser.add_argument("--out", default="data/synthetic",
                        help="Repertoire de sortie (cree si absent).")
    parser.add_argument("--n-articles", type=int, default=400,
                        help="Nombre d'articles a generer.")
    parser.add_argument("--seed", type=int, default=42,
                        help="Graine aleatoire (determinisme).")
    args = parser.parse_args()

    stats = main(out_dir=args.out, n_articles=args.n_articles, seed=args.seed)
    for name, count in stats.items():
        print(f"{name:>15} : {count}")
    print(f"\nEcrit dans {os.path.abspath(args.out)}")
