import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AuthorPage, {
  HOMONYM_RESERVATION,
} from "../app/auteur/[authorId]/page";
import OutcomePage from "../app/complication/[outcome]/page";
import ArticlePage from "../app/article/[pmid]/page";
import { getDb } from "../lib/db";
import { OUTCOME_LABELS } from "../lib/labels";

/**
 * Les pages sont des Server Components asynchrones : elles retournent une
 * promesse d'element. On l'attend, puis on rend l'element obtenu — il ne
 * contient que des composants synchrones a ce stade.
 */
async function renderPage(element: Promise<React.ReactElement>) {
  return render(await element);
}

function topAuthorId(): string {
  const row = getDb()
    .prepare(
      "SELECT author_id AS id FROM authors ORDER BY n_publications DESC LIMIT 1",
    )
    .get() as { id: string };
  return row.id;
}

describe("fiche auteur — reserve sur l'homonymie", () => {
  /**
   * EXIGENCE DURE DE LA TACHE. La spec impose cette phrase, mot pour mot,
   * sous le nom de l'auteur. Elle est l'attenuation d'un defaut connu : le
   * rattachement par normalisation du nom fusionne les homonymes et scinde
   * les changements de nom. Sans elle, un lecteur qui trouve la publication
   * d'un homonyme sur « sa » fiche conclut que tout le site est faux.
   *
   * Ce test verrouille le LIBELLE EXACT : une reformulation le casse, ce qui
   * est l'effet recherche.
   */
  it("affiche la reserve exacte, mot pour mot", async () => {
    const { container } = await renderPage(
      AuthorPage({ params: Promise.resolve({ authorId: topAuthorId() }) }),
    );
    expect(container.textContent).toContain(
      "Identité déduite par normalisation du nom — homonymes possibles",
    );
  });

  it("la constante exportee porte bien ce libelle", () => {
    expect(HOMONYM_RESERVATION).toBe(
      "Identité déduite par normalisation du nom — homonymes possibles",
    );
  });

  it("place la reserve AVANT le premier chiffre de la page", async () => {
    // L'incertitude doit qualifier la donnee, donc preceder le decompte de
    // publications. Une reserve reléguée en bas de page serait lue apres la
    // conclusion qu'elle est censee nuancer.
    const { container } = await renderPage(
      AuthorPage({ params: Promise.resolve({ authorId: topAuthorId() }) }),
    );
    const text = container.textContent ?? "";
    const reserveAt = text.indexOf(HOMONYM_RESERVATION);
    const countAt = text.indexOf("publication");
    expect(reserveAt).toBeGreaterThanOrEqual(0);
    expect(countAt).toBeGreaterThan(reserveAt);
  });

  it("n'emploie aucun terme causal interdit", async () => {
    const { container } = await renderPage(
      AuthorPage({ params: Promise.resolve({ authorId: topAuthorId() }) }),
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["associé à", "lié à", "risque de", "prédit"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("n'affiche aucune cle technique de complication", async () => {
    const { container } = await renderPage(
      AuthorPage({ params: Promise.resolve({ authorId: topAuthorId() }) }),
    );
    const text = container.textContent ?? "";
    for (const key of Object.keys(OUTCOME_LABELS)) {
      // Les cles a underscore sont les plus reconnaissables ; aucune ne doit
      // apparaitre telle quelle dans le texte rendu.
      if (key.includes("_")) expect(text).not.toContain(key);
    }
  });
});

describe("fiche complication", () => {
  it("affiche le libelle clinique et jamais la cle brute", async () => {
    const { container } = await renderPage(
      OutcomePage({ params: Promise.resolve({ outcome: "graft_loss" }) }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain(OUTCOME_LABELS.graft_loss.label);
    expect(text).not.toContain("graft_loss");
  });

  it("n'expose aucune metrique hors du depliant de la carte", async () => {
    const { container } = await renderPage(
      OutcomePage({ params: Promise.resolve({ outcome: "DSA" }) }),
    );
    // Les metriques existent dans le DOM, mais uniquement DANS le <details>
    // de AssociationCard. Hors de ces replis, aucun nom de metrique.
    for (const details of Array.from(container.querySelectorAll("details"))) {
      details.remove();
    }
    const text = (container.textContent ?? "").toLowerCase();
    for (const metric of ["npmi", "odds ratio", "fdr", "ic 95"]) {
      expect(text).not.toContain(metric);
    }
  });

  it("n'emploie aucun terme causal interdit", async () => {
    const { container } = await renderPage(
      OutcomePage({ params: Promise.resolve({ outcome: "DSA" }) }),
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["associé à", "lié à", "risque de", "prédit"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("fiche article", () => {
  it("affiche le lien PubMed et les libelles cliniques", async () => {
    const row = getDb()
      .prepare(
        `SELECT pmid FROM pair_mentions
          GROUP BY pmid ORDER BY COUNT(*) DESC LIMIT 1`,
      )
      .get() as { pmid: string };

    const { container } = await renderPage(
      ArticlePage({ params: Promise.resolve({ pmid: row.pmid }) }),
    );
    const text = container.textContent ?? "";

    const link = container.querySelector(
      `a[href="https://pubmed.ncbi.nlm.nih.gov/${row.pmid}/"]`,
    );
    expect(link).not.toBeNull();

    // Les mentions de cet article doivent apparaitre par leur libelle.
    const outcomes = getDb()
      .prepare("SELECT DISTINCT outcome FROM pair_mentions WHERE pmid = ?")
      .all(row.pmid) as { outcome: string }[];
    expect(outcomes.length).toBeGreaterThan(0);
    for (const { outcome } of outcomes) {
      expect(text).toContain(OUTCOME_LABELS[outcome].label);
      if (outcome.includes("_")) expect(text).not.toContain(outcome);
    }
  });

  it("surligne les spans des phrases sources", async () => {
    const row = getDb()
      .prepare(
        `SELECT pmid FROM pair_mentions
          GROUP BY pmid ORDER BY COUNT(*) DESC LIMIT 1`,
      )
      .get() as { pmid: string };

    const { container } = await renderPage(
      ArticlePage({ params: Promise.resolve({ pmid: row.pmid }) }),
    );
    expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);
  });
});
