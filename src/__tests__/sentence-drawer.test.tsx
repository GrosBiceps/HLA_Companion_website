import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";
import { HighlightedSentence } from "../components/HighlightedSentence";
import { SentenceDrawer } from "../components/SentenceDrawer";
import type { PairMention } from "../lib/types";

const sentence =
  "Recipients carrying HLA-DQB1*02:01 showed a higher incidence of de novo DSA.";

describe("HighlightedSentence", () => {
  it("restitue la phrase complete sans alteration", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="HLA-DQB1*02:01"
        outcomeSpan="DSA"
      />
    );
    expect(container.textContent).toBe(sentence);
  });

  it("surligne le span HLA et le span complication", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="HLA-DQB1*02:01"
        outcomeSpan="DSA"
      />
    );
    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(2);
    const texts = Array.from(marks).map((m) => m.textContent);
    expect(texts).toContain("HLA-DQB1*02:01");
    expect(texts).toContain("DSA");
  });

  it("ne casse pas si un span est absent de la phrase", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="INTROUVABLE"
        outcomeSpan="DSA"
      />
    );
    expect(container.textContent).toBe(sentence);
  });

  it("traite les spans contenant des caracteres regex speciaux", () => {
    const { container } = render(
      <HighlightedSentence
        sentence={sentence}
        hlaSpan="HLA-DQB1*02:01"
        outcomeSpan="DSA"
      />
    );
    // '*' ne doit pas etre interprete comme quantificateur
    expect(container.textContent).toBe(sentence);
    expect(container.querySelectorAll("mark").length).toBe(2);
  });
});

/**
 * Tiroir de phrases — les quatre invariants que ce composant doit tenir, et
 * qui sont chacun une regle de la spec plutot qu'un detail d'affichage :
 * la cle technique jamais montree, le caveat de polarite sur chaque negation,
 * le compteur d'en-tete egal a ce qui est reellement rendu, et l'onglet
 * « Negatives » qui filtre pour de vrai.
 */

const MENTIONS: PairMention[] = [
  {
    pairMentionId: 1,
    pmid: "36724061",
    hla: "HLA-DQB1*02:01",
    outcome: "DSA",
    sentence:
      "Recipients carrying HLA-DQB1*02:01 showed a higher incidence of DSA in this cohort.",
    hlaSpan: "HLA-DQB1*02:01",
    outcomeSpan: "DSA",
    polarity: "positive",
    negationTrigger: null,
    title: "Donor-specific antibodies after kidney transplantation",
    year: 2023,
    journal: "Am J Transplant",
    citedBy: 42,
  },
  {
    pairMentionId: 2,
    pmid: "35554877",
    hla: "HLA-DQB1*02:01",
    outcome: "DSA",
    sentence:
      "We found no significant association between HLA-DQB1*02:01 and DSA in this cohort.",
    hlaSpan: "HLA-DQB1*02:01",
    outcomeSpan: "DSA",
    polarity: "negated",
    negationTrigger: "no significant",
    title: "Absence of association in a single-centre cohort",
    year: 2022,
    journal: "Transplantation",
    citedBy: null,
  },
  {
    pairMentionId: 3,
    pmid: "15973820",
    hla: "HLA-DQB1*02:01",
    outcome: "DSA",
    sentence:
      "Recipients carrying HLA-DQB1*02:01 showed a higher incidence of donor-specific antibodies.",
    hlaSpan: "HLA-DQB1*02:01",
    outcomeSpan: "donor-specific antibodies",
    polarity: "positive",
    negationTrigger: null,
    title: "Early experience with HLA matching",
    year: 2005,
    journal: null,
    citedBy: 7,
  },
];

/** Installe un `fetch` qui repond comme /api/mentions, et rend le tiroir. */
async function renderDrawer(mentions: PairMention[] = MENTIONS) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ mentions }) })),
  );

  const utils = render(
    <SentenceDrawer
      hla="HLA-DQB1*02:01"
      outcome="DSA"
      label="Anticorps anti-HLA du donneur (DSA)"
      onClose={() => {}}
    />,
  );

  // Attendre la resolution du fetch : sans ca on testerait l'etat "Chargement".
  await waitFor(() =>
    expect(utils.container.querySelectorAll("li").length).toBeGreaterThan(0),
  );
  return utils;
}

/** Cartes de mention effectivement rendues (une <li> par mention). */
function renderedCards(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("li"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SentenceDrawer", () => {
  it("n'affiche jamais la cle technique de la complication", async () => {
    const { container } = await renderDrawer();

    // L'en-tete porte le libelle clinique...
    expect(container.textContent).toContain(
      "Anticorps anti-HLA du donneur (DSA)",
    );

    // ...et la cle `DSA` n'apparait qu'a l'interieur des phrases sources
    // anglaises citees, jamais comme etiquette de la complication : aucun
    // en-tete, aucun onglet, aucun badge ne la porte.
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const headerText = header!.textContent ?? "";
    expect(headerText).toContain("Anticorps anti-HLA du donneur (DSA)");
    // Retire le libelle clinique (qui contient legitimement "(DSA)") : ce qui
    // reste de l'en-tete ne doit plus contenir la cle nue.
    const withoutLabel = headerText.replace(
      "Anticorps anti-HLA du donneur (DSA)",
      "",
    );
    expect(withoutLabel).not.toMatch(/\bDSA\b/);
    // Aucune autre cle de pipeline ne fuit non plus.
    expect(container.textContent).not.toMatch(
      /\bgraft_loss\b|\brecurrent_GN\b|\backte_rejection\b/,
    );
  });

  it("montre le declencheur de negation et le caveat exact sur chaque mention negative", async () => {
    const { container } = await renderDrawer();

    // Le declencheur est rendu POUR LUI-MEME, pas seulement present dans la
    // phrase citee : on cherche la ligne « Négation détectée : "..." ».
    expect(
      screen.getByText(/Négation détectée\s*:.*no significant/),
    ).toBeTruthy();

    const caveats = screen.getAllByText(
      "Détection automatique — accord modéré, à vérifier",
    );
    const negatedCount = MENTIONS.filter(
      (m) => m.polarity === "negated",
    ).length;
    // Le caveat accompagne CHAQUE negation, il n'est pas pose une fois en tete.
    expect(caveats.length).toBe(negatedCount);
    expect(container.textContent).toContain("accord modéré, à vérifier");
  });

  it("annonce un nombre de mentions egal au nombre de cartes rendues", async () => {
    const { container } = await renderDrawer();

    const cards = renderedCards(container);
    expect(cards.length).toBe(MENTIONS.length);

    const header = container.querySelector("header")!;
    expect(header.textContent).toContain(`${MENTIONS.length} mentions`);
    expect(header.textContent).toContain("2 positives");
    expect(header.textContent).toContain("1 négative");
  });

  it("filtre reellement quand on passe a l'onglet Negatives", async () => {
    const { container } = await renderDrawer();

    const before = renderedCards(container).length;
    expect(before).toBe(3);

    const tab = screen.getByRole("button", { name: /Négatives/ });
    await act(async () => {
      tab.click();
    });

    const after = renderedCards(container);
    expect(after.length).toBeLessThan(before);
    expect(after.length).toBe(1);
    // Aucune carte positive ne survit au filtre.
    for (const card of after) {
      expect(card.textContent).toContain("NÉGATIVE");
      expect(card.textContent).not.toContain("POSITIVE");
    }
  });

  it("l'onglet par defaut est Toutes et montre aussi les negations", async () => {
    const { container } = await renderDrawer();
    // Regle dure : les negations ne sont jamais masquees par defaut.
    expect(container.textContent).toContain("NÉGATIVE");
    expect(container.textContent).toContain("POSITIVE");
    expect(renderedCards(container).length).toBe(MENTIONS.length);
  });

  it("propose les deux liens PubMed et fiche article pour chaque mention", async () => {
    const { container } = await renderDrawer();

    for (const mention of MENTIONS) {
      expect(
        container.querySelector(
          `a[href="https://pubmed.ncbi.nlm.nih.gov/${mention.pmid}/"]`,
        ),
      ).not.toBeNull();
      expect(
        container.querySelector(`a[href="/article/${mention.pmid}"]`),
      ).not.toBeNull();
    }
  });

  it("n'emploie aucun vocabulaire causal dans ses propres textes", async () => {
    const { container } = await renderDrawer();
    // On teste le chrome du tiroir, pas les phrases sources anglaises citees.
    const chrome =
      (container.querySelector("header")?.textContent ?? "") +
      (container.querySelector("footer")?.textContent ?? "");
    expect(chrome).not.toMatch(/associé à|lié à|risque de|prédit/i);
  });
});
