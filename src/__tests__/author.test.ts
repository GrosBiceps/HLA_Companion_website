import { describe, it, expect } from "vitest";
import {
  getAuthor,
  getAuthorPublications,
  getAuthorInterests,
  getCoAuthors,
  getAssociationsForOutcome,
  getOutcome,
  getArticle,
  getArticleMentions,
} from "../lib/queries";
import { getDb } from "../lib/db";
import { OUTCOME_LABELS, SIGNAL_LEVELS } from "../lib/labels";

/**
 * ECART ASSUME AU BRIEF, ligne « expect(Array.isArray(interests)) ».
 *
 * Le brief demande a `getAuthorInterests` d'agreger « les entites HLA ET les
 * complications » : deux referentiels distincts, qu'un seul tableau ne peut
 * pas porter sans perdre la distinction (un HlaEntity et un Outcome n'ont ni
 * les memes champs ni la meme page de destination). La signature retenue est
 * donc `{hla, outcomes}`, et `Array.isArray` sur cet objet vaudrait `false`.
 *
 * L'assertion n'est pas affaiblie, elle est reportee sur les deux branches,
 * et durcie : non seulement elles sont des tableaux, mais elles sont NON
 * VIDES pour un auteur prolifique, elles portent un compte positif, et aucune
 * complication n'y sort sa cle technique a la place de son libelle clinique.
 */

/** L'auteur le plus prolifique du corpus (loi de Lotka : il en existe un). */
function topAuthorId(): string {
  const row = getDb()
    .prepare(
      "SELECT author_id AS id FROM authors ORDER BY n_publications DESC LIMIT 1",
    )
    .get() as { id: string };
  return row.id;
}

describe("fiche auteur", () => {
  it("retrouve un auteur et ses publications", () => {
    const id = topAuthorId();
    const author = getAuthor(id);
    expect(author).not.toBeNull();

    const pubs = getAuthorPublications(id);
    expect(pubs.length).toBe(author!.nPublications);

    // Le compte declare doit aussi egaler le compte reel de la jointure :
    // c'est cette derniere qui produit la liste affichee.
    const joined = getDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM article_authors WHERE author_id = ?",
      )
      .get(id) as { n: number };
    expect(pubs.length).toBe(joined.n);
  });

  it("trie les publications de la plus recente a la plus ancienne", () => {
    const pubs = getAuthorPublications(topAuthorId());
    expect(pubs.length).toBeGreaterThan(1);
    for (let i = 1; i < pubs.length; i += 1) {
      expect(pubs[i].year).toBeLessThanOrEqual(pubs[i - 1].year);
    }
  });

  it("retourne null pour un auteur inconnu", () => {
    expect(getAuthor("auteur-inexistant-zzz")).toBeNull();
    expect(getAuthorPublications("auteur-inexistant-zzz")).toEqual([]);
  });

  it("deduit des centres d'interet non vides", () => {
    const interests = getAuthorInterests(topAuthorId());

    expect(Array.isArray(interests.hla)).toBe(true);
    expect(Array.isArray(interests.outcomes)).toBe(true);
    expect(interests.hla.length).toBeGreaterThan(0);
    expect(interests.outcomes.length).toBeGreaterThan(0);

    for (const item of interests.hla) {
      expect(item.nArticles).toBeGreaterThan(0);
      expect(item.entity.hla).toBeTruthy();
    }
    for (const item of interests.outcomes) {
      expect(item.nArticles).toBeGreaterThan(0);
      // Jamais la cle technique : le libelle clinique, et un libelle qui
      // differe bien de la cle.
      expect(item.entity.label).toBeTruthy();
      expect(item.entity.label).not.toBe(item.entity.outcome);
      expect(OUTCOME_LABELS[item.entity.outcome]).toBeDefined();
    }
  });

  it("classe les centres d'interet du plus frequent au moins frequent", () => {
    const interests = getAuthorInterests(topAuthorId());
    for (let i = 1; i < interests.hla.length; i += 1) {
      expect(interests.hla[i].nArticles).toBeLessThanOrEqual(
        interests.hla[i - 1].nArticles,
      );
    }
    for (let i = 1; i < interests.outcomes.length; i += 1) {
      expect(interests.outcomes[i].nArticles).toBeLessThanOrEqual(
        interests.outcomes[i - 1].nArticles,
      );
    }
  });

  it("liste des co-auteurs sans inclure l'auteur lui-meme", () => {
    const id = topAuthorId();
    const co = getCoAuthors(id);
    expect(co.length).toBeGreaterThan(0);
    expect(co.every((c) => c.authorId !== id)).toBe(true);
    for (let i = 1; i < co.length; i += 1) {
      expect(co[i].nSharedArticles).toBeLessThanOrEqual(
        co[i - 1].nSharedArticles,
      );
    }
    for (const c of co) {
      expect(c.nSharedArticles).toBeGreaterThan(0);
      expect(c.displayName).toBeTruthy();
    }
  });
});

describe("navigation inverse par complication", () => {
  it("retourne les HLA co-cites avec une complication", () => {
    const rows = getAssociationsForOutcome("DSA");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.outcome).toBe("DSA");
      expect(r.hla).toBeTruthy();
    }
  });

  it("porte le libelle clinique, jamais la cle brute", () => {
    for (const r of getAssociationsForOutcome("graft_loss")) {
      expect(r.label).toBe(OUTCOME_LABELS.graft_loss.label);
      expect(r.label).not.toBe("graft_loss");
    }
  });

  it("trie par force de signal puis par effectif", () => {
    const rank = (level: string) => {
      const i = SIGNAL_LEVELS.indexOf(level as never);
      return i === -1 ? SIGNAL_LEVELS.length : i;
    };
    for (const outcome of ["DSA", "ABMR", "graft_loss"]) {
      const rows = getAssociationsForOutcome(outcome);
      for (let i = 1; i < rows.length; i += 1) {
        const prev = rows[i - 1];
        const cur = rows[i];
        expect(rank(cur.signalLevel)).toBeGreaterThanOrEqual(
          rank(prev.signalLevel),
        );
        if (rank(cur.signalLevel) === rank(prev.signalLevel)) {
          expect(cur.nCooccurrence).toBeLessThanOrEqual(prev.nCooccurrence);
        }
      }
    }
  });

  it("ne masque ni les negations ni le non significatif", () => {
    const all = getDb()
      .prepare("SELECT DISTINCT outcome FROM associations")
      .all() as { outcome: string }[];

    let seenNonSignificant = 0;
    let dbRows = 0;
    for (const { outcome } of all) {
      const rows = getAssociationsForOutcome(outcome);
      const n = getDb()
        .prepare("SELECT COUNT(*) AS n FROM associations WHERE outcome = ?")
        .get(outcome) as { n: number };
      // Aucune ligne perdue : la requete ne filtre rien.
      expect(rows.length).toBe(n.n);
      dbRows += n.n;
      seenNonSignificant += rows.filter((r) => !r.isSignificant).length;
    }
    expect(dbRows).toBeGreaterThan(0);
    expect(seenNonSignificant).toBeGreaterThan(0);
  });

  it("getOutcome retourne le libelle clinique et null si inconnu", () => {
    const o = getOutcome("DSA");
    expect(o).not.toBeNull();
    expect(o!.label).toBe(OUTCOME_LABELS.DSA.label);
    expect(o!.category).toBe("Immunisation");
    expect(getOutcome("outcome_inexistant")).toBeNull();
  });
});

describe("fiche article", () => {
  it("retrouve un article et ses mentions de paire", () => {
    const row = getDb()
      .prepare(
        `SELECT pmid FROM pair_mentions
          GROUP BY pmid ORDER BY COUNT(*) DESC LIMIT 1`,
      )
      .get() as { pmid: string };

    const article = getArticle(row.pmid);
    expect(article).not.toBeNull();
    expect(article!.title).toBeTruthy();

    const mentions = getArticleMentions(row.pmid);
    expect(mentions.length).toBeGreaterThan(0);
    for (const m of mentions) {
      expect(m.pmid).toBe(row.pmid);
      expect(m.sentence).toBeTruthy();
      // Le span retombe sur la cle quand la colonne est nulle : jamais null.
      expect(m.hlaSpan).toBeTruthy();
      expect(m.outcomeSpan).toBeTruthy();
      expect(OUTCOME_LABELS[m.outcome]).toBeDefined();
    }
  });

  it("retourne null / vide pour un PMID inconnu", () => {
    expect(getArticle("00000000")).toBeNull();
    expect(getArticleMentions("00000000")).toEqual([]);
  });
});
