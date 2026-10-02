import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  buildConstellation,
  niceTicks,
  pickDiverse,
  type ConstellationInput,
} from "../components/landing/constellation";
import { OUTCOME_LABELS } from "../lib/labels";

// SearchBar (client) lit le routeur de l'App Router : hors de Next, on le
// remplace par un routeur inerte.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/",
}));

const { default: HomePage } = await import("../app/page");

function pair(
  hla: string,
  outcome: string,
  n: number,
  extra: Partial<ConstellationInput> = {},
): ConstellationInput {
  return {
    hla,
    locus: hla.replace(/^HLA-/, "").split("*")[0],
    hlaClass: /^HLA-D/.test(hla) ? "II" : "I",
    outcome,
    label: `Libellé ${outcome}`,
    category: "Rejet",
    signalLevel: "strong",
    nCooccurrence: n,
    ...extra,
  };
}

describe("buildConstellation", () => {
  const pairs = [
    pair("HLA-DQB1*02", "o1", 72),
    pair("HLA-A*02", "o2", 61),
    pair("HLA-DQB1*02", "o3", 40),
    pair("HLA-B*44", "o4", 47),
    pair("HLA-A*24", "o5", 42),
    pair("HLA-DQB1*02", "o1", 10), // doublon : ignore
  ];

  it("respecte les plafonds de colonnes et d'aretes", () => {
    const c = buildConstellation(pairs, { maxPerSide: 3, maxEdges: 4 });
    expect(c.alleles.length).toBeLessThanOrEqual(3);
    expect(c.outcomes.length).toBeLessThanOrEqual(3);
    expect(c.edges.length).toBeLessThanOrEqual(4);
  });

  it("retient la paire la plus marquee et favorise les noeuds partages", () => {
    const c = buildConstellation(pairs, { maxPerSide: 3, maxEdges: 3 });
    const keys = c.edges.map((e) => `${e.hla}|${e.outcome}`);
    expect(keys[0]).toBe("HLA-DQB1*02|o1");
    // 40 x 2 (allele deja present) l'emporte sur 61 x 1.
    expect(keys[1]).toBe("HLA-DQB1*02|o3");
  });

  it("chaque arete pointe vers ses deux noeuds, sans doublon", () => {
    const c = buildConstellation(pairs);
    const seen = new Set<string>();
    for (const e of c.edges) {
      expect(c.alleles[e.from].hla).toBe(e.hla);
      expect(c.outcomes[e.to].outcome).toBe(e.outcome);
      const k = `${e.hla}|${e.outcome}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("ordonne les alleles classe I avant classe II", () => {
    const c = buildConstellation(pairs);
    const classes = c.alleles.map((a) => a.hlaClass);
    expect(classes).toEqual([...classes].sort());
  });

  it("rend une constellation vide sans erreur", () => {
    expect(buildConstellation([])).toEqual({ alleles: [], outcomes: [], edges: [] });
  });
});

describe("pickDiverse", () => {
  it("une paire par complication, par groupe 2-digit, et plafond par locus", () => {
    const out = pickDiverse(
      [
        pair("HLA-DQB1*02:01", "o1", 9),
        pair("HLA-DQB1*02", "o2", 8), // meme groupe que DQB1*02:01
        pair("HLA-A*02:01", "o1", 7), // meme complication
        pair("HLA-DQB1*03:01", "o3", 6),
        pair("HLA-DQB1*05:01", "o4", 5), // 3e DQB1 : plafond 2
        pair("HLA-A*01:01", "o5", 4),
      ],
      6,
    );
    expect(out.map((p) => p.hla)).toEqual(["HLA-DQB1*02:01", "HLA-DQB1*03:01", "HLA-A*01:01"]);
  });
});

describe("niceTicks", () => {
  it("produit des graduations rondes couvrant le maximum", () => {
    expect(niceTicks(216, 5)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(niceTicks(9, 4)).toEqual([0, 2.5, 5, 7.5, 10].map(Math.round));
    expect(niceTicks(0)).toEqual([0]);
    const t = niceTicks(1234, 4);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1234);
  });
});

describe("page d'accueil (rendu)", () => {
  // Rendu par test : la bibliotheque de test demonte l'arbre apres chacun.
  const renderPage = () => {
    const { container } = render(<HomePage />);
    return { container, text: container.textContent ?? "" };
  };

  it("porte le cadrage epistemique avant le champ de recherche", () => {
    const { container, text } = renderPage();
    const notice = container.querySelector("#epistemic-notice-title");
    expect(notice).not.toBeNull();
    expect(text).toMatch(/pas des associations cliniques ni causales/i);
    expect(text).toMatch(/78,75/);
    expect(text).toMatch(/0,44/);
    // La ligne de cadrage du bandeau precede le champ de recherche.
    const framing = text.search(/Pas des associations cliniques ni causales/);
    const search = container.querySelector("#search-input");
    expect(search).not.toBeNull();
    const before = (search!.compareDocumentPosition(
      [...container.querySelectorAll("strong")].find((s) =>
        /Pas des associations cliniques/.test(s.textContent ?? ""),
      )!,
    ) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    expect(framing).toBeGreaterThan(-1);
    expect(before).toBe(true);
  });

  it("rend les cinq sections et les points d'entree principaux", () => {
    const { container } = renderPage();
    for (const id of ["corpus", "lire", "signaux", "entrees", "contexte"]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const h of ["/graph", "/matrice", "/methode", "/carte-v1"]) {
      expect(hrefs).toContain(h);
    }
    expect(hrefs).toContain(`/allele/${encodeURIComponent("HLA-DQB1*02:01")}`);
  });

  it("n'affiche aucune metrique brute d'association", () => {
    const { text } = renderPage();
    expect(text).not.toMatch(/NPMI|odds ratio|\bFDR\b|p\s*=\s*0|IC 95/i);
  });

  it("n'emploie aucun terme causal proscrit", () => {
    const { text } = renderPage();
    const lower = text.toLowerCase();
    for (const term of ["associé à", "lié à", "risque de", "prédit", "provoque", "entraîne"]) {
      expect(lower).not.toContain(term);
    }
  });

  it("n'affiche aucune cle technique de complication comme texte", () => {
    const { container, text } = renderPage();
    // Les cles a souligne (graft_loss...) ne doivent jamais apparaitre ;
    // les sigles (DSA, ABMR) n'apparaissent qu'entre parentheses dans un
    // libelle, ou dans une phrase source citee.
    for (const key of Object.keys(OUTCOME_LABELS).filter((k) => k.includes("_"))) {
      expect(text).not.toContain(key);
    }
    for (const el of container.querySelectorAll("a, li, span, p, h3")) {
      if (el.children.length > 0) continue;
      const own = (el.textContent ?? "").trim();
      expect(Object.keys(OUTCOME_LABELS)).not.toContain(own);
    }
  });
});
