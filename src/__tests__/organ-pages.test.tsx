import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

import AllelePage from "../app/allele/[hla]/page";
import AlleleIndexPage from "../app/allele/page";
import ComplicationIndexPage from "../app/complication/page";
import OutcomePage from "../app/complication/[outcome]/page";
import SerotypeIndexPage from "../app/serotype/page";
import SerotypePage from "../app/serotype/[serotype]/page";
import ArticlePage from "../app/article/[pmid]/page";
import AuthorPage from "../app/auteur/[authorId]/page";
import MatricePage from "../app/matrice/page";
import GraphPage from "../app/graph/page";
import CarteV1Page from "../app/carte-v1/page";
import MethodePage from "../app/methode/page";

import { HeaderContent } from "../components/shell/HeaderBar";
import { OrganSelector } from "../components/organ/OrganSelector";
import { SearchCommand } from "../components/SearchBar";
import { getDb } from "../lib/db";
import { getOrgans, getTopAuthors } from "../lib/queries";
import { OUTCOME_LABELS } from "../lib/labels";
import { ALL_ORGANS, ORGANS, ORGAN_KEYS, organSlug, type OrganKey } from "../lib/organ";

/**
 * PAGES PAR ORGANE — chacune se rend sans erreur avec chaque organe, reporte
 * l'organe sur TOUS ses liens internes (sauf les pages de contenu `/methode`,
 * `/guide`, qui n'en dependent pas), et respecte les garde-fous (aucune cle
 * brute, aucun terme causal, aucune metrique hors d'un depliant).
 */

const push = vi.fn();
let pathname = "/allele";
vi.mock("next/navigation", async (orig) => {
  const actual = await orig<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => pathname,
    useSearchParams: () => new URLSearchParams(),
  };
});

const CAUSAL = ["associé à", "associée à", "lié à", "liée à", "risque de", "prédit", "provoque", "entraîne"];
const METRICS = ["npmi", "odds ratio", "fdr", "ic 95", "p-valeur", "p =", "p<"];
const ORGAN_RAW_KEYS: string[] = ORGANS.map((o) => o.key);

type SP = Promise<Record<string, string | string[] | undefined>>;
const sp = (organ: OrganKey | "all", extra: Record<string, string> = {}): SP =>
  Promise.resolve({ ...(organ === ALL_ORGANS ? {} : { organe: organSlug(organ)! }), ...extra });

const db = getDb();
const SHOWCASE = "HLA-DQB1*02:01";
const pmid = (db.prepare("SELECT pmid FROM article_organs GROUP BY pmid HAVING COUNT(*) > 1 LIMIT 1").get() as { pmid: string }).pmid;
const author = getTopAuthors(1)[0].authorId;

/** Pages d'un organe : nom + rendu serveur. */
function pagesFor(organ: OrganKey | "all"): [string, () => Promise<ReactElement>][] {
  const params = (o: object) => Promise.resolve(o as never);
  const outcomeKey = organ === "hsct" ? "acute_gvhd" : organ === "heart" ? "cardiac_allograft_vasculopathy" : "ABMR";
  return [
    ["fiche allele", () => AllelePage({ params: params({ hla: encodeURIComponent(SHOWCASE) }), searchParams: sp(organ) })],
    ["fiche allele 2-digit", () => AllelePage({ params: params({ hla: encodeURIComponent("HLA-DRB1*15") }), searchParams: sp(organ) })],
    ["index des alleles", () => AlleleIndexPage({ searchParams: sp(organ) })],
    ["index des complications", () => ComplicationIndexPage({ searchParams: sp(organ) })],
    ["fiche complication", () => OutcomePage({ params: params({ outcome: outcomeKey }), searchParams: sp(organ) })],
    ["index des serotypes", () => SerotypeIndexPage({ searchParams: sp(organ) })],
    ["fiche serotype", () => SerotypePage({ params: params({ serotype: "DR15" }), searchParams: sp(organ) })],
    ["fiche article", () => ArticlePage({ params: params({ pmid }), searchParams: sp(organ) })],
    ["fiche auteur", () => AuthorPage({ params: params({ authorId: author }), searchParams: sp(organ) })],
    ["matrice", () => MatricePage({ searchParams: sp(organ) })],
    ["matrice 4-digit", () => MatricePage({ searchParams: sp(organ, { resolution: "4-digit", locus: "A" }) })],
    ["graphe", () => GraphPage({ searchParams: sp(organ, { depth: "1" }) })],
  ];
}

/** Liens internes de la page qui doivent porter l'organe. */
const ORGAN_SWITCHERS =
  'nav[aria-label="Trier par organe"], [aria-label="Par organe"], ul[aria-label="Organes"], [aria-label="Mélange d\'organes"], [aria-label^="Strate affichée"], [aria-label="Filtrer ses publications par organe"]';
function internalLinks(container: HTMLElement): string[] {
  // Les commutateurs d'organe pointent, par nature, vers d'AUTRES organes.
  const clone = container.cloneNode(true) as HTMLElement;
  for (const n of Array.from(clone.querySelectorAll(ORGAN_SWITCHERS))) n.remove();
  return Array.from(clone.querySelectorAll("a[href]"))
    .map((a) => a.getAttribute("href")!)
    .filter((h) => h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/api/"))
    // pages de contenu, independantes de l'organe, et ancres locales
    .filter((h) => !/^\/(methode|guide|carte-v1)(\?|#|$)/.test(h));
}

describe.each(["all", ...ORGAN_KEYS] as (OrganKey | "all")[])("pages avec organe = %s", (organ) => {
  const slug = organ === ALL_ORGANS ? null : organSlug(organ);

  for (const [name, load] of pagesFor(organ)) {
    it(`${name} : rendu, liens internes, garde-fous`, async () => {
      const { container } = render(await load());
      expect(container.textContent!.length).toBeGreaterThan(100);

      // 1. report de l'organe sur tous les liens internes
      const links = internalLinks(container);
      // un auteur sans article dans la strate n'a legitimement aucun lien
      if (name !== "fiche auteur") expect(links.length).toBeGreaterThan(0);
      for (const href of links) {
        if (slug) expect(href, `${name}: ${href}`).toContain(`organe=${slug}`);
        else expect(href, `${name}: ${href}`).not.toContain("organe=");
      }

      // 2. garde-fous du vocabulaire : texte hors depliants
      const clone = container.cloneNode(true) as HTMLElement;
      for (const d of Array.from(clone.querySelectorAll("details"))) d.remove();
      const text = (clone.textContent ?? "").toLowerCase();
      for (const c of CAUSAL) expect(text, `${name}: ${c}`).not.toContain(c);
      for (const m of METRICS) expect(text, `${name}: ${m}`).not.toContain(m);

      // 3. aucune cle brute (complication ou organe) a l'ecran
      const full = container.textContent ?? "";
      for (const key of Object.keys(OUTCOME_LABELS)) {
        if (key.includes("_")) expect(full, `${name}: ${key}`).not.toContain(key);
      }
      // (les mots anglais des titres d'articles sont legitimes : on ne controle
      // que les elements qui AFFICHENT la cle seule, comme une puce ou un badge)
      const leaves = Array.from(container.querySelectorAll("*"))
        .filter((e) => e.children.length === 0)
        .map((e) => (e.textContent ?? "").trim().toLowerCase());
      for (const key of ORGAN_RAW_KEYS) {
        expect(leaves, `${name}: cle d'organe « ${key} »`).not.toContain(key);
      }
    });
  }

  if (organ !== ALL_ORGANS) {
    it("la strate est annoncee, avec son denominateur", async () => {
      const { container } = render(await AllelePage({
        params: Promise.resolve({ hla: encodeURIComponent(SHOWCASE) }),
        searchParams: sp(organ),
      }));
      const note = container.querySelector('[role="note"]')!;
      expect(note).not.toBeNull();
      const n = getOrgans().find((o) => o.key === organ)!.nArticles;
      expect(note.textContent!.replace(/\s/g, "")).toContain(String(n).replace(/\s/g, ""));
      expect(note.textContent).toMatch(/recalcul/);
    });
  }
});

describe("fiches : carte « Par organe » et puces d'organe", () => {
  it("la fiche allele ventile les articles par organe, chaque ligne selectionne l'organe", async () => {
    const { container } = render(await AllelePage({
      params: Promise.resolve({ hla: encodeURIComponent(SHOWCASE) }),
      searchParams: sp("all"),
    }));
    const card = container.querySelector('[aria-label="Par organe"]')!;
    expect(card).not.toBeNull();
    const links = Array.from(card.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links.length).toBe(7);
    for (const o of ORGANS) {
      expect(links).toContain(`/allele/${encodeURIComponent(SHOWCASE)}?organe=${o.slug}`);
    }
    expect(card.textContent).toContain("Cœur");
    expect(card.textContent).toMatch(/figure dans les deux/);
  });

  it("la fiche complication montre les organes auxquels elle s'applique", async () => {
    const { container } = render(await OutcomePage({
      params: Promise.resolve({ outcome: "bronchiolitis_obliterans" }),
      searchParams: sp("all"),
    }));
    const text = container.textContent ?? "";
    expect(text).toContain("S'applique à");
    expect(text).toContain("Poumon");
    expect(text).toContain("Syndrome de bronchiolite oblitérante (BOS)");
  });

  it("choisir un organe auquel la complication ne s'applique pas est dit, pas masque", async () => {
    const { container } = render(await OutcomePage({
      params: Promise.resolve({ outcome: "acute_gvhd" }),
      searchParams: sp("kidney"),
    }));
    expect(container.textContent).toMatch(/ne concerne pas cet organe/);
  });

  it("un article porte ses organes (plusieurs possibles) en puces cliquables", async () => {
    const { container } = render(await ArticlePage({
      params: Promise.resolve({ pmid }),
      searchParams: sp("all"),
    }));
    const chips = container.querySelectorAll('ul[aria-label="Organes"] a');
    expect(chips.length).toBeGreaterThan(1);
    for (const a of Array.from(chips)) {
      expect(a.getAttribute("href")).toMatch(new RegExp(`^/article/${pmid}\\?organe=[a-z]+$`));
    }
  });

  it("la fiche auteur montre le melange d'organes et filtre ses publications", async () => {
    const all = render(await AuthorPage({
      params: Promise.resolve({ authorId: author }),
      searchParams: sp("all"),
    }));
    expect(all.container.querySelector('[aria-label="Mélange d\'organes"]')).not.toBeNull();
    const nAll = all.container.querySelectorAll('a[href^="/article/"]').length;
    all.unmount();
    const mix = db.prepare(
      `SELECT ao.organ AS organ, COUNT(DISTINCT aa.pmid) AS n FROM article_authors aa
         JOIN article_organs ao ON ao.pmid = aa.pmid WHERE aa.author_id = ? GROUP BY ao.organ ORDER BY n DESC`,
    ).all(author) as { organ: OrganKey; n: number }[];
    const top = mix[0];
    const filtered = render(await AuthorPage({
      params: Promise.resolve({ authorId: author }),
      searchParams: sp(top.organ),
    }));
    const nOrgan = filtered.container.querySelectorAll('a[href^="/article/"]').length;
    expect(nOrgan).toBe(top.n);
    expect(nOrgan).toBeLessThanOrEqual(nAll);
  });
});

describe("index : tri / filtre par organe", () => {
  it("l'index des complications ne liste que celles de l'organe, avec un interrupteur pour tout voir", async () => {
    const heart = render(await ComplicationIndexPage({ searchParams: sp("heart") }));
    const text = heart.container.textContent ?? "";
    expect(text).toContain("Vasculopathie du greffon cardiaque (CAV)");
    expect(text).not.toContain("Réaction du greffon contre l'hôte aiguë (GVH aiguë)");
    expect(text).not.toContain("Néphropathie à BK virus");
    expect(text).toMatch(/Afficher aussi les \d+ complications d'autres organes/);
    heart.unmount();

    const showAll = render(await ComplicationIndexPage({ searchParams: sp("heart", { toutes: "1" }) }));
    const t2 = showAll.container.textContent ?? "";
    expect(t2).toContain("Réaction du greffon contre l'hôte aiguë (GVH aiguë)");
    expect(t2).toMatch(/Ne s'applique pas à Cœur/);
    expect(t2).toMatch(/Ne montrer que celles de Cœur/);
  });

  it("le bandeau « Trier par organe » est present sur les index, avec 8 choix", async () => {
    for (const load of [
      () => AlleleIndexPage({ searchParams: sp("all") }),
      () => SerotypeIndexPage({ searchParams: sp("all") }),
      () => ComplicationIndexPage({ searchParams: sp("all") }),
      () => MatricePage({ searchParams: sp("all") }),
    ]) {
      const { container, unmount } = render(await load());
      const strip = container.querySelector('nav[aria-label="Trier par organe"]')!;
      expect(strip).not.toBeNull();
      expect(strip.querySelectorAll("a").length).toBe(8);
      unmount();
    }
  });

  it("l'index des alleles : portee « cites » par defaut dans un organe, effectifs de la strate", async () => {
    const { container } = render(await AlleleIndexPage({ searchParams: sp("intestine") }));
    const pressed = container.querySelector('button[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/Cités/);
    // il y a bien moins d'alleles cites dans l'intestin que de groupes au total
    const links = container.querySelectorAll('a[href^="/allele/"]').length;
    expect(links).toBeGreaterThan(5);
    expect(links).toBeLessThan(400);
  });

  it("l'index des serotypes sait trier par nombre d'articles de l'organe", async () => {
    const { container } = render(await SerotypeIndexPage({ searchParams: sp("hsct") }));
    expect(container.querySelector('[aria-label="Tri"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Plus cités : GCSH/ }));
    const first = container.querySelector('section[id^="locus-"] a[href^="/serotype/"]')!;
    expect(first.getAttribute("href")).toContain("organe=gcsh");
  });
});

describe("carte v1 : propre au rein, hors selecteur", () => {
  it("dit explicitement qu'elle est propre au rein et que le selecteur ne s'y applique pas", () => {
    const { container } = render(CarteV1Page());
    const text = container.textContent ?? "";
    expect(text).toContain("Carte v1 — rein");
    expect(text).toMatch(/Organe : rein/);
    expect(text).toMatch(/sélecteur d'organe de l'en-tête ne s'y applique pas/);
  });
});

describe("methode : strates et perimetre des mesures", () => {
  it("explique la stratification et limite les metriques d'extraction au rein", () => {
    const { container } = render(MethodePage());
    const text = container.textContent ?? "";
    expect(text).toContain("Organes et strates");
    expect(text).toMatch(/recalculés sur les seuls articles/);
    expect(text).toMatch(/dénominateur de la strate/);
    expect(text).toMatch(/pas la somme/);
    expect(text).toMatch(/mesurée que sur le corpus rein/);
    expect(text).toMatch(/mesurés sur le corpus rein uniquement/);
    for (const c of CAUSAL) expect(text.toLowerCase()).not.toContain(c);
  });
});

describe("en-tete : selecteur d'organe et liens de navigation", () => {
  const organs = getOrganss();
  function getOrganss() {
    return getOrgans();
  }
  const total = (db.prepare("SELECT COUNT(*) AS n FROM articles").get() as { n: number }).n;

  beforeEach(() => {
    push.mockClear();
    pathname = "/allele";
  });

  it("les liens de navigation (menu, logo) reportent l'organe courant", () => {
    const { container } = render(<HeaderContent organ="heart" organs={organs} totalArticles={total} />);
    const hrefs = Array.from(container.querySelectorAll("nav a, a[aria-label*='accueil']")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThanOrEqual(7);
    for (const h of hrefs) expect(h).toContain("organe=coeur");
    expect(hrefs).toContain("/graph?organe=coeur");
  });

  it("en « tous les organes », aucun parametre n'est ajoute", () => {
    const { container } = render(<HeaderContent organ="all" organs={organs} totalArticles={total} />);
    for (const a of Array.from(container.querySelectorAll("nav a"))) {
      expect(a.getAttribute("href")).not.toContain("organe=");
    }
  });

  it("le selecteur liste « Tous les organes » et les sept organes avec leurs effectifs", () => {
    render(<OrganSelector organ="all" organs={organs} totalArticles={total} />);
    fireEvent.click(screen.getByRole("button", { name: /Organe : Tous les organes/ }));
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(8);
    expect(options[0].textContent).toContain("Tous les organes");
    expect(options[1].textContent).toContain("Rein");
    for (const o of organs) {
      expect(screen.getByRole("option", { name: new RegExp(o.label.replace(/[()]/g, ".")) })).toBeTruthy();
    }
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("Tous les organes");
  });

  it("choisir un organe navigue vers la meme page avec ?organe=, autres parametres conserves", () => {
    window.history.pushState({}, "", "/matrice?resolution=4-digit&locus=B");
    pathname = "/matrice";
    render(<OrganSelector organ="all" organs={organs} totalArticles={total} />);
    fireEvent.click(screen.getByRole("button", { name: /Changer d'organe/ }));
    fireEvent.click(screen.getByRole("option", { name: /Foie/ }));
    expect(push).toHaveBeenCalledWith("/matrice?resolution=4-digit&locus=B&organe=foie");
  });

  it("choisir « Tous les organes » retire le parametre", () => {
    window.history.pushState({}, "", "/allele?organe=coeur");
    render(<OrganSelector organ="heart" organs={organs} totalArticles={total} />);
    fireEvent.click(screen.getByRole("button", { name: /Changer d'organe/ }));
    fireEvent.click(screen.getByRole("option", { name: /Tous les organes/ }));
    expect(push).toHaveBeenCalledWith("/allele");
  });

  it("clavier : Echap referme, fleches deplacent le focus", () => {
    render(<OrganSelector organ="kidney" organs={organs} totalArticles={total} />);
    const button = screen.getByRole("button", { name: /Changer d'organe/ });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("sur la carte v1, le selecteur est desactive et le dit", () => {
    pathname = "/carte-v1";
    render(<OrganSelector organ="heart" organs={organs} totalArticles={total} />);
    const button = screen.getByRole("button", { name: /carte v1 est propre au rein/ });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("recherche : l'organe est reporte, un mot d'organe filtre", () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({
          hits: [
            { entityType: "allele", entityId: "HLA-DRB1*15", label: "HLA-DRB1*15", badge: "2-digit", detail: "82 articles · Foie" },
            { entityType: "outcome", entityId: "ABMR", label: "Rejet humoral (ABMR)" },
          ],
          url,
        }),
      })),
    );
  });

  async function open(organ: OrganKey | "all") {
    render(<SearchCommand organ={organ} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Rechercher/ })[1] ?? screen.getAllByRole("button", { name: /Rechercher/ })[0]);
    return screen.getByRole("combobox");
  }

  it("la requete porte l'organe et les resultats menent aux fiches avec l'organe", async () => {
    const input = await open("liver");
    fireEvent.change(input, { target: { value: "DR15" } });
    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 2000 });
    const url = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.at(-1)![0];
    expect(url).toContain("q=DR15");
    expect(url).toContain("organe=foie");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    const hrefs = screen.getAllByRole("option").map((o) => o.querySelector("a")!.getAttribute("href"));
    expect(hrefs).toContain(`/allele/${encodeURIComponent("HLA-DRB1*15")}?organe=foie`);
    expect(hrefs).toContain("/complication/ABMR?organe=foie");
  });

  it("un mot d'organe saisi est lu comme un filtre et retire de la requete", async () => {
    const input = await open("all");
    fireEvent.change(input, { target: { value: "DR15 coeur" } });
    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 2000 });
    const url = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.at(-1)![0];
    expect(url).toContain("q=DR15");
    expect(url).not.toContain("coeur&");
    expect(url).toContain("organe=coeur");
    await waitFor(() => expect(screen.getByText(/Appliquer « Cœur » à tout le site/)).toBeTruthy());
  });

  it("un mot d'organe seul propose d'appliquer le filtre, sans interroger le corpus", async () => {
    const input = await open("all");
    fireEvent.change(input, { target: { value: "GCSH" } });
    await waitFor(() => expect(screen.getByText(/Ajoutez un allèle/)).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Appliquer « Cellules souches/));
    expect(push).toHaveBeenCalled();
    expect(String(push.mock.calls.at(-1)![0])).toContain("organe=gcsh");
  });
});
