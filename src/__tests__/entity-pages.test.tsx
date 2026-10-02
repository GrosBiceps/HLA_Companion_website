import { describe, it, expect } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import AllelePage from "../app/allele/[hla]/page";
import AlleleIndexPage from "../app/allele/page";
import ComplicationIndexPage from "../app/complication/page";
import OutcomePage from "../app/complication/[outcome]/page";
import ArticlePage from "../app/article/[pmid]/page";
import MethodePage from "../app/methode/page";
import NotFound from "../app/not-found";
import { getDb } from "../lib/db";
import { EXTRACTION_METRICS } from "../lib/extraction-metrics";
import { CLEAR_MIN_N, OUTCOME_LABELS, STRONG_MIN_N } from "../lib/labels";
import {
  getAssociationsForAllele,
  getAssociationsForOutcome,
} from "../lib/queries";

/**
 * Garde-fous des fiches redessinees et des nouvelles pages d'index.
 *
 * Memes regles que le reste du site, verifiees sur le RENDU : aucun terme
 * causal, aucune cle technique, aucune metrique hors du depliant « Détail
 * statistique », le non-significatif present (grise, pas masque), et le
 * chemin de verification (bouton vers les phrases) sur chaque ligne.
 */

const CAUSAL = [
  "associé à",
  "associée à",
  "lié à",
  "liée à",
  "risque de",
  "prédit",
  "provoque",
  "entraîne",
];
const METRICS = ["npmi", "odds ratio", "fdr", "ic 95", "p-valeur", "p =", "p<"];

async function renderAsync(element: Promise<React.ReactElement>) {
  return render(await element);
}

/** Texte visible hors des depliants <details> (ou vivent les metriques). */
function textOutsideDetails(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const d of Array.from(clone.querySelectorAll("details"))) d.remove();
  return (clone.textContent ?? "").toLowerCase();
}

function expectNoRawKeys(text: string) {
  for (const key of Object.keys(OUTCOME_LABELS)) {
    if (key.includes("_")) expect(text).not.toContain(key);
  }
}

describe("fiche allele redessinee", () => {
  const hla = "HLA-DQB1*02:01";
  const page = () =>
    renderAsync(
      AllelePage({ params: Promise.resolve({ hla: encodeURIComponent(hla) }) }),
    );

  it("porte le cadrage de page et le lien vers le graphe centre", async () => {
    const { container } = await page();
    expect(
      container.querySelector('[aria-label="Comment lire cette fiche"]'),
    ).not.toBeNull();
    const graph = container.querySelector(
      `a[href="/graph?center=${encodeURIComponent(hla)}"]`,
    );
    expect(graph).not.toBeNull();
  });

  it("n'expose aucune metrique ni terme causal hors des depliants", async () => {
    const { container } = await page();
    const text = textOutsideDetails(container);
    for (const m of METRICS) expect(text).not.toContain(m);
    for (const c of CAUSAL) expect(text).not.toContain(c);
    expectNoRawKeys(container.textContent ?? "");
  });

  it("garde chaque complication visible, chacune avec son chemin vers les phrases", async () => {
    const { container } = await page();
    const rows = getAssociationsForAllele(hla);
    const text = container.textContent ?? "";
    for (const r of rows) expect(text).toContain(r.label);
    // Une carte par ligne marquee, une ligne compacte par ligne sous le
    // seuil : autant de boutons « phrases » que de lignes.
    const buttons = Array.from(container.querySelectorAll("button")).filter(
      (b) =>
        /phrase/i.test(b.textContent + (b.getAttribute("aria-label") ?? "")),
    );
    expect(buttons.length).toBe(rows.length);
  });

  it("chaque ligne du profil pointe vers une ancre existante", async () => {
    const { container } = await page();
    const anchors = Array.from(container.querySelectorAll('a[href^="#co-"]'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      const id = a.getAttribute("href")!.slice(1);
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });

  it("affiche le nombre d'articles DISTINCTS, pas le compteur de mentions", async () => {
    const { container } = await page();
    const n = (
      getDb()
        .prepare(
          "SELECT COUNT(DISTINCT pmid) AS n FROM hla_mentions WHERE hla = ?",
        )
        .get(hla) as {
        n: number;
      }
    ).n;
    expect(container.textContent).toContain(`Mentionné dans ${n} articles`);
  });
});

describe("fiche complication redessinee", () => {
  const page = (o = "ABMR") =>
    renderAsync(OutcomePage({ params: Promise.resolve({ outcome: o }) }));

  it("rend tous les alleles co-mentionnes, groupes par locus", async () => {
    const { container } = await page();
    const rows = getAssociationsForOutcome("ABMR");
    const links = new Set(
      Array.from(container.querySelectorAll('a[href^="/allele/"]')).map((a) =>
        decodeURIComponent(a.getAttribute("href")!.slice("/allele/".length)),
      ),
    );
    for (const r of rows) expect(links.has(r.hla)).toBe(true);
    expect(container.textContent).toContain("Locus DRB1");
  });

  it("n'expose aucune metrique ni cle technique", async () => {
    const { container } = await page("graft_loss");
    const text = textOutsideDetails(container);
    for (const m of METRICS) expect(text).not.toContain(m);
    expectNoRawKeys(container.textContent ?? "");
    expect(
      container.querySelector('a[href="/graph?center=graft_loss"]'),
    ).not.toBeNull();
  });
});

describe("fiche article redessinee", () => {
  it("surligne le titre avec les entites reperees", async () => {
    const { pmid } = getDb()
      .prepare(
        "SELECT pmid FROM pair_mentions GROUP BY pmid ORDER BY COUNT(*) DESC LIMIT 1",
      )
      .get() as { pmid: string };
    const { container } = await renderAsync(
      ArticlePage({ params: Promise.resolve({ pmid }) }),
    );
    const h1 = container.querySelector("h1")!;
    expect(h1.querySelectorAll("mark").length).toBeGreaterThan(0);
    // Le titre surligne reste le titre exact.
    const title = (
      getDb()
        .prepare("SELECT title FROM articles WHERE pmid = ?")
        .get(pmid) as { title: string }
    ).title;
    expect(h1.textContent).toBe(title);
    expect(container.querySelector('a[href^="/auteur/"]')).not.toBeNull();
  });
});

describe("index des alleles", () => {
  const link = (hla: string) => `a[href="/allele/${encodeURIComponent(hla)}"]`;

  it("liste les classes, loci et groupes avec un filtre", async () => {
    const { container } = render(AlleleIndexPage());
    expect(container.querySelector("#classe-I")).not.toBeNull();
    expect(container.querySelector("#locus-DQB1")).not.toBeNull();
    expect(container.querySelector("#locus-DRB3")).not.toBeNull();
    expect(container.querySelector(link("HLA-DQB1*02"))).not.toBeNull();
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    const text = (container.textContent ?? "").toLowerCase();
    for (const c of CAUSAL) expect(text).not.toContain(c);
  });

  it("replie les groupes par defaut (liste de ~900 alleles legere) et les deplie a la demande", () => {
    const { container } = render(AlleleIndexPage());
    // aucune pastille 4-digit n'est rendue tant qu'un groupe est replie
    expect(container.querySelector(link("HLA-DQB1*02:01"))).toBeNull();
    expect(container.querySelectorAll('a[href^="/allele/"]').length).toBeLessThan(400);
    const toggle = container.querySelector(
      'button[aria-label*="HLA-DQB1*02"][aria-expanded="false"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(link("HLA-DQB1*02:01"))).not.toBeNull();
  });

  it("filtre sur un allele : un groupe correspondant montre ses 4-digit", () => {
    const { container } = render(AlleleIndexPage());
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "dqb1 02" } });
    expect(container.querySelector(link("HLA-DQB1*02:01"))).not.toBeNull();
    expect(container.querySelector(link("HLA-A*02"))).toBeNull();
  });

  it("filtre sur un serotype : « DR15 » montre les alleles DRB1*15 et la bande du serotype", () => {
    const { container } = render(AlleleIndexPage());
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "DR15" } });
    expect(container.querySelector(link("HLA-DRB1*15"))).not.toBeNull();
    expect(container.querySelector(link("HLA-DRB1*15:01"))).not.toBeNull();
    expect(container.querySelector(link("HLA-DRB1*04"))).toBeNull();
    expect(
      container.querySelector('a[href="/serotype/DR15"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Sérotype DR15");
  });

  it("filtre sur un serotype fin (DR17) : seuls ses 4-digit sont montres sous leur groupe", () => {
    const { container } = render(AlleleIndexPage());
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "dr 17" } });
    expect(container.querySelector(link("HLA-DRB1*03:01"))).not.toBeNull();
    // 03:02 est DR18, pas DR17
    expect(container.querySelector(link("HLA-DRB1*03:02"))).toBeNull();
  });
});

describe("fiche allele : serotypes et navigation de resolution", () => {
  const render4 = () =>
    renderAsync(
      AllelePage({
        params: Promise.resolve({ hla: encodeURIComponent("HLA-DQB1*02:01") }),
      }),
    );
  const render2 = () =>
    renderAsync(
      AllelePage({
        params: Promise.resolve({ hla: encodeURIComponent("HLA-DRB1*15") }),
      }),
    );

  it("un 4-digit montre ses serotypes, son groupe parent et ses freres", async () => {
    const { container } = await render4();
    expect(container.querySelector('a[href="/serotype/DQ2"]')).not.toBeNull();
    const parent = container.querySelector(
      `a[href="/allele/${encodeURIComponent("HLA-DQB1*02")}"]`,
    );
    expect(parent).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Groupe parent et allèles voisins"]'),
    ).not.toBeNull();
  });

  it("un 2-digit liste tous ses 4-digit avec leurs articles", async () => {
    const { container } = await render2();
    const nav = container.querySelector('[aria-label="Allèles 4-digit du groupe"]')!;
    expect(nav).not.toBeNull();
    const n = (
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM hla_entities WHERE parent_hla = 'HLA-DRB1*15'")
        .get() as { n: number }
    ).n;
    expect(n).toBeGreaterThan(5);
    // tuiles visibles + celles repliees dans « Voir les N autres » : toutes sont liees
    expect(nav.querySelectorAll('a[href^="/allele/HLA-DRB1*15%3A"]').length).toBe(n);
    expect(container.querySelector('a[href="/serotype/DR15"]')).not.toBeNull();
    expect(container.querySelector('a[href="/serotype/DR2"]')).not.toBeNull();
  });
});

describe("index des complications", () => {
  it("liste les 7 categories et les libelles cliniques, jamais les cles", () => {
    const { container } = render(ComplicationIndexPage());
    const text = container.textContent ?? "";
    for (const { label } of Object.values(OUTCOME_LABELS))
      expect(text).toContain(label);
    expectNoRawKeys(text);
    expect(container.querySelectorAll('section[id^="cat-"]').length).toBe(7);
    expect(
      container.querySelector('a[href="/complication/ABMR"]'),
    ).not.toBeNull();
    const lower = text.toLowerCase();
    for (const m of METRICS) expect(lower).not.toContain(m);
  });
});

describe("page methode", () => {
  it("expose les seuils reels du calcul de signal et les metriques d'extraction", () => {
    const { container } = render(MethodePage());
    const text = container.textContent ?? "";
    expect(text).toContain(`n ≥ ${STRONG_MIN_N}`);
    expect(text).toContain(`${CLEAR_MIN_N} ≤ n`);
    expect(text).toContain("Benjamini–Hochberg");
    expect(text).toContain(EXTRACTION_METRICS.precisionPct);
    expect(text).toContain(EXTRACTION_METRICS.negationKappa);
    expect(text).toMatch(/corpus A/);
    expect(text).toMatch(/corpus B/);
    expect(text).toContain("Données synthétiques");
    const lower = text.toLowerCase();
    for (const c of CAUSAL) expect(lower).not.toContain(c);
  });

  it("garde l'encart epistemique non refermable", () => {
    const { container } = render(MethodePage());
    expect(container.querySelector("#epistemic-notice-title")).not.toBeNull();
  });
});

describe("page 404", () => {
  it("dit que l'absence n'est pas un resultat et renvoie vers les index", () => {
    const { container } = render(NotFound());
    expect(container.textContent).toContain("Ce n'est pas un résultat");
    expect(container.querySelector('a[href="/allele"]')).not.toBeNull();
    expect(container.querySelector('a[href="/complication"]')).not.toBeNull();
  });
});
